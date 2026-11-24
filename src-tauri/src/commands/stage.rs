use crate::utils::git_command;
use git2::{Repository, Status, StatusOptions};
use rayon::prelude::*;
use std::collections::HashMap;
use serde_json::json;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

const PREVIEW_MAX_BYTES: usize = 2 * 1024 * 1024;
const PREVIEW_MAX_LINES: usize = 1000;

struct TextPreview {
    content: String,
    line_count: usize,
    truncated: bool,
}

fn is_unsupported_extension(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    matches!(
        extension.as_deref(),
        Some(
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
    )
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
    let size = fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
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

    TextPreview {
        content,
        line_count,
        truncated,
    }
}

fn bounded_git_output(repo_path: &str, args: &[&str]) -> Result<(Vec<u8>, bool), String> {
    let mut child = git_command(repo_path)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Não foi possível ler a saída do Git".to_string())?;
    let mut bytes = Vec::with_capacity(PREVIEW_MAX_BYTES + 1);
    stdout
        .take((PREVIEW_MAX_BYTES + 1) as u64)
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
        return Err(if stderr.is_empty() {
            "Falha ao executar Git".to_string()
        } else {
            stderr
        });
    }

    Ok((bytes, truncated))
}

fn status_has_conflict(status: &[u8]) -> bool {
    if status.len() < 2 {
        return false;
    }

    let first = status[0];
    let second = status[1];
    first == b'U'
        || second == b'U'
        || (first == b'A' && second == b'A')
        || (first == b'D' && second == b'D')
}

fn status_file_path(line: &str) -> Option<String> {
    if line.len() <= 3 {
        return None;
    }

    let code = &line[..2];
    let raw_path = line[3..].trim_matches('"').replace('\\', "/");
    if raw_path.is_empty() {
        return None;
    }

    let path = if code.chars().any(|status| matches!(status, 'R' | 'C')) {
        raw_path
            .rsplit_once(" -> ")
            .map(|(_, new_path)| new_path)
            .unwrap_or(&raw_path)
    } else {
        &raw_path
    };

    (!path.is_empty()).then_some(path.to_string())
}

#[tauri::command]
pub async fn list_local_changes(path: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || list_local_changes_blocking(path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn list_local_changes_blocking(path: String) -> Result<Vec<serde_json::Value>, String> {
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
        let size = if status == "deleted" {
            0
        } else {
            fs::metadata(repo_path.join(file))
                .map(|metadata| metadata.len())
                .unwrap_or(0)
        };

        changes.push(json!({
            "path": file_path,
            "status": status,
            "staged": staged,
            "extension": file.extension().and_then(|value| value.to_str()).unwrap_or(""),
            "size": size,
            "lineCount": null,
            "isBinary": false,
            "isPreviewable": true
        }));
    };

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let code = if line.len() >= 2 { &line[0..2] } else { "  " };
        let Some(file_path) = status_file_path(line) else {
            continue;
        };
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

#[tauri::command]
pub async fn get_repository_status(path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || get_repository_status_blocking(path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn get_repository_status_blocking(path: String) -> Result<serde_json::Value, String> {
    let repository = Repository::open(&path).map_err(|error| error.to_string())?;
    let head = repository.head().ok();
    let head_id = head
        .as_ref()
        .and_then(|reference| reference.target())
        .map(|oid| oid.to_string())
        .unwrap_or_default();
    let branch = head
        .as_ref()
        .and_then(|reference| reference.shorthand())
        .unwrap_or_default()
        .to_string();

    let mut options = StatusOptions::new();
    options.include_untracked(true);
    options.recurse_untracked_dirs(true);
    let statuses = repository
        .statuses(Some(&mut options))
        .map_err(|error| error.to_string())?;
    let change_count = statuses
        .iter()
        .filter(|entry| entry.status() != Status::CURRENT)
        .count();

    Ok(json!({
        "hasChanges": change_count > 0,
        "changeCount": change_count,
        "head": head_id,
        "branch": branch,
    }))
}

/// Conta as entradas de `git status --porcelain -z` (um arquivo = uma entrada).
/// Usa o git CLI porque ele aproveita fscache/untrackedCache/fsmonitor no
/// Windows, e `--no-optional-locks` para não disputar o index com outras
/// ferramentas. Pastas não rastreadas contam como uma entrada só (`normal`),
/// o que é bem mais barato que percorrê-las.
fn quick_change_count(path: &str) -> Result<usize, String> {
    let output = git_command(path)
        .args([
            "--no-optional-locks",
            "status",
            "--porcelain",
            "-z",
            "--untracked-files=normal",
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let mut count = 0;
    let mut fields = output.stdout.split(|byte| *byte == 0);
    while let Some(entry) = fields.next() {
        if entry.len() < 3 {
            continue;
        }
        count += 1;
        // Renomeações/cópias trazem o caminho original no campo seguinte.
        if matches!(entry[0], b'R' | b'C') || matches!(entry[1], b'R' | b'C') {
            fields.next();
        }
    }
    Ok(count)
}

/// Verificação leve de alterações para vários repositórios de uma vez
/// (usada para a bolinha das abas). Repositórios com erro voltam como `null`.
#[tauri::command]
pub async fn get_repositories_change_counts(
    paths: Vec<String>,
) -> Result<HashMap<String, Option<usize>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_par_iter()
            .map(|path| {
                let count = quick_change_count(&path).ok();
                (path, count)
            })
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}

fn parse_repository_status(output: &str) -> (String, String, usize) {
    let mut head = String::new();
    let mut branch = String::new();
    let mut change_count = 0;

    for line in output.lines() {
        if let Some(value) = line.strip_prefix("# branch.oid ") {
            head = value.to_string();
        } else if let Some(value) = line.strip_prefix("# branch.head ") {
            branch = value.to_string();
        } else if !line.starts_with('#') && !line.trim().is_empty() {
            change_count += 1;
        }
    }

    (head, branch, change_count)
}

fn normalize_gitignore_entry(file_path: &str) -> Result<String, String> {
    let normalized = file_path.trim().replace('\\', "/");
    let relative = normalized.trim_start_matches("./").to_string();
    let path = Path::new(&relative);

    if relative.is_empty() || path.is_absolute() {
        return Err("O caminho do arquivo precisa ser relativo ao repositório".to_string());
    }

    if path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir | std::path::Component::Prefix(_)
        )
    }) {
        return Err("O caminho do arquivo não pode sair da raiz do repositório".to_string());
    }

    if relative.starts_with('#') || relative.starts_with('!') {
        Ok(format!("\\{}", relative))
    } else {
        Ok(relative)
    }
}

#[tauri::command]
pub async fn ignore_file(path: String, file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ignore_file_blocking(path, file_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn ignore_file_blocking(path: String, file_path: String) -> Result<String, String> {
    let entry = normalize_gitignore_entry(&file_path)?;
    let gitignore_path = Path::new(&path).join(".gitignore");
    let mut content = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path).map_err(|error| error.to_string())?
    } else {
        String::new()
    };

    if !content.lines().any(|line| line.trim() == entry) {
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(&entry);
        content.push('\n');
        fs::write(&gitignore_path, content).map_err(|error| error.to_string())?;
    }

    Ok(entry)
}

/// Stage arquivos (git add)
#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stage_files_blocking(path, files))
        .await
        .map_err(|error| error.to_string())?
}

pub fn stage_files_blocking(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = git_command(&path);
    cmd.arg("add").args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

/// Unstage arquivos (git reset)
#[tauri::command]
pub async fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || unstage_files_blocking(path, files))
        .await
        .map_err(|error| error.to_string())?
}

pub fn unstage_files_blocking(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = git_command(&path);
    cmd.arg("reset").args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

fn safe_worktree_path(repo_path: &str, file: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(file);
    if file.trim().is_empty()
        || relative_path.is_absolute()
        || relative_path.components().any(|component| {
            matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_))
        })
    {
        return Err(format!("Caminho de arquivo inválido: {}", file));
    }

    let repo_root = Path::new(repo_path)
        .canonicalize()
        .map_err(|error| format!("Não foi possível acessar o repositório: {}", error))?;
    let target = repo_root.join(relative_path);
    let resolved = if target.exists() {
        target
            .canonicalize()
            .map_err(|error| format!("Não foi possível validar o arquivo {}: {}", file, error))?
    } else {
        target
            .parent()
            .ok_or_else(|| format!("Caminho de arquivo inválido: {}", file))?
            .canonicalize()
            .map_err(|error| format!("Não foi possível validar o arquivo {}: {}", file, error))?
            .join(target.file_name().ok_or_else(|| format!("Caminho de arquivo inválido: {}", file))?)
    };

    if !resolved.starts_with(&repo_root) {
        return Err(format!("O arquivo está fora do repositório: {}", file));
    }

    Ok(target)
}

fn is_untracked(path: &str, file: &str) -> Result<bool, String> {
    let output = git_command(path)
        .args(["ls-files", "--others", "--exclude-standard", "--", file])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(!output.stdout.is_empty())
}

fn is_staged_added(path: &str, file: &str) -> Result<bool, String> {
    let output = git_command(path)
        .args(["diff", "--cached", "--name-status", "--", file])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .any(|line| line.starts_with("A\t")))
}

fn remove_untracked_path(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path).map_err(|error| error.to_string())
    } else if metadata.is_dir() {
        fs::remove_dir(path).map_err(|error| error.to_string())
    } else {
        Err(format!("Tipo de arquivo não suportado: {}", path.display()))
    }
}

#[tauri::command]
pub async fn discard_changes(path: String, files: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || discard_changes_blocking(path, files))
        .await
        .map_err(|error| error.to_string())?
}

pub fn discard_changes_blocking(path: String, files: Vec<String>) -> Result<String, String> {
    let mut tracked_files = Vec::new();

    for file in files {
        let worktree_path = safe_worktree_path(&path, &file)?;
        let staged_added = is_staged_added(&path, &file)?;
        let untracked = staged_added || is_untracked(&path, &file)?;

        if staged_added {
            let output = git_command(&path)
                .args(["reset", "HEAD", "--", &file])
                .output()
                .map_err(|error| error.to_string())?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).to_string());
            }
        }

        if untracked {
            if worktree_path.exists() || fs::symlink_metadata(&worktree_path).is_ok() {
                remove_untracked_path(&worktree_path)
                    .map_err(|error| format!("Não foi possível remover {}: {}", file, error))?;
            }
        } else {
            tracked_files.push(file);
        }
    }

    if tracked_files.is_empty() {
        return Ok(String::new());
    }

    let output = git_command(&path)
        .arg("checkout")
        .arg("--")
        .args(&tracked_files)
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn get_diff(
    repo_path: String,
    file: String,
    staged: bool,
    status: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || get_diff_blocking(repo_path, file, staged, status))
        .await
        .map_err(|error| error.to_string())?
}

/// `status` é o status que o front já conhece (vindo de `list_local_changes`
/// ou do snapshot). Quando informado, evita dois processos git extras
/// (`ls-files --others` e `status --porcelain`); cada spawn de `git.exe`
/// custa dezenas de milissegundos no Windows.
pub fn get_diff_blocking(
    repo_path: String,
    file: String,
    staged: bool,
    status: Option<String>,
) -> Result<serde_json::Value, String> {
    let file_path = Path::new(&repo_path).join(&file);
    let (size, metadata_binary, metadata_previewable) = file_metadata(&file_path);
    let metadata_previewable = metadata_previewable || !file_path.exists();

    let known_status = status
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let (is_untracked, conflict_status) = match known_status {
        Some(value) => (value == "untracked", value == "conflicted"),
        None => {
            // Fallback para chamadas que não informam o status.
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

            (is_untracked, conflict_status)
        }
    };

    let sample = if file_path.is_file() {
        read_file_sample(&file_path)
    } else {
        None
    };
    let marker_conflict = sample
        .as_ref()
        .filter(|bytes| !is_binary_bytes(bytes))
        .map(|bytes| {
            let content = String::from_utf8_lossy(bytes);
            content.contains("<<<<<<<")
                && content.contains("=======")
                && content.contains(">>>>>>>")
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
        let content = preview
            .content
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
    let eol = if !diff_binary && !diff_str.trim().is_empty() {
        line_ending_only_info(&repo_path, &file, staged)
    } else {
        None
    };

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
        "lineEndingOnly": eol.is_some(),
        "eol": eol,
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
#[tauri::command]
pub async fn reset_hard(repo_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || reset_hard_blocking(repo_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn reset_hard_blocking(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["reset", "--hard"])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_porcelain_v2_branch_headers_without_counting_them_as_changes() {
        let output = "# branch.oid abc123\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -2\n1 .M N... 100644 100644 100644 hash hash file.rs\n? new.txt\n";
        let (head, branch, change_count) = parse_repository_status(output);

        assert_eq!(head, "abc123");
        assert_eq!(branch, "main");
        assert_eq!(change_count, 2);
    }

    #[test]
    fn preview_limits_line_count() {
        let content = (0..1200)
            .map(|line| format!("line-{line}\n"))
            .collect::<String>();
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

    #[test]
    fn uses_the_new_path_for_renamed_files() {
        assert_eq!(
            status_file_path("R  old/name.cs -> src/name.cs"),
            Some("src/name.cs".to_string())
        );
        assert_eq!(status_file_path(" M src/name.cs"), Some("src/name.cs".to_string()));
    }

    #[test]
    fn normalizes_gitignore_entries() {
        assert_eq!(
            normalize_gitignore_entry("src\\generated.js").unwrap(),
            "src/generated.js"
        );
        assert_eq!(
            normalize_gitignore_entry("./tmp/cache").unwrap(),
            "tmp/cache"
        );
        assert!(normalize_gitignore_entry("../outside.txt").is_err());
        assert!(normalize_gitignore_entry("C:\\outside.txt").is_err());
    }

    #[test]
    fn rejects_discard_paths_outside_the_repository() {
        assert!(safe_worktree_path(".", "../outside.txt").is_err());
        assert!(safe_worktree_path(".", "").is_err());
    }

    #[test]
    fn removes_an_untracked_file_from_the_worktree() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("devbrook-discard-{suffix}"));
        std::fs::create_dir_all(&directory).unwrap();
        let file = directory.join("new.txt");
        std::fs::write(&file, "new file").unwrap();

        remove_untracked_path(&file).unwrap();

        assert!(!file.exists());
        std::fs::remove_dir_all(directory).unwrap();
    }
}

const EMPTY_TREE_HASH: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

fn git_succeeds(repo_path: &str, args: &[&str]) -> bool {
    git_command(repo_path)
        .args(args)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn git_stdout(repo_path: &str, args: &[&str]) -> Option<String> {
    let output = git_command(repo_path).args(args).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).to_string())
}

fn amend_base(repo_path: &str) -> &'static str {
    if git_succeeds(repo_path, &["rev-parse", "--verify", "-q", "HEAD~1^{commit}"]) {
        "HEAD~1"
    } else {
        EMPTY_TREE_HASH
    }
}

fn operation_in_progress(repo_path: &str) -> Option<String> {
    let checks = [
        ("MERGE_HEAD", "merge"),
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
    ];

    for (marker, name) in checks {
        let Some(path) = git_stdout(repo_path, &["rev-parse", "--git-path", marker]) else {
            continue;
        };
        let path = path.trim();
        if path.is_empty() {
            continue;
        }
        let full = if Path::new(path).is_absolute() {
            PathBuf::from(path)
        } else {
            Path::new(repo_path).join(path)
        };
        if full.exists() {
            return Some(name.to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn get_amend_info(repo_path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || get_amend_info_blocking(repo_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn get_amend_info_blocking(repo_path: String) -> Result<serde_json::Value, String> {
    if !git_succeeds(&repo_path, &["rev-parse", "--verify", "-q", "HEAD^{commit}"]) {
        return Ok(json!({ "hasHead": false }));
    }

    let raw = git_stdout(&repo_path, &["log", "-1", "--format=%H%x00%an%x00%ae%x00%P%x00%B"])
        .ok_or_else(|| "Não foi possível ler o último commit".to_string())?;
    let mut parts = raw.splitn(5, '\0');
    let hash = parts.next().unwrap_or("").trim().to_string();
    let author_name = parts.next().unwrap_or("").to_string();
    let author_email = parts.next().unwrap_or("").to_string();
    let parents = parts.next().unwrap_or("").split_whitespace().count();
    let message = parts.next().unwrap_or("").replace("\r\n", "\n");
    let message = message.trim_end();

    let (subject, body) = match message.split_once('\n') {
        Some((first, rest)) => (first.trim().to_string(), rest.trim().to_string()),
        None => (message.trim().to_string(), String::new()),
    };

    let current_email = git_stdout(&repo_path, &["config", "user.email"])
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let is_current_user = current_email.is_empty()
        || current_email.eq_ignore_ascii_case(author_email.trim());

    let upstream = git_stdout(
        &repo_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

    let pushed = match &upstream {
        Some(upstream) => git_succeeds(&repo_path, &["merge-base", "--is-ancestor", "HEAD", upstream]),
        None => git_stdout(&repo_path, &["branch", "-r", "--contains", "HEAD"])
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
    };

    Ok(json!({
        "hasHead": true,
        "hash": hash,
        "subject": subject,
        "body": body,
        "authorName": author_name,
        "authorEmail": author_email,
        "isCurrentUser": is_current_user,
        "isMerge": parents > 1,
        "isRoot": parents == 0,
        "pushed": pushed,
        "upstream": upstream,
        "operationInProgress": operation_in_progress(&repo_path),
    }))
}

#[tauri::command]
pub async fn list_amend_changes(repo_path: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || list_amend_changes_blocking(repo_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn list_amend_changes_blocking(repo_path: String) -> Result<Vec<serde_json::Value>, String> {
    let base = amend_base(&repo_path);
    let output = git_command(&repo_path)
        .args(["diff", "--cached", "--name-status", "--no-renames", "-z", base])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut tokens = stdout.split('\0').filter(|value| !value.is_empty());
    let mut changes = Vec::new();

    while let (Some(code), Some(file)) = (tokens.next(), tokens.next()) {
        let status = match code.chars().next().unwrap_or('M') {
            'A' => "added",
            'D' => "deleted",
            'U' => "conflicted",
            _ => "modified",
        };
        let file_path = Path::new(&repo_path).join(file);
        let size = if status == "deleted" {
            0
        } else {
            fs::metadata(&file_path).map(|metadata| metadata.len()).unwrap_or(0)
        };

        changes.push(json!({
            "path": file.replace('\\', "/"),
            "status": status,
            "staged": true,
            "extension": Path::new(file).extension().and_then(|value| value.to_str()).unwrap_or(""),
            "size": size,
            "lineCount": null,
            "isBinary": false,
            "isPreviewable": true
        }));
    }

    Ok(changes)
}

#[tauri::command]
pub async fn get_amend_diff(repo_path: String, file: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || get_amend_diff_blocking(repo_path, file))
        .await
        .map_err(|error| error.to_string())?
}

pub fn get_amend_diff_blocking(repo_path: String, file: String) -> Result<serde_json::Value, String> {
    let base = amend_base(&repo_path);
    let file_path = Path::new(&repo_path).join(&file);
    let size = fs::metadata(&file_path).map(|metadata| metadata.len()).ok();

    let (diff_bytes, output_truncated) = bounded_git_output(
        &repo_path,
        &["diff", "--cached", "--no-renames", base, "--", file.as_str()],
    )?;
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

#[tauri::command]
pub async fn remove_from_amend(repo_path: String, files: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_from_amend_blocking(repo_path, files))
        .await
        .map_err(|error| error.to_string())?
}

pub fn remove_from_amend_blocking(repo_path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    let mut cmd = git_command(&repo_path);
    if amend_base(&repo_path) == "HEAD~1" {
        cmd.args(["reset", "-q", "HEAD~1", "--"]);
    } else {
        cmd.args(["rm", "--cached", "-q", "-r", "--"]);
    }
    let output = cmd.args(&files).output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

fn index_eol(repo_path: &str, file: &str) -> Option<(String, String)> {
    let output = git_stdout(repo_path, &["ls-files", "--eol", "--", file])?;
    let line = output.lines().next()?;
    let mut index = String::new();
    let mut worktree = String::new();
    for token in line.split_whitespace() {
        if let Some(value) = token.strip_prefix("i/") {
            index = value.to_string();
        } else if let Some(value) = token.strip_prefix("w/") {
            worktree = value.to_string();
        }
    }
    Some((index, worktree))
}

fn line_ending_only_info(repo_path: &str, file: &str, staged: bool) -> Option<serde_json::Value> {
    let mut args = vec!["diff", "--quiet", "--ignore-cr-at-eol"];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", file]);
    if !git_succeeds(repo_path, &args) {
        return None;
    }
    let (index, worktree) = index_eol(repo_path, file).unwrap_or_default();
    Some(json!({ "index": index, "worktree": worktree }))
}

#[tauri::command]
pub async fn list_line_ending_changes(repo_path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || list_line_ending_changes_blocking(repo_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn list_line_ending_changes_blocking(repo_path: String) -> Result<serde_json::Value, String> {
    let changed = git_stdout(&repo_path, &["diff", "--name-only", "--no-renames", "-z"])
        .ok_or_else(|| "Falha ao listar alterações".to_string())?;
    let with_content = git_stdout(
        &repo_path,
        &["diff", "--numstat", "--no-renames", "--ignore-cr-at-eol", "-z"],
    )
    .ok_or_else(|| "Falha ao listar alterações".to_string())?;

    let content_files: std::collections::HashSet<String> = with_content
        .split('\0')
        .filter_map(|entry| entry.splitn(3, '\t').nth(2))
        .filter(|path| !path.is_empty())
        .map(|path| path.to_string())
        .collect();

    let files: Vec<String> = changed
        .split('\0')
        .filter(|path| !path.is_empty() && !content_files.contains(*path))
        .map(|path| path.to_string())
        .collect();

    let has_gitattributes = Path::new(&repo_path).join(".gitattributes").exists();

    Ok(json!({ "files": files, "hasGitattributes": has_gitattributes }))
}

#[tauri::command]
pub async fn normalize_line_endings(repo_path: String, files: Vec<String>) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || normalize_line_endings_blocking(repo_path, files))
        .await
        .map_err(|error| error.to_string())?
}

pub fn normalize_line_endings_blocking(repo_path: String, files: Vec<String>) -> Result<usize, String> {
    let mut normalized = 0;
    for file in files {
        let full_path = safe_worktree_path(&repo_path, &file)?;
        let Some((index, _)) = index_eol(&repo_path, &file) else {
            continue;
        };
        let use_crlf = match index.as_str() {
            "lf" => false,
            "crlf" => true,
            _ => continue,
        };

        let bytes = fs::read(&full_path).map_err(|e| format!("{}: {}", file, e))?;
        if is_binary_bytes(&bytes) {
            continue;
        }

        let mut lf = Vec::with_capacity(bytes.len());
        let mut iter = bytes.iter().peekable();
        while let Some(&byte) = iter.next() {
            if byte == b'\r' && iter.peek() == Some(&&b'\n') {
                continue;
            }
            lf.push(byte);
        }

        let output = if use_crlf {
            let mut crlf = Vec::with_capacity(lf.len() + lf.len() / 20);
            for byte in lf {
                if byte == b'\n' {
                    crlf.push(b'\r');
                }
                crlf.push(byte);
            }
            crlf
        } else {
            lf
        };

        if output != bytes {
            fs::write(&full_path, output).map_err(|e| format!("{}: {}", file, e))?;
            normalized += 1;
        }
    }
    Ok(normalized)
}

#[tauri::command]
pub fn create_gitattributes(repo_path: String) -> Result<(), String> {
    let path = Path::new(&repo_path).join(".gitattributes");
    if path.exists() {
        return Err("O repositório já possui um .gitattributes".to_string());
    }
    fs::write(&path, "* text=auto\n").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_patch_to_index(repo_path: String, patch: String, reverse: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || apply_patch_to_index_blocking(repo_path, patch, reverse))
        .await
        .map_err(|error| error.to_string())?
}

pub fn apply_patch_to_index_blocking(repo_path: String, patch: String, reverse: bool) -> Result<(), String> {
    use std::io::Write;

    let mut cmd = git_command(&repo_path);
    cmd.args(["apply", "--cached", "--whitespace=nowarn"]);
    if reverse {
        cmd.arg("--reverse");
    }
    cmd.arg("-")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "Não foi possível enviar o patch ao Git".to_string())?;
        stdin.write_all(patch.as_bytes()).map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
