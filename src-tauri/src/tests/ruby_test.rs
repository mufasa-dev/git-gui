use crate::models::test::{TestCase, TestFile};
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
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

fn emit_line(window: &tauri::WebviewWindow, line: String) {
    let _ = window.emit(
        "test-event",
        Payload {
            file: "RUBY".into(),
            status: "running".into(),
            name: line,
            error: None,
        },
    );
}

fn is_excluded(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(
            component.as_os_str().to_str(),
            Some(".git" | "vendor" | ".bundle" | "tmp" | "coverage")
        )
    })
}

fn ruby_test_paths(project_path: &str, is_rspec: bool) -> Vec<PathBuf> {
    WalkDir::new(project_path)
        .into_iter()
        .filter_entry(|entry| !is_excluded(entry.path()))
        .filter_map(Result::ok)
        .map(|entry| entry.path().to_path_buf())
        .filter(|path| {
            let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
            path.is_file()
                && path.extension().and_then(|extension| extension.to_str()) == Some("rb")
                && if is_rspec {
                    name.ends_with("_spec.rb")
                        || path.components().any(|component| component.as_os_str() == "spec")
                } else {
                    name.ends_with("_test.rb")
                        || name.starts_with("test_")
                        || path.components().any(|component| component.as_os_str() == "test")
                }
        })
        .collect()
}

#[tauri::command]
pub async fn run_ruby_tests(
    app: AppHandle,
    project_path: String,
    target_path: Option<String>,
    test_file: Option<String>,
    test_name: Option<String>,
    runner_kind: Option<String>,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    let window_clone = window.clone();
    let is_rspec = runner_kind.as_deref() != Some("ruby-minitest");
    let has_gemfile = Path::new(&project_path).join("Gemfile").exists();
    let output_path = Path::new(&project_path).join(format!(
        ".devbrook-ruby-results-{}.json",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos()
    ));
    let selected_file = test_file.filter(|file| !file.is_empty());
    let selected_name = test_name.filter(|name| !name.is_empty());

    thread::spawn(move || {
        let mut command = if has_gemfile {
            let mut command = if cfg!(target_os = "windows") {
                Command::new("bundle.bat")
            } else {
                Command::new("bundle")
            };
            command.args(["exec"]);
            command
        } else if is_rspec {
            Command::new(if cfg!(target_os = "windows") { "rspec.bat" } else { "rspec" })
        } else {
            Command::new(if cfg!(target_os = "windows") { "ruby.exe" } else { "ruby" })
        };

        if has_gemfile {
            command.arg(if is_rspec { "rspec" } else { "ruby" });
        }
        if is_rspec {
            command.args(["--format", "json", "--out", &output_path.to_string_lossy()]);
            if let Some(file) = selected_file.as_deref() {
                command.arg(file);
            }
            if let Some(name) = selected_name.as_deref() {
                command.args(["--example", name]);
            }
        } else {
            command.arg("-Itest");
            let files = selected_file
                .as_ref()
                .map(|file| vec![Path::new(file).to_path_buf()])
                .unwrap_or_else(|| ruby_test_paths(&project_path, false));
            for file in files {
                command.arg(file);
            }
            command.arg("--verbose");
            if let Some(name) = selected_name.as_deref() {
                command.args(["--name", name]);
            }
        }
        let _ = target_path;
        command
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                emit_line(&window_clone, format!("Falha ao iniciar o runner Ruby: {}", error));
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

        if is_rspec {
            if let Ok(report) = fs::read_to_string(&output_path) {
                let _ = window_clone.emit(
                    "test-event",
                    Payload {
                        file: "RUBY_JSON".into(),
                        status: "result_json".into(),
                        name: report,
                        error: None,
                    },
                );
            }
            let _ = fs::remove_file(output_path);
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

    Ok("Execução Ruby iniciada".into())
}

#[tauri::command]
pub async fn get_ruby_test_files(
    project_path: String,
    target_path: Option<String>,
    runner_kind: Option<String>,
) -> Result<Vec<TestFile>, String> {
    let is_rspec = runner_kind.as_deref() != Some("ruby-minitest");
    let describe_re = Regex::new(r#"(?:describe|context)\s*(?:\(\s*)?['"`]([^'"`]*)['"`]"#)
        .map_err(|error| error.to_string())?;
    let example_re = Regex::new(r#"(?:it|specify)\s*(?:\(\s*)?['"`]([^'"`]*)['"`]"#)
        .map_err(|error| error.to_string())?;
    let class_re = Regex::new(r"class\s+([A-Za-z0-9_:]+)").map_err(|error| error.to_string())?;
    let minitest_re = Regex::new(r"def\s+(test_[A-Za-z0-9_!?]+)").map_err(|error| error.to_string())?;
    let mut test_files = Vec::new();

    for path in ruby_test_paths(&project_path, is_rspec) {
        let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let suite = if is_rspec {
            describe_re
                .captures_iter(&content)
                .last()
                .map(|capture| capture[1].to_string())
                .unwrap_or_else(|| "RSpec".into())
        } else {
            class_re
                .captures(&content)
                .map(|capture| capture[1].to_string())
                .unwrap_or_else(|| "Minitest".into())
        };
        let tests = if is_rspec {
            example_re
                .captures_iter(&content)
                .map(|capture| TestCase {
                    name: capture[1].to_string(),
                    suite: suite.clone(),
                })
                .collect::<Vec<_>>()
        } else {
            minitest_re
                .captures_iter(&content)
                .map(|capture| TestCase {
                    name: capture[1].to_string(),
                    suite: suite.clone(),
                })
                .collect::<Vec<_>>()
        };
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
                .unwrap_or("test.rb")
                .to_string(),
            path: relative_path,
            label: suite.clone(),
            tests,
        });
    }

    let _ = target_path;
    Ok(test_files)
}
