use std::process::Command;
use serde::Serialize;
use std::path::Path;
use tauri::command;

#[tauri::command]
fn open_repo(path: String) -> Result<String, String> {
    if Path::new(&path).join(".git").exists() {
        Ok(format!("Repositório válido em {}", path))
    } else {
        Err("Não é um repositório Git válido".into())
    }
}

#[tauri::command]
fn list_branches(path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .arg("branch")
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<String> = raw
        .lines()
        .map(|line| line.trim().to_string())
        .collect();

    Ok(branches)
}

#[tauri::command]
fn list_remote_branches(path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .arg("branch")
        .arg("-r")
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let branches = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(branches)
    } else {
        Err("Erro ao listar branches remotas".into())
    }
}

#[derive(Serialize)]
struct Commit {
    hash: String,
    message: String,
    author: String,
    date: String,
}

#[tauri::command]
fn list_commits(path: String, branch: String) -> Result<Vec<Commit>, String> {
    let output = Command::new("git")
        .args(&[
            "log",
            "--pretty=format:%H|%an|%ad|%s",
            &branch
        ])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("Erro ao listar commits".into());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits: Vec<Commit> = stdout
        .lines()
        .map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            Commit {
                hash: parts.get(0).unwrap_or(&"").to_string(),
                author: parts.get(1).unwrap_or(&"").to_string(),
                date: parts.get(2).unwrap_or(&"").to_string(),
                message: parts.get(3).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
fn get_commit_details(path: String, hash: String) -> Result<serde_json::Value, String> {
    use std::process::Command;

    let output = Command::new("git")
        .arg("-C")
        .arg(&path)
        .arg("show")
        .arg("--stat")
        .arg("--pretty=format:%H%n%an%n%ae%n%ad%n%s")
        .arg(&hash)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.split('\n').collect();

    let commit_hash = lines.get(0).unwrap_or(&"").to_string();
    let author_name = lines.get(1).unwrap_or(&"").to_string();
    let author_email = lines.get(2).unwrap_or(&"").to_string();
    let author_date = lines.get(3).unwrap_or(&"").to_string();
    let subject = lines.get(4).unwrap_or(&"").to_string();

    let mut files: Vec<serde_json::Value> = Vec::new();

    for line in lines.iter().skip(5) {
        if line.trim().is_empty() || line.contains("files changed") {
            continue;
        }
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 2 {
            files.push(serde_json::json!({
                "file": parts[0].trim(),
                "changes": parts[1].trim(),
            }));
        }
    }

    Ok(serde_json::json!({
        "hash": commit_hash,
        "authorName": author_name,
        "authorEmail": author_email,
        "authorDate": author_date,
        "subject": subject,
        "files": files
    }))
}

#[tauri::command]
fn list_local_changes(path: String) -> Result<Vec<serde_json::Value>, String> {
    use std::process::Command;

    let output = Command::new("git")
        .arg("-C")
        .arg(&path)
        .arg("status")
        .arg("--porcelain")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut changes = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let status_chars: Vec<char> = line.chars().collect();
        let staged_flag = status_chars[0] != ' ';
        let status_code = format!("{}{}", status_chars[0], status_chars[1]);
        let file_path = line[3..].to_string();

        let status = match status_code.trim() {
            "M" | " M" | "MM" => "modified",
            "A" | " A" => "added",
            "D" | " D" => "deleted",
            "R" | " R" => "renamed",
            "C" | " C" => "copied",
            "??" => "untracked",
            _ => "unknown",
        };

        changes.push(serde_json::json!({
            "path": file_path,
            "status": status,
            "staged": staged_flag
        }));
    }

    Ok(changes)
}

/// Stage arquivos (git add)
#[command]
fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(&path)
        .arg("add")
        .args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

/// Unstage arquivos (git reset)
#[command]
fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(&path)
        .arg("reset")
        .args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_repo, 
            list_branches, 
            list_remote_branches,
            list_commits,
            get_commit_details,
            list_local_changes,
            stage_files,
            unstage_files
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar o app");
}
