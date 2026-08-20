use crate::models::test::{TestCase, TestFile};
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
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

fn emit_line(window: &tauri::WebviewWindow, line: String) {
    let _ = window.emit(
        "test-event",
        Payload {
            file: "RUST".into(),
            status: "running".into(),
            name: line,
            error: None,
        },
    );
}

#[tauri::command]
pub async fn run_rust_tests(
    app: AppHandle,
    project_path: String,
    target_path: Option<String>,
    test_file: Option<String>,
    test_name: Option<String>,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    let window_clone = window.clone();

    thread::spawn(move || {
        let manifest = target_path
            .filter(|path| !path.is_empty())
            .map(|path| Path::new(&project_path).join(path));
        let mut command = Command::new(if cfg!(target_os = "windows") { "cargo.exe" } else { "cargo" });
        command
            .arg("test")
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(manifest) = manifest {
            command.args(["--manifest-path", &manifest.to_string_lossy()]);
        }
        if let Some(name) = test_name.filter(|name| !name.is_empty()) {
            command.args(["--", &name]);
        } else if let Some(file) = test_file.filter(|file| !file.is_empty()) {
            let file_stem = Path::new(&file)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("");
            if !file_stem.is_empty() {
                command.args(["--", file_stem]);
            }
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                emit_line(&window_clone, format!("Falha ao iniciar cargo test: {}", error));
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
                    emit_line(&window, line);
                }
            })
        });
        let stderr_thread = child.stderr.take().map(|stderr| {
            let window = window_clone.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().flatten() {
                    emit_line(&window, line);
                }
            })
        });

        let _ = child.wait();
        if let Some(thread) = stdout_thread {
            let _ = thread.join();
        }
        if let Some(thread) = stderr_thread {
            let _ = thread.join();
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

    Ok("Execução Rust iniciada".into())
}

#[tauri::command]
pub async fn get_rust_test_files(
    project_path: String,
    target_path: Option<String>,
) -> Result<Vec<TestFile>, String> {
    let root = target_path
        .as_deref()
        .and_then(|target| Path::new(target).parent())
        .map(|parent| Path::new(&project_path).join(parent))
        .unwrap_or_else(|| PathBuf::from(&project_path));
    let test_re = Regex::new(
        r#"#\s*\[\s*(?:test|tokio::test|async_std::test)\s*\][\s\r\n]*(?:pub\s+)?fn\s+([A-Za-z0-9_]+)"#,
    )
    .map_err(|error| error.to_string())?;
    let mut test_files = Vec::new();

    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|entry| {
            !entry.path().components().any(|component| {
                matches!(component.as_os_str().to_str(), Some(".git" | "target"))
            })
        })
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|extension| extension.to_str()) != Some("rs") {
            continue;
        }

        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let suite = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("Rust")
            .to_string();
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
                .unwrap_or("test.rs")
                .to_string(),
            path: relative_path,
            label: suite,
            tests,
        });
    }

    Ok(test_files)
}
