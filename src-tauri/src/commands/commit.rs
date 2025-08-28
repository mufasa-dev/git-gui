use std::process::Command;
use serde::Serialize;
use tauri::command;


#[derive(Serialize)]
pub struct Commit {
    hash: String,
    message: String,
    author: String,
    date: String,
}

#[tauri::command]
pub fn list_commits(path: String, branch: String) -> Result<Vec<Commit>, String> {
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
pub fn get_commit_details(path: String, hash: String) -> Result<serde_json::Value, String> {
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


#[command]
pub fn git_commit(repo_path: String, message: String, description: String, amend: bool) -> Result<String, String> {
    // Mensagem final: se tiver descrição, junta com "\n\n"
    let mut full_message = message;
    if !description.trim().is_empty() {
        full_message.push_str("\n\n");
        full_message.push_str(&description);
    }

    let mut args = vec!["commit", "-m", &full_message];
    if amend {
        args.push("--amend");
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}