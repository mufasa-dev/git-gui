use std::path::Path;
use crate::models::pull::GitPullResult;
use tauri::command;
use crate::utils::git_command;

#[tauri::command]
pub fn open_repo(path: String) -> Result<String, String> {
    if Path::new(&path).join(".git").exists() {
        Ok(format!("Repositório válido em {}", path))
    } else {
        Err("Não é um repositório Git válido".into())
    }
}

#[tauri::command]
pub fn push_repo(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {

    let remote_name = remote.unwrap_or("origin".to_string());
    let branch_name = branch.unwrap_or("HEAD".to_string());

    let output = git_command(&path)
        .args(["push", &remote_name, &branch_name])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[command]
pub fn git_pull(repo_path: String, branch: String) -> Result<GitPullResult, String> {

    let output = git_command(&repo_path)
        .args(["pull", "origin", &branch])
        .output()
        .map_err(|e| format!("Falha ao executar git pull: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        return Ok(GitPullResult {
            success: true,
            message: stdout.to_string(),
            needs_resolution: false,
        });
    }

    // ⚠️ Detecta erro de divergência (padrão do Git)
    if stderr.contains("divergent branches")
        || stderr.contains("Need to specify how to reconcile divergent branches")
    {
        return Ok(GitPullResult {
            success: false,
            message: stderr.to_string(),
            needs_resolution: true,
        });
    }

    // ❌ Outros erros
    Err(stderr.to_string())
}

#[tauri::command]
pub fn fetch_repo(repo_path: String, remote: String) -> Result<String, String> {

    let output = git_command(&repo_path)
        .arg("fetch")
        .arg(&remote)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[command]
pub fn git_config_pull(repo_path: String, mode: String) -> Result<(), String> {
    let value = match mode.as_str() {
        "merge" => "false",
        "rebase" => "true",
        "ff" => "only",
        _ => return Err("Modo inválido. Use merge, rebase ou ff.".into()),
    };

    let output = git_command(&repo_path)
        .args(["config", "pull.rebase", value])
        .output()
        .map_err(|e| format!("Falha ao configurar git: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn get_remote_url(path: String) -> Result<String, String> {
    let output = git_command(&path)
        .args(["remote", "get-url", "origin"])
        .output()
        .map_err(|e| format!("Falha ao executar git: {}", e))?;

    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(url)
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("Erro git: {}", err))
    }
}

#[tauri::command]
pub async fn clone_repo(url: String, target_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&target_path);
    
    if path.exists() && path.is_dir() && path.read_dir().map_err(|e| e.to_string())?.next().is_some() {
        return Err("A pasta de destino já existe e não está vazia. Escolha um novo nome ou pasta.".to_string());
    }

    let parent_dir = path.parent()
        .ok_or("Caminho pai inválido")?
        .to_str()
        .ok_or("Erro de conversão")?;

    let repo_name = path.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nome do repo inválido")?;

    // Roda o clone criando a subpasta
    let output = git_command(parent_dir)
        .args(["clone", &url, repo_name])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(target_path)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.trim().to_string())
    }
}