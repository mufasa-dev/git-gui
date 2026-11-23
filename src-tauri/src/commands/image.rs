use crate::utils::git_command;
use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::Path;

fn image_mime_type(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        _ => "image/png",
    }
}

#[tauri::command]
pub async fn load_image_base64(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || load_image_base64_blocking(path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn load_image_base64_blocking(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(format!(
        "data:{};base64,{}",
        image_mime_type(&path),
        general_purpose::STANDARD.encode(data)
    ))
}

/// Lê uma imagem direto do git (ex.: `HEAD:src/a.png` ou `:src/a.png` para o
/// index) e devolve como data URL. Usado para mostrar a versão antiga no diff.
#[tauri::command]
pub async fn load_git_image_base64(repo_path: String, spec: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = git_command(&repo_path)
            .args(["show", &spec])
            .output()
            .map_err(|error| error.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let path = spec.rsplit_once(':').map(|(_, path)| path).unwrap_or(&spec);
        Ok(format!(
            "data:{};base64,{}",
            image_mime_type(path),
            general_purpose::STANDARD.encode(output.stdout)
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}
