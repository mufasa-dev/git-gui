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
pub fn load_image_base64(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(format!(
        "data:{};base64,{}",
        image_mime_type(&path),
        general_purpose::STANDARD.encode(data)
    ))
}
