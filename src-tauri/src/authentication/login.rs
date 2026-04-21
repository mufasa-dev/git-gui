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
        .header("Authorization", format!("Bearer {}", anon_key)) // O Supabase às vezes exige ambos
        .json(&serde_json::json!({
            "email": email,
            "password": password,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let auth_data: AuthResponse = response.json().await.map_err(|e| e.to_string())?;
    
    Ok(auth_data)
}