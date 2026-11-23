use crate::utils::git_command;
use rayon::prelude::*;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Clone)]
pub struct Commit {
    hash: String,
    graph_symbol: Option<String>,
    message: String,
    author: String,
    email: String,
    date: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    last_commit: Option<Commit>,
}

#[derive(Serialize, Clone)]
pub struct GraphLine {
    pub graph_symbol: String,
    pub is_commit: bool,
    pub hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub ref_names: String,     // Nomes das refs (branches/tags)
    pub parent_hashes: String, // Hashes dos pais separados por espaço
}

fn list_commits_from_git(
    path: &str,
    branch: &str,
    limit: Option<usize>,
    skip: Option<usize>,
) -> Result<Vec<GraphLine>, String> {
    let mut command = git_command(path);
    command.args([
        "log",
        "--graph",
        "--date=iso-strict",
        "--pretty=format:SEP%H|%an|%ae|%ad|%s|%P|%D",
    ]);
    if let Some(limit) = limit {
        command.args(["--max-count", &limit.to_string()]);
    }
    if let Some(skip) = skip.filter(|value| *value > 0) {
        command.args(["--skip", &skip.to_string()]);
    }
    let output = command
        .arg(&branch)
        .arg("--")
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Mudamos para filter_map para ignorar as linhas estruturais/vazias do Git
    let lines: Vec<GraphLine> = stdout
        .lines()
        .filter_map(|line| {
            if line.contains("SEP") {
                let parts: Vec<&str> = line.splitn(2, "SEP").collect();
                let graph_part = parts[0].to_string();
                let data_part = parts[1];
                let data: Vec<&str> = data_part.splitn(7, '|').collect();

                Some(GraphLine {
                    graph_symbol: graph_part,
                    is_commit: true,
                    hash: data.get(0).unwrap_or(&"").to_string(),
                    author: data.get(1).unwrap_or(&"").to_string(),
                    email: data.get(2).unwrap_or(&"").to_string(),
                    date: data.get(3).unwrap_or(&"").to_string(),
                    message: data.get(4).unwrap_or(&"").to_string(),
                    parent_hashes: data.get(5).unwrap_or(&"").to_string(),
                    ref_names: data.get(6).unwrap_or(&"").to_string(),
                })
            } else {
                // Linha sem commit (apenas barras, espaços, etc.) -> Ignorada!
                None
            }
        })
        .collect();

    Ok(lines)
}

#[tauri::command]
pub async fn list_commits(
    path: String,
    branch: String,
    limit: Option<usize>,
    skip: Option<usize>,
) -> Result<Vec<GraphLine>, String> {
    tauri::async_runtime::spawn_blocking(move || list_commits_from_git(&path, &branch, limit, skip))
    .await
    .map_err(|error| format!("Falha ao carregar commits: {}", error))?
}

#[tauri::command]
pub async fn list_user_commits(path: String, branch: String, email: String) -> Result<Vec<Commit>, String> {
    tauri::async_runtime::spawn_blocking(move || list_user_commits_blocking(path, branch, email))
        .await
        .map_err(|error| error.to_string())?
}

pub fn list_user_commits_blocking(
    path: String,
    branch: String,
    email: String,
) -> Result<Vec<Commit>, String> {
    let author_filter = format!("--author={}", email);

    let output = git_command(&path)
        .args(&[
            "log",
            "--pretty=format:%H|%an|%ae|%ad|%s",
            &branch,
            &author_filter,
            "--",
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
            if parts.len() < 5 {
                return None;
            }

            Some(Commit {
                hash: parts[0].to_string(),
                graph_symbol: None,
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
pub async fn get_commit_details(path: String, hash: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || get_commit_details_blocking(path, hash))
        .await
        .map_err(|error| error.to_string())?
}

pub fn get_commit_details_blocking(path: String, hash: String) -> Result<Value, String> {
    // `-m --first-parent`: em commits de merge mostra os arquivos alterados em
    // relação ao primeiro pai (o que o merge trouxe para a branch). Sem isso o
    // git usa o "combined diff", que quase sempre vem vazio para merges.
    let output = git_command(&path)
        .arg("show")
        .arg("-m")
        .arg("--first-parent")
        .arg("--name-status")
        .arg("--pretty=format:%H%n%an%n%ae%n%ad%n%s%n%P%n%b%x00")
        .arg(&hash)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Cabeçalho (hash, autor, email, data, assunto, pais, corpo) termina no NUL;
    // depois vem a lista de arquivos. Antes o corpo e os pais eram separados
    // por heurística, o que quebrava em commits sem pai ou com corpo vazio.
    let (header, files_part) = stdout.split_once('\0').unwrap_or((&stdout, ""));
    let mut header_lines = header.split('\n');
    let commit_hash = header_lines.next().unwrap_or("").to_string();
    let author_name = header_lines.next().unwrap_or("").to_string();
    let author_email = header_lines.next().unwrap_or("").to_string();
    let author_date = header_lines.next().unwrap_or("").to_string();
    let subject = header_lines.next().unwrap_or("").to_string();
    let parents: Vec<String> = header_lines
        .next()
        .unwrap_or("")
        .split_whitespace()
        .map(|p| p.to_string())
        .collect();
    let body = header_lines.collect::<Vec<_>>().join("\n").trim().to_string();

    let mut files: Vec<Value> = Vec::new();
    for line in files_part.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split('\t').collect();

        if parts.len() >= 2 {
            // Renomeações/cópias vêm como "R100<TAB>antigo<TAB>novo": usa o novo.
            let clean_path = parts[parts.len() - 1].trim_matches('"').trim();

            files.push(json!({
                "file": clean_path,
                "status": parts[0].trim(),
                "changes": ""
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

#[tauri::command]
pub async fn get_multiple_commits_subjects(path: String, hashes: Vec<String>) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || get_multiple_commits_subjects_blocking(path, hashes))
        .await
        .map_err(|error| error.to_string())?
}

pub fn get_multiple_commits_subjects_blocking(
    path: String,
    hashes: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    let mut result = HashMap::new();
    if hashes.is_empty() {
        return Ok(result);
    }

    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(&path)
        .arg("log")
        .arg("--no-walk")
        .arg("--pretty=format:%H||%s");

    for hash in &hashes {
        if !hash.trim().is_empty() {
            cmd.arg(hash);
        }
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split("||").collect();
            if parts.len() == 2 {
                result.insert(parts[0].to_string(), parts[1].to_string());
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String, description: String, amend: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || git_commit_blocking(repo_path, message, description, amend))
        .await
        .map_err(|error| error.to_string())?
}

pub fn git_commit_blocking(
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

fn is_image_file(path: &str) -> bool {
    matches!(
        Path::new(path)
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "ico")
    )
}

fn extract_revision_file(
    repo_path: &str,
    revision: &str,
    file_path: &str,
    destination: &Path,
) -> Result<Option<String>, String> {
    let revision_file = format!("{}:{}", revision, file_path.replace('\\', "/"));
    let output = git_command(repo_path)
        .args(["show", &revision_file])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    fs::write(destination, output.stdout).map_err(|error| error.to_string())?;
    Ok(Some(destination.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn get_commit_file_diff(
    repo_path: String,
    commit_sha: String,
    file_path: String,
) -> Result<serde_json::Value, String> {
    // Compara com o primeiro pai. Antes era `<sha>^!`, que em commits de merge
    // gera um "combined diff" (`diff --cc`) que o visualizador não entende.
    let diff_against = |base: &str| {
        git_command(&repo_path)
            .arg("diff")
            .arg(base)
            .arg(&commit_sha)
            .arg("--")
            .arg(&file_path)
            .output()
            .map_err(|error| error.to_string())
    };
    let mut diff_output = diff_against(&format!("{}^1", commit_sha))?;
    if !diff_output.status.success() {
        // Commit raiz (sem pai): compara com a árvore vazia do git.
        diff_output = diff_against("4b825dc642cb6eb9a060e54bf8d69288fbee4904")?;
    }

    if !diff_output.status.success() {
        return Err(String::from_utf8_lossy(&diff_output.stderr).to_string());
    }

    let diff_text = String::from_utf8_lossy(&diff_output.stdout).to_string();
    let mut old_file = None;
    let mut new_file = None;

    if is_image_file(&file_path) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos();
        let preview_dir = std::env::temp_dir()
            .join("devbrook_commit_previews")
            .join(format!("{}-{}", std::process::id(), timestamp));
        fs::create_dir_all(&preview_dir).map_err(|error| error.to_string())?;

        let extension = Path::new(&file_path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("img");
        let old_path = preview_dir.join(format!("old.{}", extension));
        let new_path = preview_dir.join(format!("new.{}", extension));

        old_file = extract_revision_file(
            &repo_path,
            &format!("{}^", commit_sha),
            &file_path,
            &old_path,
        )?;
        new_file = extract_revision_file(&repo_path, &commit_sha, &file_path, &new_path)?;
    }

    Ok(serde_json::json!({
        "diff": diff_text,
        "oldFile": old_file,
        "newFile": new_file
    }))
}

#[tauri::command]
pub async fn get_last_commit_for_path(path: String, branch: String, file_path: String) -> Result<Option<Commit>, String> {
    tauri::async_runtime::spawn_blocking(move || get_last_commit_for_path_blocking(path, branch, file_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn get_last_commit_for_path_blocking(
    path: String,
    branch: String,
    file_path: String,
) -> Result<Option<Commit>, String> {
    let mut args = vec![
        "log",
        "-n",
        "1",
        "--pretty=format:%H|%an|%ae|%ad|%s",
        &branch,
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
        graph_symbol: None,
    }))
}

#[tauri::command]
pub async fn get_path_history(path: String, branch: String, file_path: String) -> Result<Vec<Commit>, String> {
    tauri::async_runtime::spawn_blocking(move || get_path_history_blocking(path, branch, file_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn get_path_history_blocking(
    path: String,
    branch: String,
    file_path: String,
) -> Result<Vec<Commit>, String> {
    let output = git_command(&path)
        .args(&[
            "log",
            "--pretty=format:%H|%an|%ae|%ad|%s",
            "--follow",
            &branch,
            "--",
            &file_path,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 5 {
                return None;
            }
            Some(Commit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                email: parts[2].to_string(),
                date: parts[3].to_string(),
                message: parts[4].to_string(),
                graph_symbol: None,
            })
        })
        .collect();

    Ok(commits)
}

/// Cache do "último commit" de cada pasta, por (repositório, commit, pasta).
/// Como a chave é o SHA resolvido da branch, o resultado nunca fica velho:
/// se a branch andar, o SHA muda e a pasta é recalculada.
type DirectoryCache = std::sync::Mutex<HashMap<(String, String, String), Vec<FileEntry>>>;
static DIRECTORY_CACHE: std::sync::OnceLock<DirectoryCache> = std::sync::OnceLock::new();
const DIRECTORY_CACHE_LIMIT: usize = 300;

fn directory_cache() -> &'static DirectoryCache {
    DIRECTORY_CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn normalize_folder(folder_path: &str) -> String {
    if folder_path == "." {
        String::new()
    } else {
        folder_path.trim_matches('/').to_string()
    }
}

fn resolve_commit_sha(repo_path: &str, branch: &str) -> Option<String> {
    let repo = git2::Repository::open(repo_path).ok()?;
    let commit = repo.revparse_single(branch).ok()?.peel_to_commit().ok()?;
    Some(commit.id().to_string())
}

/// Lista os itens de uma pasta numa branch (um único `git ls-tree`).
/// `-z` evita aspas/escape em nomes com espaços ou acentos.
fn list_directory_items(repo_path: &str, branch: &str, folder: &str) -> Result<Vec<(String, bool)>, String> {
    let target_path = if folder.is_empty() {
        format!("{}:", branch)
    } else {
        format!("{}:{}/", branch, folder)
    };

    let output = git_command(repo_path)
        .args(["ls-tree", "-z", &target_path])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let mut items = Vec::new();
    for record in output.stdout.split(|byte| *byte == 0) {
        if record.is_empty() {
            continue;
        }
        let record = String::from_utf8_lossy(record);
        let Some((info, name)) = record.split_once('\t') else { continue };
        let is_dir = info.split_whitespace().nth(1) == Some("tree");
        items.push((name.to_string(), is_dir));
    }
    Ok(items)
}

fn sort_entries(entries: &mut [FileEntry]) {
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return b.is_dir.cmp(&a.is_dir);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });
}

fn build_entries(folder: &str, items: Vec<(String, bool)>) -> Vec<FileEntry> {
    let mut entries: Vec<FileEntry> = items
        .into_iter()
        .map(|(name, is_dir)| {
            let path = if folder.is_empty() { name.clone() } else { format!("{}/{}", folder, name) };
            FileEntry { name, path, is_dir, last_commit: None }
        })
        .collect();
    sort_entries(&mut entries);
    entries
}

/// Lista a pasta SEM o último commit (rápido). A tela de arquivos mostra isso
/// na hora e depois completa com `list_directory_with_commits`.
#[tauri::command]
pub async fn list_directory(repo_path: String, branch: String, folder_path: String) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = normalize_folder(&folder_path);
        // Se a pasta já está no cache, devolve completa de uma vez.
        if let Some(sha) = resolve_commit_sha(&repo_path, &branch) {
            let key = (repo_path.clone(), sha, folder.clone());
            if let Some(cached) = directory_cache().lock().ok().and_then(|cache| cache.get(&key).cloned()) {
                return Ok(cached);
            }
        }
        let items = list_directory_items(&repo_path, &branch, &folder)?;
        Ok(build_entries(&folder, items))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_directory_with_commits(repo_path: String, branch: String, folder_path: String) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_directory_with_commits_blocking(repo_path, branch, folder_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn list_directory_with_commits_blocking(
    repo_path: String,
    branch: String,
    folder_path: String,
) -> Result<Vec<FileEntry>, String> {
    let folder = normalize_folder(&folder_path);
    let cache_key = resolve_commit_sha(&repo_path, &branch)
        .map(|sha| (repo_path.clone(), sha, folder.clone()));

    if let Some(key) = &cache_key {
        if let Some(cached) = directory_cache().lock().ok().and_then(|cache| cache.get(key).cloned()) {
            return Ok(cached);
        }
    }

    let items = list_directory_items(&repo_path, &branch, &folder)?;

    // Um `git log -n 1 -- <item>` por item, em paralelo. Testamos uma passada
    // única pelo histórico (libgit2 e `git log --name-only`), mas o git CLI
    // por item, que usa o commit-graph, foi mais rápido na maioria das pastas.
    let mut entries: Vec<FileEntry> = build_entries(&folder, items)
        .into_par_iter()
        .map(|mut entry| {
            entry.last_commit =
                get_last_commit_for_path_blocking(repo_path.clone(), branch.clone(), entry.path.clone())
                    .unwrap_or(None);
            entry
        })
        .collect();
    sort_entries(&mut entries);

    if let Some(key) = cache_key {
        if let Ok(mut cache) = directory_cache().lock() {
            if cache.len() >= DIRECTORY_CACHE_LIMIT {
                cache.clear();
            }
            cache.insert(key, entries.clone());
        }
    }

    Ok(entries)
}
