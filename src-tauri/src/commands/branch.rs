use serde_json::json;
use std::process::Command;

#[tauri::command]
pub fn list_branches(path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .arg("branch")
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<String> = raw.lines().map(|line| line.trim().to_string()).collect();

    Ok(branches)
}

#[tauri::command]
pub fn list_remote_branches(path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .arg("branch")
        .arg("-r")
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let branches = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(branches)
    } else {
        Err("Erro ao listar branches remotas".into())
    }
}

#[tauri::command]
pub fn get_branch_status(repo_path: String) -> Result<Vec<serde_json::Value>, String> {
    use serde_json::json;
    use std::process::Command;

    let branches_output = Command::new("git")
        .args(["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    let branches_str = String::from_utf8_lossy(&branches_output.stdout);
    let mut branches = Vec::new();

    for branch in branches_str.lines() {
        // Verifica se tem upstream configurado
        let upstream_check = Command::new("git")
            .args(["rev-parse", "--abbrev-ref", &format!("{}@{{u}}", branch)])
            .current_dir(&repo_path)
            .output();

        if let Ok(up) = upstream_check {
            if up.status.success() {
                // Tem upstream: calcula ahead/behind
                let ahead = Command::new("git")
                    .args([
                        "rev-list",
                        "--count",
                        &format!("{}@{{u}}..{}", branch, branch),
                    ])
                    .current_dir(&repo_path)
                    .output();

                let behind = Command::new("git")
                    .args([
                        "rev-list",
                        "--count",
                        &format!("{}..{}@{{u}}", branch, branch),
                    ])
                    .current_dir(&repo_path)
                    .output();

                let ahead_count = ahead
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .and_then(|s| s.trim().parse::<u32>().ok())
                    .unwrap_or(0);

                let behind_count = behind
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .and_then(|s| s.trim().parse::<u32>().ok())
                    .unwrap_or(0);

                branches.push(json!({
                    "name": branch,
                    "ahead": ahead_count,
                    "behind": behind_count,
                    "hasUpstream": true
                }));
            } else {
                // Sem upstream
                branches.push(json!({
                    "name": branch,
                    "ahead": 0,
                    "behind": 0,
                    "hasUpstream": false
                }));
            }
        } else {
            // Erro no comando
            branches.push(json!({
                "name": branch,
                "ahead": 0,
                "behind": 0,
                "hasUpstream": false
            }));
        }
    }

    Ok(branches)
}

#[tauri::command]
pub fn get_current_branch(path: String) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["-C", &path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn checkout_branch(repo_path: String, branch: String) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .arg("checkout")
        .arg(&branch)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
