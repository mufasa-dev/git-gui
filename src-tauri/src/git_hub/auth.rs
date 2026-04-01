use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct GitHubTokenResponse {
    access_token: String,
    #[allow(dead_code)]
    token_type: String,
    #[allow(dead_code)]
    scope: String,
}

#[derive(Serialize)]
pub struct AuthResult {
    token: String,
    provider: String,
}

#[tauri::command]
pub async fn exchange_code_for_token(
    code: String,
    client_id: String,
    client_secret: String,
) -> Result<AuthResult, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("code", &code),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let token_data: GitHubTokenResponse = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(AuthResult {
        token: token_data.access_token,
        provider: "github".into(),
    })
}