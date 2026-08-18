use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use serde_json::json;
use tauri::command;
use crate::utils::git_command;

const PREVIEW_MAX_BYTES: usize = 2 * 1024 * 1024;
const PREVIEW_MAX_LINES: usize = 1000;

struct TextPreview {
    content: String,
    line_count: usize,
    truncated: bool,
}

fn is_unsupported_extension(path: &Path) -> bool {
    let extension = path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    matches!(extension.as_deref(),
        Some("zip" | "rar" | "7z" | "tar" | "gz" | "exe" | "bin" | "dll" | "so" | "dylib" |
            "mp4" | "mkv" | "mov" | "mp3" | "ogg" | "wav" | "avi" | "webm" |
            "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" |
            "ifc" | "bim" | "rvt" | "rfa" | "nwd" | "nwc" | "blend" | "fbx" | "obj" |
            "gltf" | "glb" | "3d" | "3dm" | "3mf" | "x3d" | "3ds" | "max" | "ma" | "mb" | "step" | "stp" | "iges" |
            "igs" | "dwg" | "dxf" | "e57" | "las" | "laz" | "psd" | "ai" | "skp" |
            "dae" | "stl"))
}

fn read_file_sample_with_limit(path: &Path, limit: usize) -> Option<Vec<u8>> {
    let file = File::open(path).ok()?;
    let mut bytes = Vec::with_capacity(limit + 1);
    file.take((limit + 1) as u64).read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

fn read_file_sample(path: &Path) -> Option<Vec<u8>> {
    read_file_sample_with_limit(path, PREVIEW_MAX_BYTES)
}

fn is_binary_bytes(bytes: &[u8]) -> bool {
    bytes.contains(&0) || std::str::from_utf8(bytes).is_err()
}

fn file_metadata(path: &Path) -> (u64, bool, bool) {
    let size = fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0);
    if !path.is_file() {
        return (size, false, false);
    }
    if is_unsupported_extension(path) {
        return (size, true, false);
    }

    let bytes = read_file_sample_with_limit(path, 8 * 1024).unwrap_or_default();
    let is_binary = is_binary_bytes(&bytes);
    let is_previewable = !is_binary && size <= PREVIEW_MAX_BYTES as u64;
    (size, is_binary, is_previewable)
}

fn text_preview(bytes: &[u8]) -> TextPreview {
    let byte_truncated = bytes.len() > PREVIEW_MAX_BYTES;
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(PREVIEW_MAX_BYTES)]);
    let mut content = String::new();
    let mut line_count = 0;
    let mut truncated = byte_truncated;

    for line in text.split_inclusive('\n') {
        if line_count >= PREVIEW_MAX_LINES {
            truncated = true;
            break;
        }
        content.push_str(line);
        line_count += 1;
    }

    if !text.is_empty() && !text.ends_with('\n') && line_count < PREVIEW_MAX_LINES && content.len() < text.len() {
        content.push_str(&text[content.len()..]);
        line_count += 1;
    }

    if content.len() < text.len() {
        truncated = true;
    }

    TextPreview { content, line_count, truncated }
}

fn bounded_git_output(repo_path: &str, args: &[&str]) -> Result<(Vec<u8>, bool), String> {
    let mut child = git_command(repo_path)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdout = child.stdout.take().ok_or_else(|| "Não foi possível ler a saída do Git".to_string())?;
    let mut bytes = Vec::with_capacity(PREVIEW_MAX_BYTES + 1);
    stdout.take((PREVIEW_MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    let truncated = bytes.len() > PREVIEW_MAX_BYTES;

    if truncated {
        let _ = child.kill();
    }

    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() && !truncated {
        let mut stderr = String::new();
        if let Some(mut stream) = child.stderr.take() {
            let _ = stream.read_to_string(&mut stderr);
        }
        return Err(if stderr.is_empty() { "Falha ao executar Git".to_string() } else { stderr });
    }

    Ok((bytes, truncated))
}

fn status_has_conflict(status: &[u8]) -> bool {
    if status.len() < 2 {
        return false;
    }

    let first = status[0];
    let second = status[1];
    first == b'U' || second == b'U' || (first == b'A' && second == b'A') || (first == b'D' && second == b'D')
}

#[tauri::command]
pub fn list_local_changes(path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = git_command(&path)
        .arg("status")
        .arg("--porcelain")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut changes = Vec::new();
    let repo_path = Path::new(&path);

    let mut add_change = |file_path: String, status: &str, staged: bool| {
        let file = Path::new(&file_path);
        let deleted = status == "deleted";
        let (size, is_binary, is_previewable) = if deleted {
            (0, false, true)
        } else {
            file_metadata(&repo_path.join(file))
        };

        changes.push(json!({
            "path": file_path,
            "status": status,
            "staged": staged,
            "extension": file.extension().and_then(|value| value.to_str()).unwrap_or(""),
            "size": size,
            "lineCount": null,
            "isBinary": is_binary,
            "isPreviewable": is_previewable
        }));
    };

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let code = if line.len() >= 2 { &line[0..2] } else { "  " };
        let file_path = if line.len() > 3 { line[3..].trim_matches('"').to_string() } else { String::new() };
        let index_status = code.chars().next().unwrap_or(' ');
        let worktree_status = code.chars().nth(1).unwrap_or(' ');
        let conflicted = status_has_conflict(code.as_bytes());

        if index_status != ' ' && index_status != '?' {
            let status = if conflicted {
                "conflicted"
            } else {
                match index_status {
                    'M' => "modified",
                    'A' => "added",
                    'D' => "deleted",
                    'R' => "renamed",
                    'C' => "copied",
                    _ => "staged",
                }
            };
            add_change(file_path.clone(), status, true);
        }

        if worktree_status != ' ' {
            if index_status == '?' && worktree_status == '?' && file_path.ends_with('/') {
                let list_output = git_command(&path)
                    .arg("ls-files")
                    .arg("--others")
                    .arg("--exclude-standard")
                    .arg("--")
                    .arg(&file_path)
                    .output()
                    .map_err(|e| e.to_string())?;

                if list_output.status.success() {
                    let list_stdout = String::from_utf8_lossy(&list_output.stdout);
                    for file in list_stdout.lines().filter(|value| !value.is_empty()) {
                        add_change(file.to_string(), "untracked", false);
                    }
                    continue;
                }
            }

            let status = if conflicted {
                "conflicted"
            } else {
                match worktree_status {
                    'M' => "modified",
                    'D' => "deleted",
                    '?' => "untracked",
                    _ => "modified",
                }
            };
            add_change(file_path, status, false);
        }
    }

    Ok(changes)
}

/// Stage arquivos (git add)
#[command]
pub fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = git_command(&path);
    cmd.arg("add").args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

/// Unstage arquivos (git reset)
#[command]
pub fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = git_command(&path);
    cmd.arg("reset").args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[command]
pub fn discard_changes(path: String, files: Vec<String>) -> Result<String, String> {
    let mut cmd = git_command(&path);
    cmd.arg("checkout").arg("--");
    for f in files {
        cmd.arg(f);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn get_diff(repo_path: String, file: String, staged: bool) -> Result<serde_json::Value, String> {
    let file_path = Path::new(&repo_path).join(&file);
    let (size, metadata_binary, metadata_previewable) = file_metadata(&file_path);
    let metadata_previewable = metadata_previewable || !file_path.exists();

    let status_output = git_command(&repo_path)
        .arg("ls-files")
        .arg("--others")
        .arg("--exclude-standard")
        .arg(&file)
        .output()
        .map_err(|e| e.to_string())?;
    let is_untracked = !status_output.stdout.is_empty();

    let conflict_status = git_command(&repo_path)
        .args(["status", "--porcelain", "--"])
        .arg(&file)
        .output()
        .map(|output| status_has_conflict(&output.stdout))
        .unwrap_or(false);

    let sample = if file_path.is_file() { read_file_sample(&file_path) } else { None };
    let marker_conflict = sample.as_ref()
        .filter(|bytes| !is_binary_bytes(bytes))
        .map(|bytes| {
            let content = String::from_utf8_lossy(bytes);
            content.contains("<<<<<<<") && content.contains("=======") && content.contains(">>>>>>>")
        })
        .unwrap_or(false);
    let has_conflict = conflict_status || marker_conflict;

    if is_untracked {
        if !metadata_previewable {
            return Ok(json!({
                "diff": "",
                "oldFile": null,
                "newFile": file_path.to_string_lossy().to_string(),
                "size": size,
                "lineCount": null,
                "isBinary": metadata_binary,
                "isPreviewable": false,
                "truncated": false,
                "hasConflict": false,
                "reason": if metadata_binary { "binary" } else { "unsupported_or_large" }
            }));
        }

        let preview = text_preview(sample.as_deref().unwrap_or_default());
        let content = preview.content
            .split_inclusive('\n')
            .map(|line| format!("+{}", line))
            .collect::<String>();
        let diff = format!(
            "diff --git a/{f} b/{f}\nnew file mode 100644\n--- /dev/null\n+++ b/{f}\n{c}",
            f = file,
            c = content
        );

        return Ok(json!({
            "diff": diff,
            "oldFile": null,
            "newFile": file_path.to_string_lossy().to_string(),
            "size": size,
            "lineCount": preview.line_count,
            "isBinary": false,
            "isPreviewable": true,
            "truncated": preview.truncated,
            "hasConflict": false,
            "reason": if preview.truncated { Some("truncated") } else { None::<&str> }
        }));
    }

    if has_conflict {
        if !metadata_previewable {
            return Ok(json!({
                "diff": "",
                "oldFile": null,
                "newFile": file_path.to_string_lossy().to_string(),
                "size": size,
                "lineCount": null,
                "isBinary": metadata_binary,
                "isPreviewable": false,
                "truncated": true,
                "hasConflict": true,
                "reason": if metadata_binary { "binary_conflict" } else { "conflict_too_large" }
            }));
        }

        let preview = text_preview(sample.as_deref().unwrap_or_default());
        if preview.truncated {
            return Ok(json!({
                "diff": "",
                "oldFile": null,
                "newFile": file_path.to_string_lossy().to_string(),
                "size": size,
                "lineCount": preview.line_count,
                "isBinary": false,
                "isPreviewable": false,
                "truncated": true,
                "hasConflict": true,
                "reason": "conflict_too_large"
            }));
        }

        return Ok(json!({
            "diff": preview.content,
            "oldFile": null,
            "newFile": file_path.to_string_lossy().to_string(),
            "size": size,
            "lineCount": preview.line_count,
            "isBinary": false,
            "isPreviewable": true,
            "truncated": false,
            "hasConflict": true,
            "reason": null
        }));
    }

    if !metadata_previewable {
        return Ok(json!({
            "diff": "",
            "oldFile": null,
            "newFile": file_path.to_string_lossy().to_string(),
            "size": size,
            "lineCount": null,
            "isBinary": metadata_binary,
            "isPreviewable": false,
            "truncated": false,
            "hasConflict": false,
            "reason": if metadata_binary { "binary" } else { "unsupported_or_large" }
        }));
    }

    let diff_args = if staged {
        vec!["diff", "--cached", "--", file.as_str()]
    } else {
        vec!["diff", "--", file.as_str()]
    };
    let (diff_bytes, output_truncated) = bounded_git_output(&repo_path, &diff_args)?;
    let diff_str = String::from_utf8_lossy(&diff_bytes).to_string();
    let diff_binary = diff_str.contains("Binary files") || diff_str.contains("GIT binary patch");
    let preview = text_preview(&diff_bytes);
    let truncated = output_truncated || preview.truncated;

    Ok(json!({
        "diff": if diff_binary || truncated { "" } else { diff_str.as_str() },
        "oldFile": null,
        "newFile": file_path.to_string_lossy().to_string(),
        "size": size,
        "lineCount": preview.line_count,
        "isBinary": diff_binary,
        "isPreviewable": !diff_binary && !truncated,
        "truncated": truncated,
        "hasConflict": false,
        "reason": if diff_binary { Some("binary") } else if truncated { Some("diff_too_large") } else { None::<&str> }
    }))
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = git_command(&repo_path)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
#[command]
pub fn reset_hard(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["reset", "--hard"])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_limits_line_count() {
        let content = (0..1200).map(|line| format!("line-{line}\n")).collect::<String>();
        let preview = text_preview(content.as_bytes());

        assert_eq!(preview.line_count, PREVIEW_MAX_LINES);
        assert!(preview.truncated);
        assert!(preview.content.lines().count() <= PREVIEW_MAX_LINES);
    }

    #[test]
    fn preview_limits_bytes() {
        let content = "x".repeat(PREVIEW_MAX_BYTES + 128);
        let preview = text_preview(content.as_bytes());

        assert!(preview.truncated);
        assert!(preview.content.len() <= PREVIEW_MAX_BYTES + 1);
    }

    #[test]
    fn detects_binary_content() {
        assert!(is_binary_bytes(&[0x41, 0x00, 0x42]));
        assert!(!is_binary_bytes(b"fn main() {}"));
    }

    #[test]
    fn detects_unsupported_file_extensions() {
        assert!(is_unsupported_extension(Path::new("model.ifc")));
        assert!(is_unsupported_extension(Path::new("drawing.pdf")));
        assert!(!is_unsupported_extension(Path::new("main.rs")));
    }

    #[test]
    fn detects_unmerged_status() {
        assert!(status_has_conflict(b"UU src/main.rs"));
        assert!(status_has_conflict(b"AA src/main.rs"));
        assert!(status_has_conflict(b"DD src/main.rs"));
        assert!(!status_has_conflict(b" M src/main.rs"));
    }
}
