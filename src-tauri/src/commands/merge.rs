use crate::utils::git_command;
use std::io::Write;

#[tauri::command]
pub fn merge_branch(
    repo_path: String,
    from_branch: String,
    to_branch: String,
) -> Result<String, String> {
    // Primeiro: garantir que estamos na branch destino
    let checkout_output = git_command(&repo_path)
        .arg("checkout")
        .arg(&to_branch)
        .output()
        .map_err(|e| e.to_string())?;

    if !checkout_output.status.success() {
        return Err(String::from_utf8_lossy(&checkout_output.stderr).to_string());
    }

    // Agora: fazer o merge da origem na destino
    let merge_output = git_command(&repo_path)
        .arg("merge")
        .arg(&from_branch)
        .output()
        .map_err(|e| e.to_string())?;

    if !merge_output.status.success() {
        return Err(String::from_utf8_lossy(&merge_output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&merge_output.stdout).to_string())
}

/// Mensagem preparada pelo git para concluir um merge/cherry-pick/revert com conflito
/// (`.git/MERGE_MSG`), sem as linhas de comentário. Lê só arquivos, sem chamar o git.
#[tauri::command]
pub fn get_merge_message(repo_path: String) -> Result<Option<String>, String> {
    let repo = match git2::Repository::open(&repo_path) {
        Ok(repo) => repo,
        Err(_) => return Ok(None),
    };
    let git_dir = repo.path();

    let in_progress = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]
        .iter()
        .any(|name| git_dir.join(name).is_file());
    if !in_progress {
        return Ok(None);
    }

    let raw = match std::fs::read_to_string(git_dir.join("MERGE_MSG")) {
        Ok(content) => content,
        Err(_) => return Ok(None),
    };

    let message = raw
        .lines()
        .filter(|line| !line.starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n");
    let message = message.trim();

    Ok(if message.is_empty() { None } else { Some(message.to_string()) })
}

#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;

    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

const WORKTREE_EDIT_MAX_BYTES: u64 = 5 * 1024 * 1024;

fn resolve_worktree_path(repo_path: &str, file: &str) -> Result<std::path::PathBuf, String> {
    let repo = std::fs::canonicalize(repo_path)
        .map_err(|e| format!("Repositório inválido: {}", e))?;
    let relative = std::path::Path::new(file);
    if relative.is_absolute()
        || relative
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Caminho de arquivo inválido".to_string());
    }

    let full = repo.join(relative);
    let parent = full
        .parent()
        .ok_or_else(|| "Caminho de arquivo inválido".to_string())?;
    let parent = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
    if !parent.starts_with(&repo) {
        return Err("O arquivo está fora do repositório".to_string());
    }
    Ok(full)
}

#[tauri::command]
pub fn read_worktree_file(repo_path: String, file: String) -> Result<String, String> {
    let full = resolve_worktree_path(&repo_path, &file)?;
    let metadata = std::fs::metadata(&full).map_err(|e| e.to_string())?;
    if metadata.len() > WORKTREE_EDIT_MAX_BYTES {
        return Err("Arquivo grande demais para editar aqui. Abra no VS Code.".to_string());
    }

    let bytes = std::fs::read(&full).map_err(|e| e.to_string())?;
    if bytes.iter().take(8 * 1024).any(|b| *b == 0) {
        return Err("Arquivo binário não pode ser editado aqui.".to_string());
    }

    String::from_utf8(bytes)
        .map_err(|_| "O arquivo não está em UTF-8 e não pode ser editado aqui.".to_string())
}

#[tauri::command]
pub fn save_worktree_file(repo_path: String, file: String, content: String) -> Result<(), String> {
    let full = resolve_worktree_path(&repo_path, &file)?;
    std::fs::write(&full, content.as_bytes()).map_err(|e| e.to_string())
}
