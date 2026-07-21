use tauri::{Manager, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use serde::Serialize;
use std::fs;
use std::path::Path;
use serde_json::Value;
use tauri::path::BaseDirectory;
use regex::Regex;
use walkdir::WalkDir;
use crate::models::test::{TestCase, TestFile};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;


#[derive(Clone, Serialize)]
pub struct Payload {
    pub file: String,
    pub status: String,
    pub name: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn run_angular_tests(
    app: AppHandle, 
    project_path: String, 
    test_file: Option<String>,
    test_name: Option<String>
) -> Result<String, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    
    let window_clone = window.clone();
    let app_handle = app.clone(); 
    let is_legacy = is_angular_legacy(&project_path);

    thread::spawn(move || {
        let config_name = if is_legacy {
            "karma-bridge-legacy.conf.js"
        } else {
            "karma-bridge.conf.cjs"
        };

        let source_bridge = app_handle.path()
            .resolve(format!("assets/{}", config_name), BaseDirectory::Resource)
            .expect("Falha ao resolver assets");

        let temp_bridge_name = ".trident-karma-bridge.tmp.js";
        let target_bridge = Path::new(&project_path).join(temp_bridge_name);

        if let Err(e) = fs::copy(&source_bridge, &target_bridge) {
            eprintln!("Erro ao copiar bridge para o projeto: {}", e);
        }

        let include_arg = match test_file {
            Some(file) => format!("--include=\"{}\"", file),
            None => "".to_string(),
        };

        // O comando fica apenas com o include (que o Angular aceita perfeitamente)
        let cmd_string = format!(
            "npx ng test --watch=false --progress=false --karma-config=\"{}\" {}", 
            temp_bridge_name, 
            include_arg
        );

        let (shell, arg) = if cfg!(target_os = "windows") {
            ("cmd", "/C")
        } else {
            ("sh", "-c")
        };

        let mut command = Command::new(shell);
        command.args([arg, &cmd_string])
            .current_dir(&project_path) 
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // 👇 AQUI ESTÁ O SEGREDO: Injeta o teste no ambiente do processo se ele existir
        if let Some(name) = test_name {
            let safe_name = name.replace("\"", "");
            command.env("GIT_RIVER_TEST_GREP", safe_name); 
        }

        #[cfg(target_os = "windows")]
        {
            command.creation_flags(0x08000000);
        }

        println!("[Git River] Executando via Env: {}", cmd_string);
        let mut child = command.spawn().expect("Falha ao iniciar comando");
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let win_out = window_clone.clone();
        let win_err = window_clone.clone();

        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    println!("[Rust STDOUT]: {}", l);
                    let _ = win_out.emit("test-event", Payload { 
                        file: "STDOUT".into(), status: "running".into(), name: l, error: None 
                    });
                }
            }
        });

        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    println!("[Rust STDOUT]: {}", l);
                    let _ = win_err.emit("test-event", Payload { 
                        file: "STDERR".into(), status: "running".into(), name: l, error: None 
                    });
                }
            }
        });

        let _ = child.wait();

        if let Err(e) = fs::remove_file(target_bridge) {
            eprintln!("Erro ao remover bridge temporária: {}", e);
        }

        let _ = window_clone.emit("test-event", Payload { 
            file: "SYSTEM".into(), 
            status: "finished".into(), 
            name: "PROCESS_FINISHED".into(), 
            error: None 
        });
    });

    Ok("Execução iniciada".into())
}

fn is_angular_legacy(project_path: &str) -> bool {
    let pkg_path = format!("{}/package.json", project_path);
    if let Ok(content) = fs::read_to_string(pkg_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&content) {
            // Tenta pegar de dependencies ou devDependencies
            let version_value = json["dependencies"]["@angular/core"]
                .as_str()
                .or_else(|| json["devDependencies"]["@angular/core"].as_str());

            if let Some(version) = version_value {
                let v = version.replace("^", "").replace("~", "");
                if let Some(major) = v.split('.').next() {
                    if let Ok(m) = major.parse::<i32>() {
                        return m < 16;
                    }
                }
            }
        }
    }
    false
}

#[tauri::command]
pub async fn get_angular_test_files(project_path: String) -> Result<Vec<TestFile>, String> {
    let mut test_files = Vec::new();
    let src_path = format!("{}/src", project_path);

    let describe_re = Regex::new(r#"describe\s*\(\s*['"\x60](.*?)['"\x60]"#).unwrap();
    let it_re = Regex::new(r#"it\s*\(\s*['"\x60](.*?)['"\x60]"#).unwrap();

    for entry in WalkDir::new(src_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() && path.to_string_lossy().contains(".spec.ts") {
            let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
            let mut found_tests = Vec::new();

            // Guardará todas as estruturas descobertas: (posição_inicio, posição_fim, nome_do_describe)
            let mut describe_scopes = Vec::new();

            // 1. Mapeia a abertura e fechamento real de cada bloco 'describe'
            for cap in describe_re.captures_iter(&content) {
                if let Some(mat) = cap.get(0) {
                    let start_pos = mat.start();
                    let name = cap[1].to_string();

                    // A partir da abertura do describe, vamos caçar onde o bloco dele fecha contando as chaves `{ }`
                    if let Some(open_curly) = content[start_pos..].find('{') {
                        let absolute_open = start_pos + open_curly;
                        let mut brace_count = 1;
                        let mut end_pos = content.len();

                        // Percorre os caracteres seguintes para achar o fechamento correto do escopo
                        for (idx, ch) in content[absolute_open + 1..].char_indices() {
                            if ch == '{' { brace_count += 1; }
                            else if ch == '}' { brace_count -= 1; }

                            if brace_count == 0 {
                                end_pos = absolute_open + 1 + idx;
                                break;
                            }
                        }
                        describe_scopes.push((start_pos, end_pos, name));
                    }
                }
            }

            // 2. Mapeia cada 'it' e descobre a cadeia completa de describes pai onde ele está contido
            for cap in it_re.captures_iter(&content) {
                if let Some(mat) = cap.get(0) {
                    let it_pos = mat.start();
                    let test_name = cap[1].to_string();

                    // Coleta todos os describes ativos na posição desse teste
                    let mut active_hierarchy = Vec::new();
                    for (start, end, name) in &describe_scopes {
                        if it_pos >= *start && it_pos <= *end {
                            active_hierarchy.push((start, name.clone()));
                        }
                    }

                    // Ordena pelo start para garantir a ordem hierárquica (Pai > Filho > Neto)
                    active_hierarchy.sort_by_key(|h| h.0);
                    let hierarchy_names: Vec<String> = active_hierarchy.into_iter().map(|h| h.1).collect();

                    // Se seu front espera apenas o describe principal ("DashboardChatComponent"), use a linha abaixo:
                    let active_suite = hierarchy_names.first().cloned().unwrap_or_else(|| "Unknown Suite".to_string());

                    // Caso seu front precise da árvore montada (ex: "DashboardChatComponent > sendMessage"), troque pela linha abaixo:
                    // let active_suite = if !hierarchy_names.is_empty() { hierarchy_names.join(" > ") } else { "Unknown Suite".to_string() };

                    found_tests.push(TestCase {
                        name: test_name,
                        suite: active_suite,
                    });
                }
            }

            let full_path = path.to_str().unwrap().replace("\\", "/");
            let relative_path = full_path.replace(&project_path.replace("\\", "/"), "");
            let relative_clean = relative_path.trim_start_matches('/').to_string();

            test_files.push(TestFile {
                name: path.file_name().unwrap().to_string_lossy().into(),
                path: relative_clean,
                label: path.file_stem().unwrap().to_string_lossy().replace(".spec", ""),
                tests: found_tests,
            });
        }
    }
    Ok(test_files)
}