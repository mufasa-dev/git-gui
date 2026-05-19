use std::env;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    access_token: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub full_name: Option<String>,
    pub is_vip: bool,
    pub created_at: String,
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
pub async fn register_with_supabase(email: String, password: String, full_name: String, lang: String) -> Result<AuthResponse, String> {
    let client = reqwest::Client::new();
    let supabase_url = env::var("SUPABASE_URL").expect("SUPABASE_URL não definida");
    let anon_key = env::var("SUPABASE_ANON_KEY").expect("SUPABASE_ANON_KEY não definida");
    
    // 1. Registro no Supabase
    let auth_endpoint = format!(
        "{}/auth/v1/signup?redirect_to=https://dev-brook-landing-page.vercel.app/confirm-email", 
        supabase_url
    );
    
    // Passamos o full_name nos user_metadata do Supabase para não perder a informação,
    // já que não podemos chamar a API Go ainda.
    let auth_res = client
        .post(auth_endpoint)
        .header("apikey", &anon_key)
        .header("Authorization", format!("Bearer {}", anon_key))
        .json(&serde_json::json!({ 
            "email": email, 
            "password": password,
            "data": { 
                "full_name": full_name,
                "locale": lang
            }
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !auth_res.status().is_success() {
        let status_code = auth_res.status();
        
        // 1. Pegamos a resposta estritamente como texto/string bruta para não estourar o erro com '?'
        let raw_body = auth_res.text().await.unwrap_or_else(|_| "Não foi possível ler o corpo do erro".to_string());
        
        // 2. Printamos IMEDIATAMENTE no terminal o status e o body real enviado pelo Supabase
        println!("--- ERRO SUPABASE (Status: {}) ---", status_code);
        println!("{}", raw_body);
        println!("-----------------------------------");

        // 3. Tentamos parsear como JSON apenas para extrair a mensagem amigável para a UI
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&raw_body) {
            if let Some(message) = error_json["message"].as_str() {
                return Err(message.to_string());
            }
        }

        // Se não for um JSON ou não tiver "message", devolvemos o status HTTP
        return Err(format!("Erro ao criar conta (Status: {})", status_code));
    }

    let auth_data: AuthResponse = auth_res.json().await.map_err(|e| e.to_string())?;

    Ok(auth_data)
}

#[tauri::command]
pub async fn get_my_profile(token: String) -> Result<UserProfile, String> {
    let client = reqwest::Client::new();
    let api_url = env::var("GO_API_URL").expect("GO_API_URL não definida");
    let endpoint = format!("{}/api/v1/user/me", api_url);

    let response = client
        .get(endpoint)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Erro na requisição: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro da API Go: Status {}", response.status()));
    }

    let profile: UserProfile = response.json().await.map_err(|e| {
        format!("Erro ao processar perfil: {}", e)
    })?;

    Ok(profile)
}
