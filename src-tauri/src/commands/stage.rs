use std::path::Path;
use std::process::Command;
use tauri::command;
use std::fs;
use std::env::temp_dir;
use serde_json::json;

#[tauri::command]
pub fn list_local_changes(path: String) -> Result<Vec<serde_json::Value>, String> {
    use std::process::Command;
    use serde_json::json;

    let output = Command::new("git")
        .arg("-C")
        .arg(&path)
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

        // Segurança: algumas saídas podem ser menores, proteja slices
        let code = if line.len() >= 2 { &line[0..2] } else { line };
        let file_path = if line.len() > 3 { line[3..].to_string() } else { "".to_string() };

        // Caso especial: diretório untracked (ex: "?? src/components/layout/")
        if code == "??" && file_path.ends_with('/') {
            // lista arquivos não rastreados dentro da pasta
            let list_output = Command::new("git")
                .arg("-C")
                .arg(&path)
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
                    if f.trim().is_empty() {
                        continue;
                    }
                    changes.push(json!({
                        "path": f.to_string(),
                        "status": "untracked",
                        "staged": false
                    }));
                }
            } else {
                // se falhar, caia para incluir a própria pasta (fallback)
                changes.push(json!({
                    "path": file_path.clone(),
                    "status": "untracked",
                    "staged": false
                }));
            }

            continue; // já processamos essa linha
        }

        // Normal: interpretar os dois chars de status
        let (status, staged_flag) = match code {
            " M" | "MM" | "M " => ("modified", code.starts_with('M')),
            "A " | " A" => ("added", code.starts_with('A')),
            "D " | " D" => ("deleted", code.starts_with('D')),
            "R " | " R" => ("renamed", code.starts_with('R')),
            "C " | " C" => ("copied", code.starts_with('C')),
            "??" => ("untracked", false),
            _ => ("unknown", code.chars().next().map(|c| c != ' ').unwrap_or(false)),
        };

        changes.push(json!({
            "path": file_path,
            "status": status,
            "staged": staged_flag
        }));
    }

    Ok(changes)
}


/// Stage arquivos (git add)
#[command]
pub fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(&path).arg("add").args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

/// Unstage arquivos (git reset)
#[command]
pub fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(&path).arg("reset").args(&files);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[command]
pub fn discard_changes(path: String, files: Vec<String>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(&path).arg("checkout").arg("--");
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

    // Verifica se é untracked
    let status_output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
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

    // Se não for untracked → usa git diff normal
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(&repo_path);

    if staged {
        cmd.args(["diff", "--cached", "--"]).arg(&file);
    } else {
        cmd.args(["diff", "--"]).arg(&file);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    let diff_str = String::from_utf8_lossy(&output.stdout).to_string();

    // ⚡ Detecta binário (git diff retorna "Binary files ... differ")
    if diff_str.contains("Binary files") {
        // cria arquivo temporário para versão antiga
        let mut show_cmd = Command::new("git");
        show_cmd.arg("-C").arg(&repo_path);
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

    // Caso normal (texto)
    Ok(json!({
        "diff": diff_str,
        "oldFile": null,
        "newFile": null
    }))
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
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
