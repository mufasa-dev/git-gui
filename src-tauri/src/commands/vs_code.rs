use std::process::Command;

#[tauri::command]
pub fn open_vscode(path: String) {
    Command::new("code")
        .arg(path)
        .spawn()
        .expect("Falha ao abrir VSCode. Verifique se o comando `code` está no PATH.");
}

#[tauri::command]
pub fn open_vscode_diff(file1: String, file2: String) {
    std::process::Command::new("code")
        .arg("--diff")
        .arg(file1)
        .arg(file2)
        .spawn()
        .expect("Falha ao abrir VSCode em modo diff. Verifique se o comando `code` está no PATH.");
}

#[tauri::command]
pub fn open_vscode_git_diff(repo_path: String, file_path: String) {
    use std::{fs, process::Command};
    use std::env::temp_dir;

    // Recupera conteúdo da versão em HEAD
    let output = Command::new("git")
        .args(&["show", &format!("HEAD:{}", file_path)])
        .current_dir(&repo_path)
        .output()
        .expect("Falha ao executar git show");

    if !output.status.success() {
        eprintln!("Erro ao obter conteúdo do git show");
        return;
    }

    let temp_file_path = temp_dir().join("vscode_diff_head.tmp");
    fs::write(&temp_file_path, output.stdout).expect("Erro ao escrever arquivo temporário");

    // Abre VS Code em modo diff
    Command::new("code")
        .arg("--diff")
        .arg(temp_file_path.to_str().unwrap())
        .arg(format!("{}/{}", repo_path, file_path))
        .spawn()
        .expect("Falha ao abrir VSCode em modo diff");
}
