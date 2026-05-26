use tauri::{Manager, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use std::fs;
use std::path::Path;
use serde::Serialize;
use regex::Regex;
use walkdir::WalkDir;
use crate::models::test::{TestCase, TestFile};

#[derive(Clone, Serialize)]
pub struct Payload {
    pub file: String,
    pub status: String,
    pub name: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn run_go_tests(
    app: AppHandle, 
    project_path: String, 
    test_file: Option<String>,
    test_name: Option<String>
) -> Result<String, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    
    let window_clone = window.clone();

    thread::spawn(move || {
        // Por padrão, roda recursivamente em todo o workspace
        let mut target_dir = "./...".to_string();
        let mut run_filter: Option<String> = None;

        // 1. Se um arquivo específico foi passado, descobrimos o diretório dele (Go testa por package/diretório)
        if let Some(file) = &test_file {
            if !file.is_empty() {
                if let Some(parent) = Path::new(file).parent() {
                    let dir_str = parent.to_string_lossy().to_string();
                    target_dir = if dir_str.is_empty() || dir_str == "." {
                        "./".to_string()
                    } else {
                        format!("./{}", dir_str)
                    };
                }
            }
        }

        // 2. Se o nome de um teste ou subteste específico foi passado, montamos o filtro regex do Go
        if let Some(name) = test_name {
            if !name.is_empty() {
                // Se a UI mandar "TestSuite > SubTest", convertemos para "TestSuite/SubTest"
                // Se mandar apenas "SubTest", usamos ".* /SubTest" para o Go achar em qualquer suite
                let clean_name = if name.contains(" > ") {
                    name.replace(" > ", "/")
                } else {
                    format!(".*/{}", name)
                };
                
                // Remove espaços extras que possam quebrar a regex do terminal
                run_filter = Some(clean_name.replace(" ", ""));
            }
        }

        // Monta a string do comando base do Go com JSON stream ativo
        let mut cmd_string = format!("go test {} -v -json", target_dir);
        
        if let Some(filter) = run_filter {
            cmd_string = format!("go test {} -v -json -run \"{}\"", target_dir, filter);
        }

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

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;

            command.creation_flags(0x08000000);
        }

        println!("[Git River] Executando comando Go: {}", cmd_string);
        let mut child = command.spawn().expect("Falha ao iniciar go test");

        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone.emit("test-event", Payload { 
                    file: "GO_JSON".into(), 
                    status: "running".into(), 
                    name: l, 
                    error: None 
                });
            }
        }

        let _ = child.wait();

        let _ = window_clone.emit("test-event", Payload { 
            file: "SYSTEM".into(), 
            status: "finished".into(), 
            name: "PROCESS_FINISHED".into(), 
            error: None 
        });
    });

    Ok("Execução Go iniciada".into())
}

#[tauri::command]
pub async fn get_go_test_files(project_path: String) -> Result<Vec<TestFile>, String> {
    let mut test_files = Vec::new();

    // Regex para capturar funções de teste principais: func TestNome(t *testing.T)
    let test_func_re = Regex::new(r"func\s+(Test[A-Za-z0-9_]+)\s*\(\s*[A-Za-z0-9_]+\s+\*testing\.T\s*\)").unwrap();
    // Regex para capturar t.Run("SubTeste", ...) suportando aspas normais ou crases de Go
    let t_run_re = Regex::new(r#"t\.Run\s*\(\s*['"\x60](.*?)['"\x60]"#).unwrap();

    for entry in WalkDir::new(&project_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        // Ignora a pasta .git e foca apenas em arquivos com extensão _test.go
        if path.is_file() && path.to_string_lossy().ends_with("_test.go") {
            let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
            let mut found_tests = Vec::new();

            // Encontra a função de teste principal no arquivo para usar como o nome da Suíte
            // Go costuma ter uma única função principal ou poucas por arquivo.
            let suite_name = test_func_re.captures(&content)
                .map(|cap| cap[1].to_string())
                .unwrap_or_else(|| "Unknown Go Suite".to_string());

            // Varre o arquivo procurando os subtestes internos t.Run
            for cap in t_run_re.captures_iter(&content) {
                found_tests.push(TestCase {
                    name: cap[1].to_string(),
                    suite: suite_name.clone(),
                });
            }

            // Se o arquivo tiver uma função TestXxx mas nenhum t.Run interno,
            // adicionamos a própria função principal como teste individual para a UI não ficar vazia
            if found_tests.is_empty() && suite_name != "Unknown Go Suite" {
                found_tests.push(TestCase {
                    name: suite_name.clone(),
                    suite: suite_name.clone(),
                });
            }

            let full_path = path.to_str().unwrap().replace("\\", "/");
            let relative_path = full_path.replace(&project_path.replace("\\", "/"), "");
            let relative_clean = relative_path.trim_start_matches('/').to_string();

            test_files.push(TestFile {
                name: path.file_name().unwrap().to_string_lossy().into(),
                path: relative_clean,
                label: path.file_stem().unwrap().to_string_lossy().replace("_test", ""),
                tests: found_tests,
            });
        }
    }
    Ok(test_files)
}