use std::path::Path;
use std::process::Command;
use tauri::command;

#[tauri::command]
pub fn open_repo(path: String) -> Result<String, String> {
    if Path::new(&path).join(".git").exists() {
        Ok(format!("Repositório válido em {}", path))
    } else {
        Err("Não é um repositório Git válido".into())
    }
}

#[tauri::command]
pub fn push_repo(path: String, remote: Option<String>, branch: Option<String>) -> Result<String, String> {
    use std::process::Command;

    let remote_name = remote.unwrap_or("origin".to_string());
    let branch_name = branch.unwrap_or("HEAD".to_string());

    let output = Command::new("git")
        .args(["-C", &path, "push", &remote_name, &branch_name])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}