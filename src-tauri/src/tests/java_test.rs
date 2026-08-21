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
use super::process::{clear_process, take_stderr, take_stdout, track_child, wait_for_exit};

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
            file: "JAVA".into(),
            status: "running".into(),
            name: line,
            error: None,
        },
    );
}

fn target_file(project_path: &str, target_path: Option<String>) -> PathBuf {
    target_path
        .filter(|path| !path.is_empty())
        .map(|path| {
            let candidate = Path::new(&path);
            if candidate.is_absolute() {
                candidate.to_path_buf()
            } else {
                Path::new(project_path).join(candidate)
            }
        })
        .unwrap_or_else(|| Path::new(project_path).to_path_buf())
}

fn report_files(target: &Path, is_gradle: bool) -> Vec<PathBuf> {
    let project_dir = target.parent().unwrap_or(target);
    let roots = if is_gradle {
        vec![
            project_dir.join("build/test-results/test"),
            project_dir.join("build/test-results"),
        ]
    } else {
        vec![project_dir.join("target/surefire-reports")]
    };

    roots
        .into_iter()
        .flat_map(|root| {
            WalkDir::new(root)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry.path().is_file()
                        && entry.path().extension().and_then(|extension| extension.to_str()) == Some("xml")
                })
                .map(|entry| entry.path().to_path_buf())
                .collect::<Vec<_>>()
        })
        .collect()
}

#[tauri::command]
pub async fn run_java_tests(
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
    let target = target_file(&project_path, target_path);
    let is_gradle = target
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with("build.gradle"))
        .unwrap_or(false);

    thread::spawn(move || {
        let mut command = if is_gradle {
            let project_dir = target.parent().unwrap_or(Path::new(&project_path));
            let wrapper = if cfg!(target_os = "windows") {
                project_dir.join("gradlew.bat")
            } else {
                project_dir.join("gradlew")
            };
            if wrapper.exists() {
                Command::new(wrapper)
            } else if cfg!(target_os = "windows") {
                Command::new("gradle.bat")
            } else {
                Command::new("gradle")
            }
        } else if cfg!(target_os = "windows") {
            Command::new("mvn.cmd")
        } else {
            Command::new("mvn")
        };

        let test_class = test_file
            .filter(|file| !file.is_empty())
            .and_then(|file| {
                Path::new(&file)
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .map(str::to_string)
            });
        if is_gradle {
            if let Some(project_dir) = target.parent() {
                command.args(["--project-dir", &project_dir.to_string_lossy()]);
            }
            command.args(["test", "--console=plain"]);
            if let Some(name) = test_name.filter(|name| !name.is_empty()) {
                let method_name = name.split(" > ").last().unwrap_or(&name).to_string();
                command.arg("--tests").arg(method_name);
            } else if let Some(class_name) = test_class {
                command.arg("--tests").arg(class_name);
            }
        } else {
            command.args(["-f", &target.to_string_lossy(), "test"]);
            if let Some(name) = test_name.filter(|name| !name.is_empty()) {
                let method_name = name.split(" > ").last().unwrap_or(&name).to_string();
                command.arg(format!("-Dtest=*#{}", method_name));
            } else if let Some(class_name) = test_class {
                command.arg(format!("-Dtest={}", class_name));
            }
        }
        command
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                emit_line(&window_clone, format!("Falha ao iniciar o runner Java: {}", error));
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

        let process = track_child(child);
        let stdout_thread = take_stdout(&process).ok().flatten().map(|stdout| {
            let window = window_clone.clone();
            thread::spawn(move || {
                for line in BufReader::new(stdout).lines().flatten() {
                    emit_line(&window, line);
                }
            })
        });
        let stderr_thread = take_stderr(&process).ok().flatten().map(|stderr| {
            let window = window_clone.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().flatten() {
                    emit_line(&window, line);
                }
            })
        });

        let process_result = wait_for_exit(&process).ok();
        clear_process(&process);
        let was_stopped = process_result.as_ref().map(|result| result.stopped).unwrap_or(false);
        if !was_stopped {
            if let Some(thread) = stdout_thread {
                let _ = thread.join();
            }
            if let Some(thread) = stderr_thread {
                let _ = thread.join();
            }
        }

        if !was_stopped {
            for report in report_files(&target, is_gradle) {
                if let Ok(xml) = fs::read_to_string(report) {
                    let _ = window_clone.emit(
                        "test-event",
                        Payload {
                            file: "JAVA_XML".into(),
                            status: "result_xml".into(),
                            name: xml,
                            error: None,
                        },
                    );
                }
            }
        }

        let _ = window_clone.emit(
            "test-event",
            Payload {
                file: "SYSTEM".into(),
                status: "finished".into(),
                name: if was_stopped { "PROCESS_STOPPED" } else { "PROCESS_FINISHED" }.into(),
                error: None,
            },
        );
    });

    Ok("Execução Java iniciada".into())
}

#[tauri::command]
pub async fn get_java_test_files(
    project_path: String,
    target_path: Option<String>,
) -> Result<Vec<TestFile>, String> {
    let root = target_path
        .as_deref()
        .and_then(|target| Path::new(target).parent())
        .map(|parent| Path::new(&project_path).join(parent))
        .unwrap_or_else(|| PathBuf::from(&project_path));
    let class_re = Regex::new(r"class\s+([A-Za-z0-9_]+)").map_err(|error| error.to_string())?;
    let test_re = Regex::new(
        r#"(?s)@\s*(?:org\.(?:junit|testng)\.[A-Za-z0-9_.]+\.)?(?:Test|ParameterizedTest|TestFactory)\b[^\r\n]*[\r\n]+\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:synchronized\s+)?[A-Za-z0-9_<>,?\[\]]+\s+([A-Za-z0-9_]+)\s*\("#,
    )
    .map_err(|error| error.to_string())?;
    let mut test_files = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|entry| {
            !entry.path().components().any(|component| {
                matches!(component.as_os_str().to_str(), Some(".git" | "target" | "build" | ".gradle"))
            })
        })
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|extension| extension.to_str()) != Some("java") {
            continue;
        }
        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let suite = class_re
            .captures(&content)
            .map(|capture| capture[1].to_string())
            .unwrap_or_else(|| "Java".into());
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
                .unwrap_or("Test.java")
                .to_string(),
            path: relative_path,
            label: suite,
            tests,
        });
    }

    Ok(test_files)
}
