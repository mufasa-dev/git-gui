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
use super::process::{clear_process, take_stderr, take_stdout, track_child, wait_for_exit};

#[derive(Clone, Serialize)]
pub struct Payload {
    pub file: String,
    pub status: String,
    pub name: String,
    pub error: Option<String>,
}

fn escape_filter_value(value: &str) -> String {
    value.chars().fold(String::new(), |mut escaped, character| {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '(' => escaped.push_str("\\("),
            ')' => escaped.push_str("\\)"),
            '&' => escaped.push_str("\\&"),
            '|' => escaped.push_str("\\|"),
            '=' => escaped.push_str("\\="),
            '!' => escaped.push_str("\\!"),
            '~' => escaped.push_str("\\~"),
            _ => escaped.push(character),
        }
        escaped
    })
}

fn path_from_project(project_path: &str, path: &str) -> std::path::PathBuf {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        Path::new(project_path).join(candidate)
    }
}

fn project_for_test_file(project_path: &str, test_file: Option<&str>) -> Option<std::path::PathBuf> {
    let test_file = test_file.filter(|path| !path.is_empty())?;
    let source_path = path_from_project(project_path, test_file);
    let mut best_match: Option<std::path::PathBuf> = None;

    for entry in WalkDir::new(project_path)
        .max_depth(6)
        .into_iter()
        .filter_entry(|entry| {
            !entry.path().components().any(|component| {
                matches!(component.as_os_str().to_str(), Some(".git" | "bin" | "obj"))
            })
        })
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("csproj") {
            continue;
        }

        let Some(parent) = path.parent() else { continue };
        if source_path.starts_with(parent)
            && best_match
                .as_deref()
                .and_then(Path::parent)
                .map_or(true, |current| parent.components().count() > current.components().count())
        {
            best_match = Some(path.to_path_buf());
        }
    }

    best_match
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

    let requested_target = target_path
        .as_deref()
        .filter(|path| !path.is_empty())
        .map(|path| path_from_project(&project_path, path));
    let file_target = project_for_test_file(&project_path, test_file.as_deref());
    let target_file = match (requested_target, file_target) {
        (Some(target), Some(project)) if target.extension().and_then(|extension| extension.to_str()) == Some("sln") => project,
        (Some(target), _) => target,
        (None, Some(project)) => project,
        (None, None) => entries
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
            .map(|entry| entry.path().to_path_buf())
            .ok_or_else(|| "Nenhum projeto de teste encontrado".to_string())?,
    };

    let test_project_dir = target_file
        .parent()
        .unwrap_or(Path::new(&project_path))
        .to_path_buf();
    let report_name = format!(
        ".devbrook-test-results-{}.trx",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos()
    );
    let report_path = test_project_dir.join("TestResults").join(&report_name);

    thread::spawn(move || {
        let mut command = Command::new(if cfg!(target_os = "windows") {
            "dotnet.exe"
        } else {
            "dotnet"
        });
        command
            .arg("test")
            .arg(&target_file)
            .args(["--logger", &format!("trx;LogFileName={}", report_name)])
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(name) = test_name.filter(|name| !name.is_empty()) {
            command
                .arg("--filter")
                .arg(format!("FullyQualifiedName~{}", escape_filter_value(&name)));
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }

        let child = match command.spawn() {
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

        let process = track_child(child);
        let stdout_thread = take_stdout(&process).ok().flatten().map(|stdout| {
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
        let stderr_thread = take_stderr(&process).ok().flatten().map(|stderr| {
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

        let process_result = wait_for_exit(&process).ok();
        clear_process(&process);
        let was_stopped = process_result.as_ref().map(|result| result.stopped).unwrap_or(false);
        let exit_status = process_result.as_ref().map(|result| result.status);
        if !was_stopped {
            if let Some(thread) = stdout_thread {
                let _ = thread.join();
            }
            if let Some(thread) = stderr_thread {
                let _ = thread.join();
            }
        }
        if !was_stopped {
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
        }

        // --- AQUI ESTÁ A CHAVE: LER O XML ---
        // O dotnet gera o relatório em {projeto}/TestResults com um nome único por execução.
        if !was_stopped {
            if let Ok(xml_content) = std::fs::read_to_string(&report_path) {
                // Envia o XML inteiro como o "name" para o front disparar o parseTrxToEvents.
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
        }
        let _ = fs::remove_file(&report_path);

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

#[cfg(test)]
mod tests {
    use super::{escape_filter_value, project_for_test_file};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_project() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("devbrook-dotnet-{}", suffix));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn escapes_dotnet_filter_syntax() {
        assert_eq!(
            escape_filter_value("Namespace.Class.Method(value)&other"),
            "Namespace.Class.Method\\(value\\)\\&other"
        );
    }

    #[test]
    fn resolves_the_deepest_project_for_a_test_file() {
        let path = temporary_project();
        fs::create_dir_all(path.join("tests/nested")).unwrap();
        fs::write(path.join("tests/tests.csproj"), "<Project />").unwrap();
        fs::write(path.join("tests/nested/nested.csproj"), "<Project />").unwrap();
        fs::write(path.join("tests/nested/cases.cs"), "").unwrap();

        let resolved = project_for_test_file(
            path.to_str().unwrap(),
            Some("tests/nested/cases.cs"),
        );
        assert_eq!(resolved, Some(path.join("tests/nested/nested.csproj")));

        fs::remove_dir_all(path).unwrap();
    }
}
