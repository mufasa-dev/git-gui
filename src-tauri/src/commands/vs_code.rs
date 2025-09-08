use std::process::Command;

#[tauri::command]
pub fn open_vscode(path: String) {
    Command::new("code")
        .arg(path)
        .spawn()
        .expect("Falha ao abrir VSCode. Verifique se o comando `code` está no PATH.");
}
