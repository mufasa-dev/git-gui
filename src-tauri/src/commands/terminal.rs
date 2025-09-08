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

#[tauri::command]
pub async fn open_repo_in_browser(path: String) -> Result<(), String> {
    // roda git config pra pegar a URL remota
    let output = Command::new("git")
        .arg("-C")
        .arg(&path)
        .args(["config", "--get", "remote.origin.url"])
        .output()
        .map_err(|e| format!("Erro ao executar git: {}", e))?;

    if !output.status.success() {
        return Err("Não foi possível obter remote.origin.url".into());
    }

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if url.is_empty() {
        return Err("Nenhuma URL encontrada para remote.origin.url".into());
    }

    // converte URLs SSH → HTTPS
    let mut web_url = if url.starts_with("git@") {
        // exemplo: git@github.com:user/repo.git → https://github.com/user/repo
        url.replace("git@", "https://")
            .replace(":", "/")
    } else {
        url.clone()
    };

    // remove sufixo .git
    if web_url.ends_with(".git") {
        web_url = web_url.trim_end_matches(".git").to_string();
    }

    // valida qual serviço é
    if web_url.contains("github.com") {
        // já tá certo
    } else if web_url.contains("gitlab.com") {
        // já tá certo
    } else if web_url.contains("dev.azure.com") || web_url.contains("visualstudio.com") {
        // Azure DevOps → já acessível direto
    } else {
        return Err(format!("Serviço Git desconhecido: {}", web_url));
    }

    // abre no navegador
    open::that(web_url).expect("Falha ao abrir navegador");

    Ok(())
}