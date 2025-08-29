use std::process::Command;
use tauri::command;
use std::path::Path;

#[tauri::command]
pub fn list_local_changes(path: String) -> Result<Vec<serde_json::Value>, String> {
    use std::process::Command;

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

        let status_chars: Vec<char> = line.chars().collect();
        let staged_flag = status_chars[0] != ' ';
        let status_code = format!("{}{}", status_chars[0], status_chars[1]);
        let file_path = line[3..].to_string();

        let status = match status_code.trim() {
            "M" | " M" | "MM" => "modified",
            "A" | " A" => "added",
            "D" | " D" => "deleted",
            "R" | " R" => "renamed",
            "C" | " C" => "copied",
            "??" => "untracked",
            _ => "unknown",
        };

        changes.push(serde_json::json!({
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
    cmd.arg("-C").arg(&path)
        .arg("add")
        .args(&files);

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
    cmd.arg("-C").arg(&path)
        .arg("reset")
        .args(&files);

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
pub fn get_diff(repo_path: String, file: String, staged: bool) -> Result<String, String> {
    // Caminho absoluto do arquivo
    let file_path = Path::new(&repo_path).join(&file);

    // Verifica se é untracked
    let status_output = Command::new("git")
        .arg("-C").arg(&repo_path)
        .arg("ls-files").arg("--others").arg("--exclude-standard").arg(&file)
        .output()
        .map_err(|e| e.to_string())?;

    if !status_output.stdout.is_empty() {
        // Arquivo é untracked → mostra conteúdo inteiro como "added"
        let content = std::fs::read_to_string(&file_path).unwrap_or_default();
        let diff = format!(
            "diff --git a/{f} b/{f}\nnew file mode 100644\n--- /dev/null\n+++ b/{f}\n+{c}",
            f = file,
            c = content.replace("\n", "\n+")
        );
        return Ok(diff);
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
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}