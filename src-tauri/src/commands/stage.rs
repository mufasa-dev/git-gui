use std::path::Path;
use tauri::command;
use std::fs;
use std::env::temp_dir;
use serde_json::json;
use crate::utils::git_command;

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

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        // Git porcelain: 2 caracteres de status + 1 espaço + path
        let code = if line.len() >= 2 { &line[0..2] } else { "  " };
        let file_path = if line.len() > 3 { line[3..].trim_matches('"').to_string() } else { "".to_string() };

        let extension = Path::new(&file_path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let index_status = code.chars().next().unwrap_or(' ');
        let worktree_status = code.chars().nth(1).unwrap_or(' ');

        if index_status != ' ' && index_status != '?' {
            let status_msg = match index_status {
                'M' => "modified",
                'A' => "added",
                'D' => "deleted",
                'R' => "renamed",
                'C' => "copied",
                _ => "staged",
            };

            changes.push(json!({
                "path": file_path.clone(),
                "status": status_msg,
                "staged": true,
                "extension": extension.clone(),
                "oldValue": "" 
            }));
        }

        if worktree_status != ' ' {
            // Caso especial: Diretórios inteiros untracked (?? folder/)
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
                    for f in list_stdout.lines() {
                        let ext = Path::new(f).extension().and_then(|s| s.to_str()).unwrap_or("").to_string();
                        changes.push(json!({
                            "path": f.to_string(),
                            "status": "untracked",
                            "staged": false,
                            "extension": ext,
                            "oldValue": ""
                        }));
                    }
                    continue; 
                }
            }

            let mut status_msg = if (index_status == 'U' || index_status == 'A' || index_status == 'D') 
                && (worktree_status == 'U' || worktree_status == 'A' || worktree_status == 'D') {
                "conflicted"
            } else {
                match worktree_status {
                    'M' => "modified",
                    'D' => "deleted",
                    '?' => "untracked",
                    _ => "modified",
                }
            };
            let mut file_content = String::new();
            // Só tentamos ler se o arquivo não foi deletado
            if status_msg != "deleted" {
                let abs_path = Path::new(&path).join(&file_path);
                if let Ok(content) = fs::read_to_string(&abs_path) {
                    // Se encontrar os marcadores, forçamos o status para "conflicted"
                    if content.contains("<<<<<<<") && content.contains("=======") && content.contains(">>>>>>>") {
                        status_msg = "conflicted";
                    }
                    file_content = content;
                }
            }

            changes.push(json!({
                "path": file_path,
                "status": status_msg,
                "staged": false,
                "extension": extension,
                "oldValue": file_content
            }));
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

    // 1️⃣ Verifica se é untracked
    let status_output = git_command(&repo_path)
        .arg("ls-files")
        .arg("--others")
        .arg("--exclude-standard")
        .arg(&file)
        .output()
        .map_err(|e| e.to_string())?;

    if !status_output.stdout.is_empty() {
        // Arquivo é untracked → mostra conteúdo inteiro como "added"
        let content = fs::read_to_string(&file_path).unwrap_or_default();
        let diff = format!(
            "diff --git a/{f} b/{f}\nnew file mode 100644\n--- /dev/null\n+++ b/{f}\n+{c}",
            f = file,
            c = content.replace("\n", "\n+")
        );

        return Ok(json!({
            "diff": diff,
            "oldFile": null,
            "newFile": file_path.to_string_lossy().to_string()
        }));
    }

    // 2️⃣ Verifica se o arquivo tem conflito de merge
    if let Ok(content) = fs::read_to_string(&file_path) {
        if content.contains("<<<<<<<") && content.contains("=======") && content.contains(">>>>>>>") {
            // Arquivo em conflito → retorna conteúdo atual como "diff"
            return Ok(json!({
                "diff": content,
                "oldFile": null,
                "newFile": file_path.to_string_lossy().to_string(),
                "hasConflict": true
            }));
        }
    }

    // 3️⃣ Caso normal → usa git diff
    let mut cmd = git_command(&repo_path);

    if staged {
        cmd.args(["diff", "--cached", "--"]).arg(&file);
    } else {
        cmd.args(["diff", "--"]).arg(&file);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    let diff_str = String::from_utf8_lossy(&output.stdout).to_string();

    // 4️⃣ Detecta binário
    if diff_str.contains("Binary files") {
        let mut show_cmd = git_command(&repo_path);
        if staged {
            show_cmd.args(["show", &format!(":{}", file)]);
        } else {
            show_cmd.args(["show", &format!("HEAD:{}", file)]);
        }

        let show_output = show_cmd.output().map_err(|e| e.to_string())?;
        if !show_output.stdout.is_empty() {
            let tmp_path = temp_dir().join(format!("old_{}", file.replace("/", "_")));
            fs::write(&tmp_path, &show_output.stdout).map_err(|e| e.to_string())?;

            return Ok(json!({
                "diff": diff_str,
                "oldFile": tmp_path.to_string_lossy().to_string(),
                "newFile": file_path.to_string_lossy().to_string()
            }));
        }
    }

    // 5️⃣ Caso padrão
    Ok(json!({
        "diff": diff_str,
        "oldFile": null,
        "newFile": null
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
pub fn stash_changes(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["stash", "push", "-u"])
}

#[command]
pub fn stash_pop(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["stash", "pop"])
}

#[command]
pub fn reset_hard(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["reset", "--hard"])
}
