use tauri::{Manager, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use serde::Serialize;

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
    test_filter: Option<String>
) -> Result<String, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    
    let window_clone = window.clone();

    thread::spawn(move || {
        // -v para verbosidade, -json para saída estruturada
        // ./... executa todos os testes do projeto recursivamente
        let mut cmd_string = "go test ./... -v -json".to_string();
        
        if let Some(filter) = test_filter {
            if !filter.is_empty() {
                cmd_string = format!("go test ./... -v -json -run {}", filter);
            }
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
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = command.spawn().expect("Falha ao iniciar go test");

        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            if let Ok(l) = line {
                // Enviamos a linha JSON bruta para o parser no front-end
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