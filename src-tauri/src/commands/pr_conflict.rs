use crate::commands::repo::configure_git_auth;
use crate::utils::git_command;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Output;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize)]
pub struct ConflictWorkspace {
    pub workspace_path: String,
    pub source_branch: String,
    pub target_branch: String,
    pub expected_head_sha: String,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ConflictWorkspaceStatus {
    pub conflicts: Vec<String>,
    pub changed_files: Vec<String>,
    pub clean: bool,
}

#[derive(Debug, Serialize)]
pub struct ConflictCommitResult {
    pub commit_sha: String,
    pub pushed: bool,
}

fn validate_ref(value: &str, name: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.contains('\0') || value.starts_with('-') {
        return Err(format!("{} inválida.", name));
    }
    Ok(())
}

fn run_git(repo_path: &str, args: &[String]) -> Result<Output, String> {
    git_command(repo_path)
        .args(args)
        .output()
        .map_err(|error| format!("Falha ao executar Git: {}", error))
}

fn validate_branch(repo_path: &str, branch: &str, name: &str) -> Result<(), String> {
    validate_ref(branch, name)?;
    require_success(run_git(
        repo_path,
        &vec!["check-ref-format".into(), "--branch".into(), branch.to_string()],
    )?)?;
    Ok(())
}

fn run_git_with_auth(
    repo_path: &str,
    args: &[String],
    token: Option<String>,
    provider: Option<String>,
) -> Result<Output, String> {
    let mut command = configure_git_auth(git_command(repo_path), token, provider);
    command
        .args(args)
        .output()
        .map_err(|error| format!("Falha ao executar Git: {}", error))
}

fn output_error(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        stderr
    }
}

fn require_success(output: Output) -> Result<Output, String> {
    if output.status.success() {
        Ok(output)
    } else {
        Err(output_error(&output))
    }
}

fn list_lines(output: Output) -> Vec<String> {
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn conflicts(repo_path: &str) -> Result<Vec<String>, String> {
    let output = require_success(run_git(
        repo_path,
        &vec!["diff".into(), "--name-only".into(), "--diff-filter=U".into()],
    )?)?;
    Ok(list_lines(output))
}

fn changed_files(repo_path: &str) -> Result<Vec<String>, String> {
    let output = require_success(run_git(
        repo_path,
        &vec!["status".into(), "--porcelain=v1".into()],
    )?)?;
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.get(3..).unwrap_or(line).trim().trim_matches('"'))
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn temporary_workspace(repo_path: &str) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let repo_name = Path::new(repo_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repository")
        .replace(['/', '\\', ':'], "-");
    let path = std::env::temp_dir()
        .join("dev-brook-pr-conflicts")
        .join(format!("{}-{}-{}", repo_name, std::process::id(), timestamp));
    fs::create_dir_all(path.parent().unwrap_or_else(|| Path::new(repo_path)))
        .map_err(|error| format!("Não foi possível preparar o workspace temporário: {}", error))?;
    Ok(path)
}

fn remove_workspace(repo_path: &str, workspace_path: &str) {
    let args = vec![
        "worktree".to_string(),
        "remove".to_string(),
        "--force".to_string(),
        workspace_path.to_string(),
    ];
    let _ = run_git(repo_path, &args);
    let _ = fs::remove_dir_all(workspace_path);
}

#[tauri::command]
pub fn prepare_pr_conflict(
    repo_path: String,
    source_branch: String,
    target_branch: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<ConflictWorkspace, String> {
    validate_branch(&repo_path, &source_branch, "Branch de origem")?;
    validate_branch(&repo_path, &target_branch, "Branch de destino")?;

    let source_ref = format!("refs/heads/{}", source_branch);
    let target_ref = format!("refs/heads/{}", target_branch);
    let source_remote_ref = format!("refs/remotes/origin/{}", source_branch);
    let target_remote_ref = format!("refs/remotes/origin/{}", target_branch);

    let fetch_args = vec![
        "fetch".to_string(),
        "origin".to_string(),
        format!("{}:{}", source_ref, source_remote_ref),
        format!("{}:{}", target_ref, target_remote_ref),
    ];
    require_success(run_git_with_auth(&repo_path, &fetch_args, token.clone(), provider.clone())?)?;

    let expected_head_sha = String::from_utf8_lossy(
        &require_success(run_git(
            &repo_path,
            &vec!["rev-parse".into(), source_remote_ref.clone()],
        )?)?
        .stdout,
    )
    .trim()
    .to_string();

    let workspace = temporary_workspace(&repo_path)?;
    let workspace_string = workspace.to_string_lossy().to_string();
    let add_args = vec![
        "worktree".to_string(),
        "add".to_string(),
        "--detach".to_string(),
        workspace_string.clone(),
        source_remote_ref,
    ];
    if let Err(error) = require_success(run_git(&repo_path, &add_args)?) {
        let _ = fs::remove_dir_all(&workspace);
        return Err(error);
    }

    let merge_args = vec!["merge".to_string(), "--no-edit".to_string(), target_remote_ref];
    let merge_output = run_git(&workspace_string, &merge_args)?;
    if merge_output.status.success() {
        remove_workspace(&repo_path, &workspace_string);
        return Err("O PR não possui mais conflitos. Atualize o status e tente novamente.".to_string());
    }
    if !merge_output.status.success() {
        let current_conflicts = conflicts(&workspace_string)?;
        if current_conflicts.is_empty() {
            remove_workspace(&repo_path, &workspace_string);
            return Err(output_error(&merge_output));
        }
    }

    Ok(ConflictWorkspace {
        workspace_path: workspace_string.clone(),
        source_branch,
        target_branch,
        expected_head_sha,
        conflicts: conflicts(&workspace_string)?,
    })
}

#[tauri::command]
pub fn get_pr_conflict_status(workspace_path: String) -> Result<ConflictWorkspaceStatus, String> {
    let conflicts = conflicts(&workspace_path)?;
    let changed_files = changed_files(&workspace_path)?;
    Ok(ConflictWorkspaceStatus {
        clean: changed_files.is_empty(),
        conflicts,
        changed_files,
    })
}

#[tauri::command]
pub fn commit_pr_conflict(
    workspace_path: String,
    source_branch: String,
    expected_head_sha: String,
    message: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<ConflictCommitResult, String> {
    validate_branch(&workspace_path, &source_branch, "Branch de origem")?;
    if message.trim().is_empty() {
        return Err("A mensagem do commit não pode ficar vazia.".to_string());
    }

    let current_conflicts = conflicts(&workspace_path)?;
    if !current_conflicts.is_empty() {
        return Err(format!("Ainda existem {} arquivo(s) conflitante(s).", current_conflicts.len()));
    }

    let remote_sha = String::from_utf8_lossy(
        &require_success(run_git(
            &workspace_path,
            &vec![
                "rev-parse".into(),
                format!("refs/remotes/origin/{}", source_branch),
            ],
        )?)?
        .stdout,
    )
    .trim()
    .to_string();
    if !expected_head_sha.is_empty() && remote_sha != expected_head_sha {
        return Err("A branch do PR foi atualizada enquanto a resolução estava aberta. Recarregue o PR antes de tentar novamente.".to_string());
    }

    require_success(run_git(
        &workspace_path,
        &vec!["add".into(), "--all".into()],
    )?)?;
    if !conflicts(&workspace_path)?.is_empty() {
        return Err("O Git ainda identifica arquivos não mesclados após o stage.".to_string());
    }

    require_success(run_git(
        &workspace_path,
        &vec!["commit".into(), "-m".into(), message],
    )?)?;
    let commit_sha = String::from_utf8_lossy(
        &require_success(run_git(
            &workspace_path,
            &vec!["rev-parse".into(), "HEAD".into()],
        )?)?
        .stdout,
    )
    .trim()
    .to_string();

    let push_ref = format!("HEAD:refs/heads/{}", source_branch);
    let lease = format!("refs/heads/{}:{}", source_branch, expected_head_sha);
    let mut push_args = vec!["push".to_string(), "origin".to_string(), push_ref];
    if !expected_head_sha.is_empty() {
        push_args.push(format!("--force-with-lease={}", lease));
    }
    require_success(run_git_with_auth(
        &workspace_path,
        &push_args,
        token,
        provider,
    )?)?;

    Ok(ConflictCommitResult {
        commit_sha,
        pushed: true,
    })
}

#[tauri::command]
pub fn cleanup_pr_conflict(repo_path: String, workspace_path: String) -> Result<(), String> {
    let root = std::env::temp_dir().join("dev-brook-pr-conflicts");
    let workspace = Path::new(&workspace_path);
    if !workspace.starts_with(&root) {
        return Err("Workspace de conflito inválido.".to_string());
    }
    remove_workspace(&repo_path, &workspace_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_ref;

    #[test]
    fn rejects_invalid_refs() {
        assert!(validate_ref("feature/one", "branch").is_ok());
        assert!(validate_ref("", "branch").is_err());
        assert!(validate_ref("--upload-pack=x", "branch").is_err());
    }
}
