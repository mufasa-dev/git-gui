use crate::models::test::{TestCase, TestFile};
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
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
    target_path: Option<String>,
    test_file: Option<String>,
    test_name: Option<String>,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Janela não encontrada")?;
    let window_clone = window.clone();

    // 1. Achar o arquivo de projeto/solução antes de rodar
    let entries: Vec<_> = WalkDir::new(&project_path)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .collect();

    let target_file = target_path
        .filter(|path| !path.is_empty())
        .map(|path| {
            let candidate = std::path::Path::new(&path);
            if candidate.is_absolute() {
                candidate.to_path_buf()
            } else {
                std::path::Path::new(&project_path).join(candidate)
            }
        })
        .or_else(|| {
            entries
                .iter()
                .find(|e| {
                    let name = e.file_name().to_string_lossy().to_lowercase();
                    name.contains("test") && name.ends_with(".csproj")
                })
                .or_else(|| {
                    entries.iter().find(|e| {
                        e.file_name()
                            .to_string_lossy()
                            .to_lowercase()
                            .ends_with(".sln")
                    })
                })
                .or_else(|| {
                    entries.iter().find(|e| {
                        e.file_name()
                            .to_string_lossy()
                            .to_lowercase()
                            .ends_with(".csproj")
                    })
                })
                .map(|e| e.path().to_path_buf())
        })
        .ok_or_else(|| "Nenhum projeto de teste encontrado".to_string())?;

    let test_project_dir = std::path::Path::new(&target_file)
        .parent()
        .unwrap_or(std::path::Path::new(&project_path))
        .to_path_buf();

    thread::spawn(move || {
        let mut command = Command::new(if cfg!(target_os = "windows") {
            "dotnet.exe"
        } else {
            "dotnet"
        });
        command
            .arg("test")
            .arg(&target_file)
            .args(["--logger", "trx;LogFileName=res.trx"])
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let _ = test_file;
        if let Some(name) = test_name.filter(|name| !name.is_empty()) {
            let method_name = name.split(" > ").last().unwrap_or(&name).to_string();
            command.arg("--filter").arg(format!("FullyQualifiedName~{}", method_name));
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let _ = window_clone.emit(
                    "test-event",
                    Payload {
                        file: "DOTNET".into(),
                        status: "running".into(),
                        name: format!("Falha ao iniciar dotnet test: {}", error),
                        error: Some(error.to_string()),
                    },
                );
                let _ = window_clone.emit(
                    "test-event",
                    Payload {
                        file: "SYSTEM".into(),
                        status: "finished".into(),
                        name: "PROCESS_FINISHED".into(),
                        error: Some(error.to_string()),
                    },
                );
                return;
            }
        };

        let stdout_thread = child.stdout.take().map(|stdout| {
            let window = window_clone.clone();
            thread::spawn(move || {
                for line in BufReader::new(stdout).lines().flatten() {
                    let _ = window.emit(
                        "test-event",
                        Payload {
                            file: "DOTNET".into(),
                            status: "running".into(),
                            name: line,
                            error: None,
                        },
                    );
                }
            })
        });
        let stderr_thread = child.stderr.take().map(|stderr| {
            let window = window_clone.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().flatten() {
                    let _ = window.emit(
                        "test-event",
                        Payload {
                            file: "DOTNET".into(),
                            status: "running".into(),
                            name: line,
                            error: None,
                        },
                    );
                }
            })
        });

        let exit_status = child.wait().ok();
        if let Some(thread) = stdout_thread {
            let _ = thread.join();
        }
        if let Some(thread) = stderr_thread {
            let _ = thread.join();
        }
        if let Some(status) = exit_status.filter(|status| !status.success()) {
            let _ = window_clone.emit(
                "test-event",
                Payload {
                    file: "DOTNET".into(),
                    status: "running".into(),
                    name: format!("dotnet test terminou com código {}", status),
                    error: None,
                },
            );
        }

        // --- AQUI ESTÁ A CHAVE: LER O XML ---
        // O dotnet gera por padrão em: {projeto}/TestResults/res.trx
        let trx_path = test_project_dir.join("TestResults").join("res.trx");

        if let Ok(xml_content) = std::fs::read_to_string(trx_path) {
            // Envia o XML inteiro como o "name" para o front disparar o parseTrxToEvents
            let _ = window_clone.emit(
                "test-event",
                Payload {
                    file: "DOTNET_XML".into(),
                    status: "result_xml".into(),
                    name: xml_content,
                    error: None,
                },
            );
        }

        let _ = window_clone.emit(
            "test-event",
            Payload {
                file: "SYSTEM".into(),
                status: "finished".into(),
                name: "PROCESS_FINISHED".into(),
                error: None,
            },
        );
    });

    Ok("Execução .NET iniciada".into())
}

#[tauri::command]
pub async fn get_dotnet_test_files(
    project_path: String,
    target_path: Option<String>,
) -> Result<Vec<TestFile>, String> {
    let root = target_path
        .as_deref()
        .and_then(|target| Path::new(target).parent())
        .map(|parent| Path::new(&project_path).join(parent))
        .unwrap_or_else(|| Path::new(&project_path).to_path_buf());
    let class_re = Regex::new(r"class\s+([A-Za-z0-9_]+)").map_err(|error| error.to_string())?;
    let test_re = Regex::new(
        r#"(?s)\[\s*(?:Fact|Test|TestMethod)\b[^\]]*\]\s*(?:public|private|protected|internal)?\s*(?:async\s+)?[A-Za-z0-9_<>,?\[\]]+\s+([A-Za-z0-9_]+)\s*\("#,
    )
    .map_err(|error| error.to_string())?;
    let mut test_files = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|entry| {
            !entry.path().components().any(|component| {
                matches!(component.as_os_str().to_str(), Some(".git" | "bin" | "obj"))
            })
        })
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|extension| extension.to_str()) != Some("cs") {
            continue;
        }
        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let suite = class_re
            .captures(&content)
            .map(|capture| capture[1].to_string())
            .unwrap_or_else(|| "Dotnet".into());
        let tests = test_re
            .captures_iter(&content)
            .map(|capture| TestCase {
                name: capture[1].to_string(),
                suite: suite.clone(),
            })
            .collect::<Vec<_>>();
        if tests.is_empty() {
            continue;
        }
        let relative_path = path
            .strip_prefix(&project_path)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        test_files.push(TestFile {
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("test.cs")
                .to_string(),
            path: relative_path,
            label: suite.clone(),
            tests,
        });
    }

    Ok(test_files)
}
