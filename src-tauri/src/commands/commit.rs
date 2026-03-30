use serde::Serialize;
use tauri::command;
use serde_json::{json, Value};
use crate::utils::git_command;

#[derive(Serialize)]
pub struct Commit {
    hash: String,
    message: String,
    author: String,
    email: String,
    date: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry
 {
    name: String,
    path: String,
    is_dir: bool,
    last_commit: Option<Commit>,
}

#[tauri::command]
pub fn list_commits(path: String, branch: String) -> Result<Vec<Commit>, String> {
    let output = git_command(&path)
        .args(&["log", "--pretty=format:%H|%an|%ae|%ad|%s", &branch, "--"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits: Vec<Commit> = stdout
        .lines()
        .map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            Commit {
                hash: parts.get(0).unwrap_or(&"").to_string(),
                author: parts.get(1).unwrap_or(&"").to_string(),
                email: parts.get(2).unwrap_or(&"").to_string(),
                date: parts.get(3).unwrap_or(&"").to_string(),
                message: parts.get(4).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
pub fn list_user_commits(path: String, branch: String, email: String) -> Result<Vec<Commit>, String> {
    let author_filter = format!("--author={}", email);

    let output = git_command(&path)
        .args(&[
            "log", 
            "--pretty=format:%H|%an|%ae|%ad|%s", 
            &branch, 
            &author_filter,
            "--"
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits: Vec<Commit> = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 5 { return None; }
            
            Some(Commit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                email: parts[2].to_string(),
                date: parts[3].to_string(),
                message: parts[4].to_string(),
            })
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

#[tauri::command]
pub fn get_last_commit_for_path(path: String, branch: String, file_path: String) -> Result<Option<Commit>, String> {
    let mut args = vec![
        "log", 
        "-n", "1", 
        "--pretty=format:%H|%an|%ae|%ad|%s", 
        &branch
    ];

    if !file_path.trim().is_empty() {
        args.push("--");
        args.push(&file_path);
    }

    let output = git_command(&path)
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() { 
        return Ok(None); 
    }

    let line = stdout.lines().next().unwrap_or("");
    let parts: Vec<&str> = line.splitn(5, '|').collect();
    
    if parts.len() < 5 { 
        return Ok(None); 
    }

    Ok(Some(Commit {
        hash: parts[0].to_string(),
        author: parts[1].to_string(),
        email: parts[2].to_string(),
        date: parts[3].to_string(),
        message: parts[4].to_string(),
    }))
}

#[tauri::command]
pub fn get_path_history(path: String, branch: String, file_path: String) -> Result<Vec<Commit>, String> {
    let output = git_command(&path)
        .args(&[
            "log", 
            "--pretty=format:%H|%an|%ae|%ad|%s", 
            "--follow",
            &branch,
            "--", 
            &file_path
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 5 { return None; }
            Some(Commit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                email: parts[2].to_string(),
                date: parts[3].to_string(),
                message: parts[4].to_string(),
            })
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
pub fn list_directory_with_commits(
    repo_path: String, 
    branch: String, 
    folder_path: String
) -> Result<Vec<FileEntry>, String> {
    let target_path = if folder_path.is_empty() || folder_path == "." {
        format!("{}:", branch)
    } else {
        let path_with_slash = if folder_path.ends_with('/') { folder_path.clone() } else { format!("{}/", folder_path) };
        format!("{}:{}", branch, path_with_slash)
    };

    let output = git_command(&repo_path)
        .args(&["ls-tree", "--name-only", &target_path])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for name in stdout.lines() {
        // Constrói o path relativo completo para buscar o commit
        let full_item_path = if folder_path.is_empty() || folder_path == "." {
            name.to_string()
        } else {
            format!("{}/{}", folder_path.trim_end_matches('/'), name)
        };

        // Verifica se é diretório (usando o próprio Git para ser consistente)
        let type_check = git_command(&repo_path)
            .args(&["cat-file", "-t", &format!("{}:{}", branch, full_item_path)])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "blob".to_string());

        // Busca o último commit deste item específico
        let last_commit = get_last_commit_for_path(
            repo_path.clone(), 
            branch.clone(), 
            full_item_path.clone()
        ).unwrap_or(None);

        entries.push(FileEntry {
            name: name.to_string(),
            path: full_item_path,
            is_dir: type_check == "tree",
            last_commit,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return b.is_dir.cmp(&a.is_dir); 
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });

    Ok(entries)
}