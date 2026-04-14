use tauri::{Manager, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use serde::Serialize;
use tauri::path::BaseDirectory;

#[derive(Clone, Serialize)]
pub struct Payload {
    pub file: String,
    pub status: String,
    pub name: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn run_angular_tests(app: AppHandle, project_path: String) -> Result<String, String> {
    // No v2, use get_webview_window para a janela "main"
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    
    let window_clone = window.clone();
    let app_handle = app.clone(); 

    thread::spawn(move || {
        let bridge_path = app_handle.path()
            .resolve("assets/karma-bridge.conf.cjs", BaseDirectory::Resource)
            .expect("Falha ao resolver caminho")
            .to_string_lossy()
            .to_string();

        // Usamos 'sh -c' para garantir que o ambiente do sistema seja carregado
        let cmd_string = format!(
            "cd '{}' && npx ng test --watch=false --progress=false --karma-config='{}'", 
            project_path, 
            bridge_path
        );

        let mut child = Command::new("sh")
            .args(["-c", &cmd_string])
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped()) // CAPTURAR ERROS AQUI É VITAL
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
                    // Emitimos a linha pura, o frontend decide o que ela é
                    let _ = win_out.emit("test-event", Payload { 
                        file: "STDOUT".into(), status: "running".into(), name: l, error: None 
                    });
                }
            }
        });

        // Thread para STDERR (Para você saber por que não está rodando)
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    // IMPORTANTE: Removido o "ERROR: " manual. 
                    // Se a linha contiver "SPEC_RESULT", ela deve ir limpa.
                    let _ = win_err.emit("test-event", Payload { 
                        file: "STDERR".into(), status: "running".into(), name: l, error: None 
                    });
                }
            }
        });

        let _ = child.wait();

        let _ = window_clone.emit("test-event", Payload { 
            file: "SYSTEM".into(), 
            status: "finished".into(), 
            name: "PROCESS_FINISHED".into(), 
            error: None 
        });
    });

    Ok("Execução iniciada".into())
}