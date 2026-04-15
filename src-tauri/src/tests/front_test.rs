use tauri::{Manager, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use serde::Serialize;
use std::fs;
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
    test_file: Option<String> // Novo parâmetro opcional
) -> Result<String, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    
    let window_clone = window.clone();
    let app_handle = app.clone(); 

    let is_legacy = is_angular_legacy(&project_path);

    thread::spawn(move || {
        // 2. Escolher o arquivo de configuração correto
        let config_file = if is_legacy {
            "assets/karma-bridge-legacy.conf.js"
        } else {
            "assets/karma-bridge.conf.cjs"
        };

        let bridge_path = app_handle.path()
            .resolve(config_file, BaseDirectory::Resource)
            .expect("Falha ao resolver caminho")
            .to_string_lossy()
            .to_string();

        let include_arg = match test_file {
            Some(file) => format!("--include '{}'", file),
            None => "".to_string(),
        };

        let cmd_string = format!(
            "npx ng test --watch=false --progress=false --karma-config='{}' {}", 
            bridge_path,
            include_arg
        );

        let mut child = Command::new("sh")
            .args(["-c", &cmd_string])
            .current_dir(&project_path) // Garante que o npx rode no contexto do projeto
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
            if let Some(version) = json["dependencies"]["@angular/core"].as_str() {
                // Se a versão começar com ^12, ^13, 14, 15...
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