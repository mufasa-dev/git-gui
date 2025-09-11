use std::process::Command;
use tauri::command;

#[command]
pub async fn open_pull_request(path: String, branch: String) -> Result<(), String> {
    // pega a URL remota
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

    // converte SSH → HTTPS
    let mut web_url = if url.starts_with("git@") {
        url.replace("git@", "https://").replace(":", "/")
    } else {
        url.clone()
    };

    if web_url.ends_with(".git") {
        web_url = web_url.trim_end_matches(".git").to_string();
    }

    // branch alvo padrão (pode depois buscar dinamicamente com git symbolic-ref refs/remotes/origin/HEAD)
    let target_branch = "main";

    // monta a URL do PR
    let pr_url = if web_url.contains("github.com") {
        format!("{}/compare/{}...{}?expand=1", web_url, target_branch, branch)
    } else if web_url.contains("gitlab.com") {
        format!(
            "{}/-/merge_requests/new?merge_request[source_branch]={}&merge_request[target_branch]={}",
            web_url, branch, target_branch
        )
    } else if web_url.contains("dev.azure.com") || web_url.contains("visualstudio.com") {
        format!(
            "{}/pullrequestcreate?sourceRef={}&targetRef={}",
            web_url, branch, target_branch
        )
    } else {
        return Err(format!("Serviço Git desconhecido: {}", web_url));
    };

    // abre no navegador
    open::that(pr_url).map_err(|e| format!("Falha ao abrir navegador: {}", e))?;

    Ok(())
}