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

#[tauri::command]
pub async fn register_with_supabase(email: String, password: String, full_name: String) -> Result<AuthResponse, String> {
    let client = reqwest::Client::new();
    let supabase_url = env::var("SUPABASE_URL").expect("SUPABASE_URL não definida");
    let anon_key = env::var("SUPABASE_ANON_KEY").expect("SUPABASE_ANON_KEY não definida");
    
    // 1. Registro no Supabase
    let auth_endpoint = format!("{}/auth/v1/signup", supabase_url);
    let auth_res = client
        .post(auth_endpoint)
        .header("apikey", &anon_key)
        .header("Authorization", format!("Bearer {}", anon_key))
        .json(&serde_json::json!({ "email": email, "password": password }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let auth_data: AuthResponse = auth_res.json().await.map_err(|e| e.to_string())?;

    // 2. Sincronização com sua API Go (se houver token)
    if let Some(token) = &auth_data.access_token {

        let api_url = env::var("GO_API_URL").expect("GO_API_URL não definida");
        let api_url = format!("{}/api/v1/user/register", api_url);
        
        let api_res = client
            .post(api_url)
            .header("Authorization", format!("Bearer {}", token)) // Token que o Go vai validar
            .json(&serde_json::json!({ "full_name": full_name }))
            .send()
            .await;

        match api_res {
            Ok(res) if res.status().is_success() => println!("Perfil sincronizado com Go!"),
            Ok(res) => return Err(format!("Erro na API Go: Status {}", res.status())),
            Err(e) => return Err(format!("Falha ao conectar na API Go: {}", e)),
        }
    }

    Ok(auth_data)
}