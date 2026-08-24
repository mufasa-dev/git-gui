use crate::utils::git_command;
use tauri::command;

fn percent_encode_component(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                (*byte as char).to_string()
            } else {
                format!("%{:02X}", byte)
            }
        })
        .collect()
}

fn normalize_web_url(raw_url: &str) -> String {
    let url = raw_url.trim();
    let mut web_url = if let Some(rest) = url.strip_prefix("git@") {
        if let Some((host, path)) = rest.split_once(':') {
            format!("https://{host}/{path}")
        } else {
            url.to_string()
        }
    } else {
        url.to_string()
    };

    if let Some((scheme, rest)) = web_url.split_once("://") {
        if let Some(at) = rest.find('@') {
            let first_slash = rest.find('/').unwrap_or(rest.len());
            if at < first_slash {
                web_url = format!("{scheme}://{}", &rest[at + 1..]);
            }
        }
    }

    web_url.trim_end_matches(".git").trim_end_matches('/').to_string()
}

fn build_pull_request_url(web_url: &str, branch: &str, target_branch: &str) -> Result<String, String> {
    let encoded_branch = percent_encode_component(branch);
    let encoded_target_branch = percent_encode_component(target_branch);

    if web_url.contains("github.com") {
        Ok(format!(
            "{}/compare/{}...{}?expand=1",
            web_url, encoded_target_branch, encoded_branch
        ))
    } else if web_url.contains("gitlab.com") {
        Ok(format!(
            "{}/-/merge_requests/new?merge_request[source_branch]={}&merge_request[target_branch]={}",
            web_url, encoded_branch, encoded_target_branch
        ))
    } else if web_url.contains("dev.azure.com") || web_url.contains("visualstudio.com") {
        Ok(format!(
            "{}/pullrequestcreate?sourceRef={}&targetRef={}",
            web_url, encoded_branch, encoded_target_branch
        ))
    } else {
        Err(format!("Serviço Git desconhecido: {}", web_url))
    }
}

#[command]
pub async fn open_pull_request(path: String, branch: String) -> Result<(), String> {
    // 1️⃣ Pega a URL remota
    let output = git_command(&path)
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

    // 2️⃣ Converte SSH → HTTPS
    let web_url = normalize_web_url(&url);

    // 3️⃣ Detecta branch padrão dinamicamente
    let head_output = git_command(&path)
        .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
        .output();

    let target_branch = if let Ok(output) = head_output {
        if output.status.success() {
            let ref_str = String::from_utf8_lossy(&output.stdout);
            ref_str
                .trim()
                .strip_prefix("refs/remotes/origin/")
                .unwrap_or_else(|| ref_str.trim())
                .to_string()
        } else {
            "main".to_string()
        }
    } else {
        "main".to_string()
    };

    // 4️⃣ Monta a URL do PR conforme o serviço
    let pr_url = build_pull_request_url(&web_url, &branch, &target_branch)?;

    // 5️⃣ Abre no navegador
    open::that(pr_url).map_err(|e| format!("Falha ao abrir navegador: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{build_pull_request_url, normalize_web_url};

    #[test]
    fn encodes_special_characters_in_branch_names() {
        let url = build_pull_request_url(
            "https://dev.azure.com/org/project/_git/repository",
            "feature/#123 fix",
            "main",
        )
        .unwrap();

        assert_eq!(
            url,
            "https://dev.azure.com/org/project/_git/repository/pullrequestcreate?sourceRef=feature%2F%23123%20fix&targetRef=main"
        );
    }

    #[test]
    fn removes_embedded_credentials_from_remote_urls() {
        assert_eq!(
            normalize_web_url("https://user@dev.azure.com/org/project/_git/repository.git"),
            "https://dev.azure.com/org/project/_git/repository"
        );
    }
}
