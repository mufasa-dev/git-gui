use crate::utils::git_command;

#[tauri::command]
pub fn get_git_config(path: String, key: String) -> Result<String, String> {
    let output = git_command(&path)
        .args(["config", "--get", &key])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        // Converte os bytes de saída para String e remove quebras de linha
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(result)
    } else {
        Ok("".to_string())
    }
}

#[tauri::command]
pub fn set_git_config(path: String, key: String, value: String) -> Result<(), String> {
    let output = git_command(&path)
        .args(["config", "--local", &key, &value])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("Erro ao configurar git: {}", err))
    }
}