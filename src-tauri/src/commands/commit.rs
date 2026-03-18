use serde::Serialize;
use std::process::Command;
use tauri::command;
use git2::{DiffFormat, DiffOptions, Repository};

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
        .args(&["log", "--pretty=format:%H|%an|%ad|%s", &branch, "--"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(Vec::new());
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
        .arg("--pretty=format:%H%n%an%n%ae%n%ad%n%s%n%b%n%P")
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

    // O body pode ter múltiplas linhas, então pegamos até antes dos parents
    let mut body_lines = Vec::new();
    let mut idx = 5;
    while idx < lines.len() {
        if lines[idx].len() == 40 || lines[idx].split_whitespace().all(|h| h.len() == 40) {
            break; // chegamos nos parents
        }
        if !lines[idx].contains('|') && !lines[idx].contains("changed") {
            body_lines.push(lines[idx]);
        }
        idx += 1;
    }
    let body = body_lines.join("\n");

    // Parents ficam na última linha antes da lista de arquivos
    let parents_line = lines.get(idx).unwrap_or(&"");
    let parents: Vec<String> = parents_line
        .split_whitespace()
        .map(|p| p.to_string())
        .collect();

    // Agora capturamos os arquivos (restante das linhas depois dos pais)
    let mut files: Vec<serde_json::Value> = Vec::new();
    for line in lines.iter().skip(idx + 1) {
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
        "body": body,
        "parents": parents,
        "files": files
    }))
}

#[command]
pub fn git_commit(
    repo_path: String,
    message: String,
    description: String,
    amend: bool,
) -> Result<String, String> {
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

#[tauri::command]
pub async fn get_commit_file_diff(repo_path: String, commit_sha: String, file_path: String) -> Result<serde_json::Value, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let commit = repo.revparse_single(&commit_sha).map_err(|e| e.to_string())?
        .peel_to_commit().map_err(|e| e.to_string())?;
    
    let tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0).map_err(|e| e.to_string())?.tree().map_err(|e| e.to_string())?)
    } else {
        None
    };

    let mut opts = DiffOptions::new();
    opts.pathspec(&file_path);

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(|e| e.to_string())?;

    let mut diff_text = String::new();
    
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        match origin {
            '+' | '-' | ' ' | 'H' => { // 'H' é o header do hunk (@@)
                if let Ok(s) = std::str::from_utf8(line.content()) {
                    if origin != 'H' {
                        diff_text.push(origin);
                    }
                    diff_text.push_str(s);
                }
            }
            _ => {}
        }
        true
    }).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "diff": diff_text,
        "oldFile": file_path,
        "newFile": file_path
    }))
}