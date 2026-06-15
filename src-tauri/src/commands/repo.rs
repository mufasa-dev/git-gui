use std::path::Path;
use crate::models::pull::GitPullResult;
use tauri::command;
use crate::utils::git_command;
use std::process::Command;
use base64::{engine::general_purpose, Engine as _};

#[tauri::command]
pub fn open_repo(path: String) -> Result<String, String> {
    if Path::new(&path).join(".git").exists() {
        Ok(format!("Repositório válido em {}", path))
    } else {
        Err("Não é um repositório Git válido".into())
    }
}

fn configure_git_auth(
    mut cmd: Command,
    token: Option<String>,
    provider: Option<String>,
) -> Command {
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_ASKPASS", "true");
    cmd.env("SSH_ASKPASS", "true");
    cmd.env("GCM_INTERACTIVE", "never");

    if let Some(t) = token {
        if !t.trim().is_empty() {
            let current_provider = provider.unwrap_or_else(|| "github".to_string());

            let header = if current_provider == "azure" {
                let auth_string = format!(":{}", t.trim());
                let encoded_auth = general_purpose::STANDARD.encode(auth_string);
                format!("Authorization: Basic {}", encoded_auth)
            } else {
                let auth_string = format!("{}:", t.trim());
                let encoded_auth = general_purpose::STANDARD.encode(auth_string);
                format!("Authorization: Basic {}", encoded_auth)
            };

            cmd.args(["-c", &format!("http.extraHeader={}", header)]);
        }
    }
    cmd
}

#[tauri::command]
pub fn push_repo(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    token: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {

    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let branch_name = branch.unwrap_or_else(|| "HEAD".to_string());

    let mut cmd = git_command(&path);
    
    cmd = configure_git_auth(cmd, token, provider);

    let output = cmd
        .args(["push", "-u", &remote_name, &branch_name])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        
        if err_msg.contains("fatal: could not read Password") || 
           err_msg.contains("Authentication failed") ||
           err_msg.contains("terminal prompts disabled") {
            return Err("Erro de Autenticação: Seu token expirou ou é inválido para este repositório.".to_string());
        }
        
        Err(err_msg)
    }
}

#[tauri::command]
pub fn git_pull(
    repo_path: String, 
    branch: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<GitPullResult, String> {

    let mut cmd = git_command(&repo_path);
    cmd = configure_git_auth(cmd, token, provider);

    let output = cmd
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

    if stderr.contains("fatal: could not read Password") || 
       stderr.contains("Authentication failed") ||
       stderr.contains("terminal prompts disabled") {
        return Err("Erro de Autenticação: Seu token expirou ou é inválido para este repositório.".to_string());
    }

    if stderr.contains("divergent branches") || stderr.contains("Need to specify how to reconcile divergent branches") {
        return Ok(GitPullResult {
            success: false,
            message: stderr.to_string(),
            needs_resolution: true,
        });
    }

    Err(stderr.to_string())
}

#[tauri::command]
pub fn fetch_repo(
    repo_path: String, 
    remote: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {

    let mut cmd = git_command(&repo_path);
    cmd = configure_git_auth(cmd, token, provider);

    let output = cmd
        .arg("fetch")
        .arg(&remote)
        .output()
        .map_err(|e| e.to_string())?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        if stderr.contains("fatal: could not read Password") || 
           stderr.contains("Authentication failed") ||
           stderr.contains("terminal prompts disabled") {
            return Err("Erro de Autenticação: Seu token expirou ou é inválido para este repositório.".to_string());
        }
        Err(stderr.to_string())
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

    let output = std::process::Command::new("git")
        .current_dir(parent_dir)
        .args(["clone", &url, repo_name])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    std::thread::sleep(std::time::Duration::from_millis(200));

    let has_commits = std::process::Command::new("git")
        .current_dir(&target_path)
        .args(["rev-parse", "HEAD"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !has_commits {
        return Ok("EMPTY_REPO".to_string());
    }

    Ok(target_path)
}