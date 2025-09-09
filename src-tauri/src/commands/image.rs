use std::fs;
use base64::{engine::general_purpose, Engine as _};

#[tauri::command]
pub fn load_image_base64(path: String) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(data)))
}
