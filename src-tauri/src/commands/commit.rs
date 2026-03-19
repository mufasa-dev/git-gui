use serde::Serialize;
use tauri::command;
use serde_json::{json, Value};
use crate::utils::git_command;

#[derive(Serialize)]
pub struct Commit {
    hash: String,
    message: String,
    author: String,
    date: String,
}

#[tauri::command]
pub fn list_commits(path: String, branch: String) -> Result<Vec<Commit>, String> {
    let output = git_command(&path)
        .args(&["log", "--pretty=format:%H|%an|%ad|%s", &branch, "--"])
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

#[command]
pub fn get_commit_details(path: String, hash: String) -> Result<Value, String> {
    // 1. Executa o comando com --name-status (caminhos completos, sem abreviação)
    let output = git_command(&path)
        .arg("show")
        .arg("--name-status") 
        .arg("--pretty=format:%H%n%an%n%ae%n%ad%n%s%n%b%n%P")
        .arg(&hash)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.split('\n').collect();

    // 2. Parse dos metadados (fixos no topo devido ao format do pretty)
    let commit_hash = lines.get(0).unwrap_or(&"").to_string();
    let author_name = lines.get(1).unwrap_or(&"").to_string();
    let author_email = lines.get(2).unwrap_or(&"").to_string();
    let author_date = lines.get(3).unwrap_or(&"").to_string();
    let subject = lines.get(4).unwrap_or(&"").to_string();

    // 3. Captura o Body e identifica onde começam os Parents/Arquivos
    let mut body_lines = Vec::new();
    let mut idx = 5;
    while idx < lines.len() {
        let line = lines[idx];
        // Se a linha tem 40 caracteres (SHA) ou múltiplos SHAs, são os parents
        if line.len() == 40 || (line.contains(' ') && line.split_whitespace().all(|h| h.len() == 40)) {
            break; 
        }
        body_lines.push(line);
        idx += 1;
    }
    let body = body_lines.join("\n").trim().to_string();

    // 4. Parents
    let parents_line = lines.get(idx).unwrap_or(&"");
    let parents: Vec<String> = parents_line
        .split_whitespace()
        .map(|p| p.to_string())
        .collect();

    // 5. Arquivos (Usando a lógica do --name-status)
    let mut files: Vec<Value> = Vec::new();
    // Pulamos a linha dos parents para começar a lista de arquivos
    for line in lines.iter().skip(idx + 1) {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        // O --name-status retorna: "M\tpath/to/file.txt" ou "A  file.txt"
        // O split_whitespace lida com tabs ou espaços
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 2 {
            files.push(json!({
                "file": parts[1].trim(),   // Caminho real completo
                "status": parts[0].trim(), // M, A, D, R...
                "changes": ""              // Mantido para não quebrar o front
            }));
        }
    }

    Ok(json!({
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

    let output = git_command(&repo_path)
        .args(&args)
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
    let diff_output = git_command(&repo_path)
        .arg("diff")
        .arg(format!("{}^!", commit_sha)) 
        .arg("--")
        .arg(&file_path)
        .output()
        .map_err(|e| e.to_string())?;

    let diff_text = String::from_utf8_lossy(&diff_output.stdout).to_string();

    Ok(serde_json::json!({
        "diff": diff_text,
        "oldFile": file_path,
        "newFile": file_path
    }))
}