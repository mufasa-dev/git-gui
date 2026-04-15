use crate::utils::{git_command_async, git_command};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageStats {
    pub code_files: usize,
    pub test_files: usize,
    pub other_files: usize,
    pub percent: f64,
}

#[tauri::command]
pub async fn get_code_coverage_ratio(path: String, branch: String) -> Result<CoverageStats, String> {
    // Usamos git ls-tree para listar arquivos de uma branch específica
    let output = git_command_async(&path)
        .args(["ls-tree", "-r", "--name-only", &branch]) 
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let files = String::from_utf8_lossy(&output.stdout);
    let mut code = 0;
    let mut tests = 0;
    let mut others = 0;

    for line in files.lines() {
        let l = line.to_lowercase();
        // Lógica de classificação
        if l.contains("test") || l.contains("spec") || l.starts_with("tests/") {
            tests += 1;
        } else if l.ends_with(".ts") || l.ends_with(".tsx") || l.ends_with(".rs") || l.ends_with(".js") {
            code += 1;
        } else {
            others += 1;
        }
    }

    let total_logic = code + tests;
    let percent = if total_logic > 0 {
        (tests as f64 / total_logic as f64) * 100.0
    } else { 0.0 };

    Ok(CoverageStats { code_files: code, test_files: tests, other_files: others, percent })
}

#[derive(serde::Serialize)]
pub struct FileHotspot {
    pub name: String,
    pub count: usize,
}

#[tauri::command]
pub async fn get_most_modified_files(path: String, branch: String) -> Result<Vec<FileHotspot>, String> {
    let output = git_command(&path)
        .current_dir(&path)
        .args([
            "log",
            &branch,
            "--format=",
            "--name-only",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for line in stdout.lines() {
        if line.is_empty() { continue; }
        *counts.entry(line.to_string()).or_insert(0) += 1;
    }

    let mut hotspots: Vec<FileHotspot> = counts
        .into_iter()
        .map(|(name, count)| FileHotspot { name, count })
        .collect();

    // Ordena do maior para o menor e pega os 10 primeiros
    hotspots.sort_by(|a, b| b.count.cmp(&a.count));
    hotspots.truncate(10);

    Ok(hotspots)
}

#[tauri::command]
pub async fn get_user_most_modified_files(
    path: String, 
    branch: String, 
    email: String // Novo parâmetro
) -> Result<Vec<FileHotspot>, String> {
    let output = git_command(&path)
        .current_dir(&path)
        .args([
            "log",
            &branch,
            &format!("--author={}", email), // Filtra pelo e-mail do usuário
            "--format=",       // Não queremos a mensagem do commit
            "--name-only",     // Apenas os nomes dos arquivos
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        
        if trimmed.contains("node_modules/") || trimmed.ends_with(".lock") {
            continue;
        }

        *counts.entry(trimmed.to_string()).or_insert(0) += 1;
    }

    let mut hotspots: Vec<FileHotspot> = counts
        .into_iter()
        .map(|(name, count)| FileHotspot { name, count })
        .collect();

    hotspots.sort_by(|a, b| b.count.cmp(&a.count));
    hotspots.truncate(10);

    Ok(hotspots)
}