use std::env::temp_dir;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::utils::git_command;

fn spawn_vscode(args: &[String]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let available = Command::new("cmd")
            .args(["/C", "where", "code"])
            .creation_flags(0x08000000)
            .status()
            .map_err(|error| format!("Não foi possível localizar o VS Code: {}", error))?;
        if !available.success() {
            return Err("O comando `code` não foi encontrado no PATH do Windows.".to_string());
        }

        Command::new("cmd")
            .arg("/C")
            .arg("code")
            .args(args)
            .creation_flags(0x08000000)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Não foi possível abrir o VS Code: {}", error))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("code")
            .args(args)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Não foi possível abrir o VS Code: {}", error))
    }
}

#[tauri::command]
pub fn open_vscode(path: String) -> Result<(), String> {
    spawn_vscode(&[path])
}

#[tauri::command]
pub fn open_vscode_diff(file1: String, file2: String) -> Result<(), String> {
    spawn_vscode(&["--diff".to_string(), file1, file2])
}

#[tauri::command]
pub fn open_vscode_git_diff(repo_path: String, file_path: String) -> Result<(), String> {
    let target = format!("HEAD:{}", file_path.replace('\\', "/"));
    let mut child = git_command(&repo_path)
        .args(["show", &target])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Falha ao executar git show: {}", error))?;
    let mut stdout = child.stdout.take().ok_or_else(|| "Falha ao ler a versão anterior do arquivo".to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let temp_file_path = temp_dir().join(format!(
        "devbrook_vscode_head_{}_{}.tmp",
        std::process::id(),
        timestamp
    ));
    let mut temp_file = File::create(&temp_file_path)
        .map_err(|error| format!("Erro ao criar arquivo temporário para o VS Code: {}", error))?;
    io::copy(&mut stdout, &mut temp_file)
        .map_err(|error| format!("Erro ao copiar a versão anterior do arquivo: {}", error))?;
    let status = child.wait().map_err(|error| error.to_string())?;

    if !status.success() {
        let current_file = Path::new(&repo_path).join(&file_path);
        let mut stderr = String::new();
        if let Some(mut stream) = child.stderr.take() {
            let _ = stream.read_to_string(&mut stderr);
        }
        let _ = fs::remove_file(&temp_file_path);

        if current_file.is_file() {
            return spawn_vscode(&[current_file.to_string_lossy().to_string()]);
        }

        return Err(format!(
            "Não foi possível obter a versão anterior do arquivo: {}",
            stderr.trim()
        ));
    }

    let current_file = Path::new(&repo_path).join(&file_path);
    let result = spawn_vscode(&[
        "--diff".to_string(),
        temp_file_path.to_string_lossy().to_string(),
        current_file.to_string_lossy().to_string(),
    ]);

    if result.is_err() {
        let _ = fs::remove_file(&temp_file_path);
    }

    result
}
