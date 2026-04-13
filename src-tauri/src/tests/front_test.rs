use tauri::{Window, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;

#[tauri::command]
pub async fn run_angular_tests(window: Window, project_path: String) {
    thread::spawn(move || {
        let mut child = Command::new("npm")
            .args(["test", "--", "--watch=false"]) // Exemplo para o Angular/Jasmine
            .current_dir(project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("Falha ao iniciar os testes");

        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            if let Ok(line_str) = line {
                // Envia cada linha de log para o frontend em tempo real
                window.emit("test-stdout", line_str).unwrap();
            }
        }
    });
}