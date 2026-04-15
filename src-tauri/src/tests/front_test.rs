use tauri::{Manager, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use serde::Serialize;
use std::fs;
use std::path::Path;
use serde_json::Value;
use tauri::path::BaseDirectory;

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
    test_file: Option<String>
) -> Result<String, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    
    let window_clone = window.clone();
    let app_handle = app.clone(); 
    let is_legacy = is_angular_legacy(&project_path);

    thread::spawn(move || {
        // 1. Define qual arquivo de bridge usar
        let config_name = if is_legacy {
            "karma-bridge-legacy.conf.js"
        } else {
            "karma-bridge.conf.cjs"
        };

        // 2. Localiza o arquivo nos assets do app
        let source_bridge = app_handle.path()
            .resolve(format!("assets/{}", config_name), BaseDirectory::Resource)
            .expect("Falha ao resolver assets");

        // 3. Define um nome temporário e o caminho de destino (raiz do projeto do usuário)
        let temp_bridge_name = ".trident-karma-bridge.tmp.js";
        let target_bridge = Path::new(&project_path).join(temp_bridge_name);

        // 4. Copia o arquivo para garantir que o Angular/Karma consigam ler (evita erros de path no v15)
        if let Err(e) = fs::copy(&source_bridge, &target_bridge) {
            eprintln!("Erro ao copiar bridge para o projeto: {}", e);
        }

        let include_arg = match test_file {
            Some(file) => format!("--include '{}'", file),
            None => "".to_string(),
        };

        // 5. O comando agora aponta para o arquivo que está NA RAIZ do projeto
        let cmd_string = format!(
            "npx ng test --watch=false --progress=false --karma-config='{}' {}", 
            temp_bridge_name, 
            include_arg
        );

        let mut child = Command::new("sh")
            .args(["-c", &cmd_string])
            .current_dir(&project_path) 
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("Falha ao iniciar comando");

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let win_out = window_clone.clone();
        let win_err = window_clone.clone();

        // Thread para STDOUT
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = win_out.emit("test-event", Payload { 
                        file: "STDOUT".into(), status: "running".into(), name: l, error: None 
                    });
                }
            }
        });

        // Thread para STDERR
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = win_err.emit("test-event", Payload { 
                        file: "STDERR".into(), status: "running".into(), name: l, error: None 
                    });
                }
            }
        });

        let _ = child.wait();

        // 6. LIMPEZA: Remove o arquivo temporário da pasta do usuário
        if let Err(e) = fs::remove_file(target_bridge) {
            eprintln!("Erro ao remover bridge temporária: {}", e);
        }

        // Avisa que terminou
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