use crate::utils::git_command;
use std::io::Write;

#[tauri::command]
pub fn merge_branch(repo_path: String, from_branch: String, to_branch: String) -> Result<String, String> {
    // Primeiro: garantir que estamos na branch destino
    let checkout_output = git_command(&repo_path)
        .arg("checkout")
        .arg(&to_branch)
        .output()
        .map_err(|e| e.to_string())?;

    if !checkout_output.status.success() {
        return Err(String::from_utf8_lossy(&checkout_output.stderr).to_string());
    }

    // Agora: fazer o merge da origem na destino
    let merge_output = git_command(&repo_path)
        .arg("merge")
        .arg(&from_branch)
        .output()
        .map_err(|e| e.to_string())?;

    if !merge_output.status.success() {
        return Err(String::from_utf8_lossy(&merge_output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&merge_output.stdout).to_string())
}

#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    
    file.write_all(&[0xEF, 0xBB, 0xBF]).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    
    Ok(())
}