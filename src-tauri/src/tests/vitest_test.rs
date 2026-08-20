use crate::models::test::{TestCase, TestFile};
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
pub struct Payload {
    pub file: String,
    pub status: String,
    pub name: String,
    pub error: Option<String>,
}

fn emit_line(window: &tauri::WebviewWindow, source: &str, line: String) {
    let _ = window.emit(
        "test-event",
        Payload {
            file: source.to_string(),
            status: "running".into(),
            name: line,
            error: None,
        },
    );
}

#[tauri::command]
pub async fn run_vitest_tests(
    app: AppHandle,
    project_path: String,
    test_file: Option<String>,
    test_name: Option<String>,
    runner_kind: Option<String>,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    let window_clone = window.clone();
    let output_name = format!(
        ".devbrook-vitest-results-{}.json",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos()
    );
    let output_path = Path::new(&project_path).join(&output_name);

    thread::spawn(move || {
        let executable = if cfg!(target_os = "windows") {
            "npx.cmd"
        } else {
            "npx"
        };
        let output_arg = format!("--outputFile={}", output_path.to_string_lossy());
        let is_jest = runner_kind.as_deref() == Some("jest");
        let mut command = Command::new(executable);
        if is_jest {
            command.args(["jest", "--json", &output_arg]);
        } else {
            command.args(["vitest", "run", "--reporter=json", &output_arg]);
        }
        command
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(file) = test_file.filter(|file| !file.is_empty()) {
            command.arg(file);
        }
        if let Some(name) = test_name.filter(|name| !name.is_empty()) {
            command.args(["-t", &name]);
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                emit_line(&window_clone, "SYSTEM", format!("Falha ao iniciar Vitest: {}", error));
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
                    emit_line(&window, "VITEST", line);
                }
            })
        });
        let stderr_thread = child.stderr.take().map(|stderr| {
            let window = window_clone.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().flatten() {
                    emit_line(&window, "VITEST", line);
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

        if let Ok(results) = fs::read_to_string(&output_path) {
            let _ = window_clone.emit(
                "test-event",
                Payload {
                    file: "VITEST_JSON".into(),
                    status: "result_json".into(),
                    name: results,
                    error: None,
                },
            );
        }

        let _ = fs::remove_file(&output_path);
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

    Ok("Execução Vitest iniciada".into())
}

#[tauri::command]
pub async fn get_vitest_test_files(project_path: String) -> Result<Vec<TestFile>, String> {
    let describe_re = Regex::new(r#"(?:describe|suite)\s*\(\s*['"`]([^'"`]*)['"`]"#)
        .map_err(|error| error.to_string())?;
    let test_re = Regex::new(r#"(?:it|test)\s*\(\s*['"`]([^'"`]*)['"`]"#)
        .map_err(|error| error.to_string())?;
    let mut test_files = Vec::new();

    for entry in WalkDir::new(&project_path)
        .into_iter()
        .filter_entry(|entry| {
            !entry.path().components().any(|component| {
                matches!(component.as_os_str().to_str(), Some(".git" | "node_modules" | "dist" | "coverage"))
            })
        })
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
        let is_test_file = path.is_file()
            && (name.contains(".test.") || name.contains(".spec."));
        if !is_test_file {
            continue;
        }

        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let suite = describe_re
            .captures_iter(&content)
            .last()
            .map(|capture| capture[1].to_string())
            .unwrap_or_else(|| "Vitest".into());
        let tests = test_re
            .captures_iter(&content)
            .map(|capture| TestCase {
                name: capture[1].to_string(),
                suite: suite.clone(),
            })
            .collect();
        let relative_path = path
            .strip_prefix(&project_path)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        test_files.push(TestFile {
            name: name.to_string(),
            path: relative_path,
            label: path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or(name)
                .to_string(),
            tests,
        });
    }

    Ok(test_files)
}
