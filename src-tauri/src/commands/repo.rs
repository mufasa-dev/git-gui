use crate::models::pull::GitPullResult;
use crate::utils::{git_command, git_command_async};
use base64::{engine::general_purpose, Engine as _};
use git2::{BranchType, Repository, Status, StatusEntry, StatusOptions};
use serde::Serialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::command;
use tokio::process::Command as TokioCommand;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    branches: Vec<serde_json::Value>,
    remote_branches: Vec<String>,
    active_branch: Option<String>,
    local_changes: Vec<serde_json::Value>,
    local_changes_count: usize,
    git_revision: Option<String>,
    status_signature: String,
}

fn status_path(entry: &StatusEntry<'_>) -> Option<PathBuf> {
    entry
        .index_to_workdir()
        .and_then(|diff| diff.new_file().path().or_else(|| diff.old_file().path()))
        .or_else(|| {
            entry
                .head_to_index()
                .and_then(|diff| diff.new_file().path().or_else(|| diff.old_file().path()))
        })
        .map(Path::to_path_buf)
}

fn status_label(status: Status, staged: bool) -> &'static str {
    if status.contains(Status::CONFLICTED) {
        return "conflicted";
    }

    if staged {
        if status.contains(Status::INDEX_NEW) {
            "added"
        } else if status.contains(Status::INDEX_DELETED) {
            "deleted"
        } else if status.contains(Status::INDEX_RENAMED) {
            "renamed"
        } else if status.contains(Status::INDEX_TYPECHANGE) {
            "modified"
        } else {
            "modified"
        }
    } else if status.contains(Status::WT_NEW) {
        "untracked"
    } else if status.contains(Status::WT_DELETED) {
        "deleted"
    } else if status.contains(Status::WT_RENAMED) {
        "renamed"
    } else {
        "modified"
    }
}

fn snapshot_change(repo_path: &Path, relative_path: &Path, status: Status, staged: bool) -> serde_json::Value {
    let file_path = repo_path.join(relative_path);
    let size = std::fs::metadata(&file_path).map(|metadata| metadata.len()).unwrap_or(0);
    let extension = relative_path.extension().and_then(|value| value.to_str()).unwrap_or("");

    json!({
        "path": relative_path.to_string_lossy().replace('\\', "/"),
        "status": status_label(status, staged),
        "staged": staged,
        "extension": extension,
        "size": size,
        "lineCount": null,
        "isBinary": false,
        "isPreviewable": true,
    })
}

fn repository_snapshot_from_git(repo_path: &str) -> Result<RepositorySnapshot, String> {
    let repository = Repository::open(repo_path).map_err(|error| error.to_string())?;
    let mut branches = Vec::new();

    for branch_result in repository.branches(Some(BranchType::Local)).map_err(|error| error.to_string())? {
        let (branch, _) = branch_result.map_err(|error| error.to_string())?;
        let Some(name) = branch.name().map_err(|error| error.to_string())? else { continue };
        let local_target = branch.get().target();
        let upstream = branch.upstream().ok();
        let upstream_target = upstream.as_ref().and_then(|value| value.get().target());
        let (ahead, behind) = match (local_target, upstream_target) {
            (Some(local), Some(remote)) => repository.graph_ahead_behind(local, remote).unwrap_or((0, 0)),
            _ => (0, 0),
        };

        branches.push(json!({
            "name": name,
            "ahead": ahead,
            "behind": behind,
            "hasUpstream": upstream.is_some(),
        }));
    }

    let remote_branches = repository
        .branches(Some(BranchType::Remote))
        .map_err(|error| error.to_string())?
        .filter_map(|branch_result| {
            let (branch, _) = branch_result.ok()?;
            let name = branch.name().ok()??.to_string();
            (!name.ends_with("/HEAD")).then_some(name)
        })
        .collect::<Vec<_>>();

    let head = repository.head().ok();
    let active_branch = head.as_ref().and_then(|value| value.shorthand()).map(str::to_string);
    let git_revision = head.and_then(|value| value.target()).map(|value| value.to_string());

    let mut status_options = StatusOptions::new();
    status_options.include_untracked(true);
    let statuses = repository.statuses(Some(&mut status_options)).map_err(|error| error.to_string())?;
    let mut local_changes = Vec::new();

    for entry in statuses.iter().filter(|entry| entry.status() != Status::CURRENT) {
        let status = entry.status();
        let Some(relative_path) = status_path(&entry) else { continue };
        let staged = status.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        );
        let worktree = status.intersects(
            Status::WT_NEW
                | Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE,
        );

        if staged {
            local_changes.push(snapshot_change(Path::new(repo_path), &relative_path, status, true));
        }
        if worktree {
            local_changes.push(snapshot_change(Path::new(repo_path), &relative_path, status, false));
        }
    }

    let local_changes_count = local_changes.len();

    Ok(RepositorySnapshot {
        branches,
        remote_branches,
        active_branch,
        local_changes_count,
        local_changes,
        git_revision,
        status_signature: local_changes_count.to_string(),
    })
}

#[tauri::command]
pub async fn get_repository_snapshot(path: String) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || repository_snapshot_from_git(&path))
        .await
        .map_err(|error| format!("Falha ao carregar o snapshot do repositório: {}", error))?
}

#[tauri::command]
pub fn open_repo(path: String) -> Result<String, String> {
    if Path::new(&path).join(".git").exists() {
        Ok(format!("Repositório válido em {}", path))
    } else {
        Err("Não é um repositório Git válido".into())
    }
}

fn auth_header(token: Option<String>, provider: Option<String>) -> Option<String> {
    let token = token?.trim().to_string();
    if token.is_empty() {
        return None;
    }

    let current_provider = provider.unwrap_or_else(|| "github".to_string());
    let auth_string = if current_provider == "azure" {
        format!(":{}", token)
    } else {
        format!("{}:", token)
    };
    let encoded_auth = general_purpose::STANDARD.encode(auth_string);
    Some(format!("Authorization: Basic {}", encoded_auth))
}

pub fn configure_git_auth(
    mut cmd: Command,
    token: Option<String>,
    provider: Option<String>,
) -> Command {
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_ASKPASS", "true");
    cmd.env("SSH_ASKPASS", "true");
    cmd.env("GCM_INTERACTIVE", "never");

    if let Some(header) = auth_header(token, provider) {
        cmd.args(["-c", &format!("http.extraHeader={}", header)]);
    }
    cmd
}

pub fn configure_git_auth_async(
    mut cmd: TokioCommand,
    token: Option<String>,
    provider: Option<String>,
) -> TokioCommand {
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_ASKPASS", "true");
    cmd.env("SSH_ASKPASS", "true");
    cmd.env("GCM_INTERACTIVE", "never");

    if let Some(header) = auth_header(token, provider) {
        cmd.args(["-c", &format!("http.extraHeader={}", header)]);
    }
    cmd
}

#[tauri::command]
pub async fn push_repo(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    token: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let branch_name = branch.unwrap_or_else(|| "HEAD".to_string());

    let mut cmd = git_command_async(&path);
    cmd = configure_git_auth_async(cmd, token, provider);

    let output = cmd
        .args(["push", "-u", &remote_name, &branch_name])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();

        if err_msg.contains("fatal: could not read Password")
            || err_msg.contains("Authentication failed")
            || err_msg.contains("terminal prompts disabled")
        {
            return Err(
                "Erro de Autenticação: Seu token expirou ou é inválido para este repositório."
                    .to_string(),
            );
        }

        Err(err_msg)
    }
}

#[tauri::command]
pub async fn git_pull(
    repo_path: String,
    branch: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<GitPullResult, String> {
    let mut cmd = git_command_async(&repo_path);
    cmd = configure_git_auth_async(cmd, token, provider);

    let output = cmd
        .args(["pull", "origin", &branch])
        .output()
        .await
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

    if stderr.contains("fatal: could not read Password")
        || stderr.contains("Authentication failed")
        || stderr.contains("terminal prompts disabled")
    {
        return Err(
            "Erro de Autenticação: Seu token expirou ou é inválido para este repositório."
                .to_string(),
        );
    }

    if stderr.contains("divergent branches")
        || stderr.contains("Need to specify how to reconcile divergent branches")
    {
        return Ok(GitPullResult {
            success: false,
            message: stderr.to_string(),
            needs_resolution: true,
        });
    }

    Err(stderr.to_string())
}

#[tauri::command]
pub async fn pull_branch_without_checkout(
    repo_path: String,
    branch: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {
    let mut cmd = git_command_async(&repo_path);
    cmd = configure_git_auth_async(cmd, token, provider);
    let local_refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    let remote_refspec = format!("refs/heads/{branch}:refs/remotes/origin/{branch}");

    let output = cmd
        .args(["fetch", "origin", &remote_refspec, &local_refspec])
        .output()
        .await
        .map_err(|error| format!("Falha ao executar pull da branch: {}", error))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("fatal: could not read Password")
        || stderr.contains("Authentication failed")
        || stderr.contains("terminal prompts disabled")
    {
        return Err(
            "Erro de Autenticação: Seu token expirou ou é inválido para este repositório."
                .to_string(),
        );
    }

    Err(stderr.to_string())
}

#[tauri::command]
pub async fn fetch_repo(
    repo_path: String,
    remote: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {
    let mut cmd = git_command_async(&repo_path);
    cmd = configure_git_auth_async(cmd, token, provider);

    let output = cmd
        .arg("fetch")
        .arg(&remote)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        if stderr.contains("fatal: could not read Password")
            || stderr.contains("Authentication failed")
            || stderr.contains("terminal prompts disabled")
        {
            return Err(
                "Erro de Autenticação: Seu token expirou ou é inválido para este repositório."
                    .to_string(),
            );
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
    let output = git_command_async(&path)
        .args(["remote", "get-url", "origin"])
        .output()
        .await
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

    if path.exists()
        && path.is_dir()
        && path.read_dir().map_err(|e| e.to_string())?.next().is_some()
    {
        return Err(
            "A pasta de destino já existe e não está vazia. Escolha um novo nome ou pasta."
                .to_string(),
        );
    }

    let parent_dir = path
        .parent()
        .ok_or("Caminho pai inválido")?
        .to_str()
        .ok_or("Erro de conversão")?;

    let repo_name = path
        .file_name()
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
