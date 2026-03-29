use serde_json::{json};
use serde::Serialize;
use std::process::Stdio;
use crate::utils::{git_command_async};
use base64::{Engine as _, engine::general_purpose};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentResponse {
    pub is_image: bool,
    pub content: String,
    pub size: usize,
    pub line_count: Option<usize>,
}

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<String>, String> {
    let output = git_command_async(&path)
        .arg("branch")
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<String> = raw.lines().map(|line| line.trim().to_string()).collect();

    Ok(branches)
}

#[tauri::command]
pub async fn list_remote_branches(path: String) -> Result<Vec<String>, String> {
    let output = git_command_async(&path)
        .arg("branch")
        .arg("-r")
        .stdout(Stdio::piped())
        .output()
        .await 
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let branches = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|s| !s.is_empty() && !s.contains("->"))
            .collect();
        Ok(branches)
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Erro ao listar branches remotas: {}", err_msg))
    }
}

#[tauri::command]
pub async fn get_branch_status(repo_path: String) -> Result<Vec<serde_json::Value>, String> {
    // Retorna: "nome| [ahead X, behind Y]" ou "nome|"
    let output = git_command_async(&repo_path)
        .args([
            "for-each-ref",
            "--format=%(refname:short)|%(upstream:track)",
            "refs/heads/",
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 2 { continue; }

        let name = parts[0];
        let track = parts[1]; // Ex: "[ahead 1, behind 2]"

        let mut ahead = 0;
        let mut behind = 0;
        let has_upstream = !track.is_empty();

        if has_upstream {
            for segment in track.trim_matches(|c| c == '[' || c == ']').split(',') {
                let s = segment.trim();
                if s.starts_with("ahead ") {
                    ahead = s["ahead ".len()..].parse::<u32>().unwrap_or(0);
                } else if s.starts_with("behind ") {
                    behind = s["behind ".len()..].parse::<u32>().unwrap_or(0);
                }
            }
        }

        branches.push(json!({
            "name": name,
            "ahead": ahead,
            "behind": behind,
            "hasUpstream": has_upstream
        }));
    }

    Ok(branches)
}

#[tauri::command]
pub async fn get_current_branch(path: String) -> Result<String, String> {
    let output = git_command_async(&path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn checkout_branch(repo_path: String, branch: String) -> Result<String, String> {
    let output = git_command_async(&repo_path)
        .arg("checkout")
        .arg(&branch)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn create_branch(
    repo_path: String, 
    branch_name: String, 
    branch_type: String, 
    base_branch: String, 
    checkout: bool
) -> Result<String, String> {
    let full_branch_name = match branch_type.as_str() {
        "feature" => format!("feature/{}", branch_name),
        "hotfix" => format!("hotfix/{}", branch_name),
        "release" => format!("release/{}", branch_name),
        _ => branch_name.clone(),
    };

    let mut create_cmd = git_command_async(&repo_path);

    if checkout {
        create_cmd.args(["checkout", "-b", &full_branch_name, &base_branch]);
    } else {
        create_cmd.args(["branch", &full_branch_name, &base_branch]);
    }

    let output = create_cmd.output().await.map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(full_branch_name)
}

#[tauri::command]
pub async fn checkout_remote_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let local_name = branch_name.replace("origin/", "");
    let output = git_command_async(&repo_path)
        .args(["checkout", "-b", &local_name, "--track", &format!("origin/{}", local_name)])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("Sucesso: Branch {} criada.", local_name))
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        if err.contains("already exists") {
            let retry = git_command_async(&repo_path)
                .args(["checkout", &local_name])
                .output().await.map_err(|e| e.to_string())?;
            if retry.status.success() {
                return Ok(format!("Alternado para branch local: {}", local_name));
            }
        }
        Err(err)
    }
}

#[tauri::command]
pub async fn delete_branch(path: String, branch: String, force: bool) -> Result<(), String> {
    let flag = if force { "-D" } else { "-d" };
    let output = git_command_async(&path)
        .args(["branch", flag, &branch])
        .output().await.map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_remote_branch(path: String, branch: String, remote: Option<String>) -> Result<(), String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let output = git_command_async(&path)
        .args(["push", &remote_name, "--delete", &branch])
        .output().await.map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn list_branch_files(path: String, branch: String) -> Result<Vec<String>, String> {
    let output = git_command_async(&path)
        .args(["ls-tree", "-r", "--name-only", &branch])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let files: Vec<String> = raw
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(files)
}

#[tauri::command]
pub async fn get_branch_file_content(
    path: String, 
    branch: String, 
    file_path: String
) -> Result<FileContentResponse, String> {
    let target = format!("{}:{}", branch, file_path);

    let output = git_command_async(&path)
        .args(["show", &target])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!("Erro ao ler arquivo: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let raw_bytes = &output.stdout;
    let size = raw_bytes.len();
    let ext = file_path.split('.').last().unwrap_or("").to_lowercase();
    let is_image = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "ico" | "gif" | "webp");

    if is_image {
        let b64 = general_purpose::STANDARD.encode(raw_bytes);
        Ok(FileContentResponse {
            is_image: true,
            content: format!("data:image/{};base64,{}", ext, b64),
            size,
            line_count: None,
        })
    } else {
        let content = String::from_utf8_lossy(raw_bytes).to_string();
        let line_count = Some(content.lines().count());

        Ok(FileContentResponse {
            is_image: false,
            content,
            size,
            line_count,
        })
    }
}