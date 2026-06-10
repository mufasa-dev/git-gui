use std::env;
use crate::utils::{git_command_async}; 

#[tauri::command]
pub async fn generate_commit_suggestion(repo_path: String, api_key: Option<String>) -> Result<Vec<String>, String> {
    // 1. Validação prévia: Conta quantos arquivos estão no Stage (staged)
    let files_output = git_command_async(&repo_path)
        .args(&["diff", "--cached", "--name-only"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let files_content = String::from_utf8_lossy(&files_output.stdout);
    let staged_files_count = files_content.lines().filter(|l| !l.trim().is_empty()).count();

    if staged_files_count == 0 {
        return Err("Nenhuma alteração preparada (staged) encontrada para analisar.".into());
    }

    // Se houverem muitos arquivos, interrompe antes de gastar tokens à toa
    if staged_files_count > 20 {
        return Err(format!(
            "Há muitos arquivos preparados ({}) para sugerir uma mensagem via IA. \
            Por favor, faça commits menores ou mais específicos por contexto.", 
            staged_files_count
        ));
    }

    // 2. Coleta o diff completo dos arquivos no Stage
    let diff_output = git_command_async(&repo_path)
        .args(&["diff", "--cached"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let diff_content = String::from_utf8_lossy(&diff_output.stdout);
    
    let truncated_diff = if diff_content.len() > 12000 {
        format!("{}... [Diff-truncated due to size constraints]", &diff_content[..12000])
    } else {
        diff_content.into_owned()
    };

    // 3. Busca o título dos últimos 5 commits para dar contexto de estilo/idioma à IA
    let log_output = git_command_async(&repo_path)
        .args(&["log", "-n", "5", "--format=%s"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
        
    let recent_commits = String::from_utf8_lossy(&log_output.stdout);

    let prompt = format!(
        "You are an expert Git assistant tasked with generating a high-level concise commit message and description.\n\n\
        REPOSITORY CONTEXT (Recent commit titles):\n\
        {}\n\n\
        CRITICAL INSTRUCTIONS:\n\
        1. LANGUAGE: Analyze the repository context above. If previous commits are in English, you MUST write both the \"title\" and \"description\" STRICTLY IN ENGLISH.\n\
        2. FORMAT: The \"title\" must strictly follow the Conventional Commits specification.\n\
        3. TITLE STYLE: Keep it concise, imperative, and brief (e.g., 'ui: update profile layout').\n\
        4. DESCRIPTION STYLE: Keep it SHORT and CONCISE. Avoid listing every single function or detailed UI behaviors. Use brief bullet points highlighting ONLY the high-level key features or changes made. Do not exceed 3 or 4 short bullets.\n\n\
        OUTPUT FORMAT:\n\
        You must return strictly a JSON object with \"title\" and \"description\" keys. Do not include markdown blocks like ```json or any conversational text.\n\n\
        EXAMPLE OF EXPECTED CONCISE OUTPUT:\n\
        {{\n  \"title\": \"feat: implement local change tracking\",\n  \"description\": \"- Add git integration to monitor project unstaged files\\n- Create a flexible custom folder tree view component\"\n}}\n\n\
        GIT DIFF TO ANALYZE:\n{}", 
        recent_commits,
        truncated_diff
    );

    let key = match api_key {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => {
            let env_key = env::var("GEMINI_API_KEY")
                .map_err(|_| "Chave de API do Gemini não encontrada. Configure a variável GEMINI_API_KEY no seu .env ou passe via parâmetro.".to_string())?;
            
            if env_key.trim().is_empty() {
                return Err("A variável GEMINI_API_KEY no seu .env está vazia.".into());
            }
            env_key.trim().to_string()
        }
    };

    let url_string = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}", 
        key
    );

    let valid_url = reqwest::Url::parse(&url_string)
        .map_err(|e| format!("Falha ao construir URL válida para a IA: {} (URL gerada: {})", e, url_string))?;

    let client = reqwest::Client::new();
    let response = client.post(valid_url)
        .json(&serde_json::json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": { "responseMimeType": "application/json" }
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let res_body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    if let Some(error) = res_body.get("error") {
        return Err(format!(
            "Erro na API do Gemini (Código {}): {}", 
            error["code"], 
            error["message"].as_str().unwrap_or("Erro desconhecido")
        ));
    }

    let ai_text = res_body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| {
            format!("Estrutura inesperada na resposta da IA: {}", res_body.to_string())
        })?;

    let parsed_json: serde_json::Value = serde_json::from_str(ai_text)
        .map_err(|e| {
            format!("A IA respondeu, mas não conseguimos converter para JSON válido ({}) Texto da IA:\n{}", e, ai_text)
        })?;

    let title = parsed_json["title"].as_str().unwrap_or("").to_string();
    let description = parsed_json["description"].as_str().unwrap_or("").to_string();

    Ok(vec![title, description])
}