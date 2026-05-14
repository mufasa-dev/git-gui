use tauri::{Manager, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use serde::Serialize;
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
pub struct Payload {
    pub file: String,
    pub status: String,
    pub name: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn run_dotnet_tests(
    app: AppHandle, 
    project_path: String, 
    test_filter: Option<String>
) -> Result<String, String> {
    let window = app.get_webview_window("main").ok_or("Janela não encontrada")?;
    let window_clone = window.clone();

    // 1. Achar o arquivo de projeto/solução antes de rodar
    let entries: Vec<_> = WalkDir::new(&project_path)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .collect();

    let target_file = entries.iter()
        .find(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            name.contains("test") && name.ends_with(".csproj")
        })
        .or_else(|| {
            entries.iter().find(|e| e.file_name().to_string_lossy().ends_with(".sln"))
        })
        .or_else(|| {
            entries.iter().find(|e| e.file_name().to_string_lossy().ends_with(".csproj"))
        })
        .map(|e| e.path().to_string_lossy().to_string())
        .ok_or_else(|| "Nenhum projeto de teste encontrado".to_string())?;

    let test_project_dir = std::path::Path::new(&target_file)
        .parent()
        .unwrap_or(std::path::Path::new(&project_path))
        .to_path_buf();

    thread::spawn(move || {
        let filter_arg = match test_filter {
            Some(f) => format!("--filter {}", f),
            None => "".to_string(),
        };

        let cmd_string = format!(
            "dotnet test \"{}\" {} --logger \"trx;LogFileName=res.trx\"", 
            target_file, 
            filter_arg
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

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }

        let mut child = command.spawn().expect("Falha ao iniciar dotnet test");

        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);

        // Envia o log em tempo real apenas para feedback visual
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone.emit("test-event", Payload { 
                    file: "DOTNET".into(), status: "running".into(), name: l, error: None 
                });
            }
        }

        let _ = child.wait();

        // --- AQUI ESTÁ A CHAVE: LER O XML ---
        // O dotnet gera por padrão em: {projeto}/TestResults/res.trx
        let trx_path = test_project_dir.join("TestResults").join("res.trx");
        
        if let Ok(xml_content) = std::fs::read_to_string(trx_path) {
            // Envia o XML inteiro como o "name" para o front disparar o parseTrxToEvents
            let _ = window_clone.emit("test-event", Payload { 
                file: "DOTNET_XML".into(), 
                status: "result_xml".into(), 
                name: xml_content, 
                error: None 
            });
        }

        let _ = window_clone.emit("test-event", Payload { 
            file: "SYSTEM".into(), status: "finished".into(), name: "PROCESS_FINISHED".into(), error: None 
        });
    });

    Ok("Execução .NET iniciada".into())
}