use std::env;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    access_token: Option<String>,
    error_description: Option<String>,
}

#[tauri::command]
pub async fn login_with_supabase(email: String, password: String) -> Result<AuthResponse, String> {
    let supabase_url = env::var("SUPABASE_URL").expect("SUPABASE_URL não definida");
    let anon_key = env::var("SUPABASE_ANON_KEY").expect("SUPABASE_ANON_KEY não definida");

    let auth_endpoint = format!("{}/auth/v1/token?grant_type=password", supabase_url);

    let client = reqwest::Client::new();
    let response = client
        .post(auth_endpoint)
        .header("apikey", &anon_key)
        .header("Content-Type", "application/json") // Importante garantir o content-type
        .json(&serde_json::json!({
            "email": email,
            "password": password,
        }))
        .send()
        .await
        .map_err(|e| format!("Falha na requisição: {}", e))?;

    // 1. Verificar se o status code é de erro (400, 401, 500, etc)
    if !response.status().is_success() {
        // Tenta pegar o erro do corpo da resposta do Supabase
        let error_body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        
        // O Supabase geralmente retorna {"error": "...", "error_description": "..."}
        let message = error_body["error_description"]
            .as_str()
            .or(error_body["message"].as_str())
            .unwrap_or("Credenciais inválidas ou erro no servidor");
            
        return Err(message.to_string());
    }

    // 2. Se chegou aqui, o status é 200 OK. Agora sim desserializamos o sucesso.
    let auth_data: AuthResponse = response.json().await.map_err(|e| {
        format!("Erro ao processar dados de autenticação: {}", e)
    })?;
    
    Ok(auth_data)
}