use open;
use std::process::Command;

#[tauri::command]
pub fn open_console(path: String) {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .current_dir(path)
            .spawn()
            .expect("Falha ao abrir Console");
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("gnome-terminal")
            .current_dir(path)
            .spawn()
            .expect("Falha ao abrir terminal");
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-a")
            .arg("Terminal")
            .current_dir(path)
            .spawn()
            .expect("Falha ao abrir Terminal");
    }
}

#[tauri::command]
pub fn open_file_manager(path: String) {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .expect("Falha ao abrir Explorer");
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .expect("Falha ao abrir gerenciador de arquivos");
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .expect("Falha ao abrir Finder");
    }
}

#[tauri::command]
pub fn open_browser(url: String) {
    open::that(url).expect("Falha ao abrir navegador");
}

#[tauri::command]
pub fn open_vscode(path: String) {
    Command::new("code")
        .arg(path)
        .spawn()
        .expect("Falha ao abrir VSCode. Verifique se o comando `code` está no PATH.");
}

#[tauri::command]
pub fn open_git_bash(_path: String) {
    #[cfg(target_os = "windows")]
    {
        Command::new("C:\\Program Files\\Git\\git-bash.exe")
            .current_dir(_path)
            .spawn()
            .expect("Falha ao abrir Git Bash");
    }

    #[cfg(not(target_os = "windows"))]
    {
        eprintln!("Git Bash só está disponível no Windows");
    }
}
