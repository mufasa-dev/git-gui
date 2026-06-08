use std::env;
use crate::utils::{git_command_async}; 

#[tauri::command]
pub async fn generate_commit_suggestion(repo_path: String, api_key: Option<String>) -> Result<Vec<String>, String> {
    // 1. Coleta o diff completo dos arquivos no Stage utilizando seu comando assíncrono
    let diff_output = git_command_async(&repo_path)
        .args(&["diff", "--cached"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let diff_content = String::from_utf8_lossy(&diff_output.stdout);
    if diff_content.trim().is_empty() {
        return Err("Nenhuma alteração preparada (staged) encontrada para analisar.".into());
    }

    let truncated_diff = if diff_content.len() > 12000 {
        format!("{}... [Diff truncado por tamanho]", &diff_content[..12000])
    } else {
        diff_content.into_owned()
    };

    // 2. Busca o título dos últimos 5 commits para dar contexto de estilo/idioma à IA
    let log_output = git_command_async(&repo_path)
        .args(&["log", "-n", "5", "--format=%s"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
        
    let recent_commits = String::from_utf8_lossy(&log_output.stdout);

    let prompt = format!(
        "You are an expert Git assistant tasked with generating a commit message and a detailed description.\n\n\
        REPOSITORY CONTEXT (Recent commit titles):\n\
        {}\n\n\
        CRITICAL INSTRUCTIONS:\n\
        1. LANGUAGE: Analyze the repository context above. If the previous commits are in English (e.g., using words like 'ajust', 'add', 'fix', 'reload'), you MUST write both the \"title\" and the \"description\" STRICTORLY IN ENGLISH.\n\
        2. FORMAT: The \"title\" must strictly follow the Conventional Commits specification (e.g., feat:, fix:, refactor:, chore:, docs:, style:, test:, translate:, assets:, ui:).\n\
        3. TITLE STYLE: Keep it concise, imperative, and clear. (e.g., 'ui: adjust profile layout').\n\
        4. DESCRIPTION STYLE: The description should details WHAT changed and WHY, using technical terms properly. Break lines naturally if needed.\n\n\
        OUTPUT FORMAT:\n\
        You must return strictly a JSON object with \"title\" and \"description\" keys. Do not include markdown blocks like ```json or any conversational text.\n\n\
        EXAMPLE OF EXPECTED OUTPUT:\n\
        {{\n  \"title\": \"feat: implement local change tracking\",\n  \"description\": \"- Add git service integration to monitor changes\\n- Create custom folder tree view for unstaged files\"\n}}\n\n\
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
            format!(
                "Estrutura inesperada na resposta da IA. O JSON recebido foi: {}", 
                res_body.to_string()
            )
        })?;

    let parsed_json: serde_json::Value = serde_json::from_str(ai_text)
        .map_err(|e| {
            format!(
                "A IA respondeu, mas não conseguimos converter para JSON válido ({}) Texto da IA:\n{}", 
                e, 
                ai_text
            )
        })?;

    let title = parsed_json["title"].as_str().unwrap_or("").to_string();
    let description = parsed_json["description"].as_str().unwrap_or("").to_string();

    Ok(vec![title, description])
}