use crate::{
    models::branch::{FileContentResponse, FileMetadataResponse},
    utils::git_command_async,
};
use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use std::process::Stdio;
use tokio::io::AsyncReadExt;

const PREVIEW_MAX_BYTES: usize = 2 * 1024 * 1024;
const PREVIEW_MAX_LINES: usize = 1000;

fn is_unsupported_extension(file_path: &str) -> bool {
    let extension = file_path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "zip"
            | "rar"
            | "7z"
            | "tar"
            | "gz"
            | "exe"
            | "bin"
            | "dll"
            | "so"
            | "dylib"
            | "mp4"
            | "mkv"
            | "mov"
            | "mp3"
            | "ogg"
            | "wav"
            | "avi"
            | "webm"
            | "pdf"
            | "doc"
            | "docx"
            | "xls"
            | "xlsx"
            | "ppt"
            | "pptx"
            | "ifc"
            | "bim"
            | "rvt"
            | "rfa"
            | "nwd"
            | "nwc"
            | "blend"
            | "fbx"
            | "obj"
            | "gltf"
            | "glb"
            | "3d"
            | "3dm"
            | "3mf"
            | "x3d"
            | "3ds"
            | "max"
            | "ma"
            | "mb"
            | "step"
            | "stp"
            | "iges"
            | "igs"
            | "dwg"
            | "dxf"
            | "e57"
            | "las"
            | "laz"
            | "psd"
            | "ai"
            | "skp"
            | "dae"
            | "stl"
    )
}

fn is_binary_bytes(bytes: &[u8]) -> bool {
    bytes.contains(&0) || std::str::from_utf8(bytes).is_err()
}

fn preview_text(bytes: &[u8]) -> (String, usize, bool) {
    let byte_limit = bytes.len() > PREVIEW_MAX_BYTES;
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(PREVIEW_MAX_BYTES)]);
    let mut content = String::new();
    let mut line_count = 0;
    let mut truncated = byte_limit;

    for line in text.split_inclusive('\n') {
        if line_count >= PREVIEW_MAX_LINES {
            truncated = true;
            break;
        }
        content.push_str(line);
        line_count += 1;
    }

    if !text.is_empty()
        && !text.ends_with('\n')
        && line_count < PREVIEW_MAX_LINES
        && content.len() < text.len()
    {
        content.push_str(&text[content.len()..]);
        line_count += 1;
    }

    if content.len() < text.len() {
        truncated = true;
    }

    (content, line_count, truncated)
}

async fn bounded_git_show(repo_path: &str, target: &str) -> Result<(Vec<u8>, bool), String> {
    let mut child = git_command_async(repo_path)
        .args(["show", target])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Não foi possível ler o arquivo".to_string())?;
    let mut bytes = Vec::with_capacity(PREVIEW_MAX_BYTES + 1);
    stdout
        .take((PREVIEW_MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .await
        .map_err(|error| error.to_string())?;
    let truncated = bytes.len() > PREVIEW_MAX_BYTES;

    if truncated {
        let _ = child.kill().await;
    }

    let status = child.wait().await.map_err(|error| error.to_string())?;
    if !status.success() && !truncated {
        return Err("Não foi possível ler o arquivo na branch".to_string());
    }

    Ok((bytes, truncated))
}

async fn branch_file_size(repo_path: &str, target: &str) -> Result<usize, String> {
    let output = git_command_async(repo_path)
        .args(["cat-file", "-s", target])
        .output()
        .await
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<usize>()
        .map_err(|error| error.to_string())
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
        if parts.len() < 2 {
            continue;
        }

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
    checkout: bool,
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
pub async fn checkout_remote_branch(
    repo_path: String,
    branch_name: String,
) -> Result<String, String> {
    let local_name = branch_name.replace("origin/", "");
    let output = git_command_async(&repo_path)
        .args([
            "checkout",
            "-b",
            &local_name,
            "--track",
            &format!("origin/{}", local_name),
        ])
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
                .output()
                .await
                .map_err(|e| e.to_string())?;
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
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_remote_branch(
    path: String,
    branch: String,
    remote: Option<String>,
) -> Result<(), String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let output = git_command_async(&path)
        .args(["push", &remote_name, "--delete", &branch])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn list_branch_files(path: String, branch: String) -> Result<Vec<String>, String> {
    let output = git_command_async(&path)
        .args(["ls-tree", "-r", "-z", "--name-only", &branch])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let files: Vec<String> = raw
        .split('\0')
        .map(|line| line.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(files)
}

#[tauri::command]
pub async fn list_branch_files_with_size(
    path: String,
    branch: String,
) -> Result<Vec<(String, u64)>, String> {
    let output = git_command_async(&path)
        .args(["ls-tree", "-r", "-l", "-z", &branch])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = output.stdout;
    let mut files = Vec::new();

    for entry in stdout.split(|&b| b == 0) {
        if entry.is_empty() {
            continue;
        }

        let line = String::from_utf8_lossy(entry);

        if let Some((info, name)) = line.split_once('\t') {
            let parts: Vec<&str> = info.split_whitespace().collect();
            if parts.len() >= 4 {
                let size = parts[3].parse::<u64>().unwrap_or(0);
                files.push((name.to_string(), size));
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn get_branch_file_content(
    path: String,
    branch: String,
    file_path: String,
) -> Result<FileContentResponse, String> {
    let target = format!("{}:{}", branch, file_path);
    let size = branch_file_size(&path, &target).await?;
    let ext = file_path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let is_image = matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "ico" | "gif" | "webp"
    );

    if is_unsupported_extension(&file_path) || size > PREVIEW_MAX_BYTES {
        return Ok(FileContentResponse {
            is_image: false,
            is_binary: true,
            is_previewable: false,
            content: String::new(),
            size,
            line_count: None,
            truncated: size > PREVIEW_MAX_BYTES,
        });
    }

    let (raw_bytes, byte_truncated) = bounded_git_show(&path, &target).await?;
    let is_binary = is_binary_bytes(&raw_bytes);

    if is_image {
        let b64 = general_purpose::STANDARD.encode(raw_bytes);
        return Ok(FileContentResponse {
            is_image: true,
            is_binary: false,
            is_previewable: true,
            content: format!("data:image/{};base64,{}", ext, b64),
            size,
            line_count: None,
            truncated: byte_truncated,
        });
    }

    if is_binary {
        return Ok(FileContentResponse {
            is_image: false,
            is_binary: true,
            is_previewable: false,
            content: String::new(),
            size,
            line_count: None,
            truncated: byte_truncated,
        });
    }

    let (content, line_count, truncated) = preview_text(&raw_bytes);
    Ok(FileContentResponse {
        is_image: false,
        is_binary: false,
        is_previewable: !truncated,
        content,
        size,
        line_count: Some(line_count),
        truncated: byte_truncated || truncated,
    })
}

#[tauri::command]
pub async fn get_file_metadata(
    path: String,
    branch: String,
    file_path: String,
) -> Result<FileMetadataResponse, String> {
    let target = format!("{}:{}", branch, file_path);
    let size = branch_file_size(&path, &target).await?;

    if is_unsupported_extension(&file_path) || size > PREVIEW_MAX_BYTES {
        return Ok(FileMetadataResponse {
            size,
            is_binary: true,
            is_previewable: false,
        });
    }

    let (sample, _) = bounded_git_show(&path, &target).await?;
    let is_binary = is_binary_bytes(&sample);

    Ok(FileMetadataResponse {
        size,
        is_binary,
        is_previewable: !is_binary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_limits_branch_content() {
        let content = (0..1200)
            .map(|line| format!("line-{line}\n"))
            .collect::<String>();
        let (_, line_count, truncated) = preview_text(content.as_bytes());

        assert_eq!(line_count, PREVIEW_MAX_LINES);
        assert!(truncated);
    }

    #[test]
    fn identifies_non_text_branch_files() {
        assert!(is_unsupported_extension("building.ifc"));
        assert!(is_unsupported_extension("manual.pdf"));
        assert!(!is_unsupported_extension("src/main.rs"));
        assert!(is_binary_bytes(&[0x00, 0x01, 0x02]));
    }
}
