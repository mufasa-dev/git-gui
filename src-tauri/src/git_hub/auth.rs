use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct GitHubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Serialize)]
pub struct AuthResult {
    token: String,
    provider: String,
}

fn parse_token_response(status: reqwest::StatusCode, body: &str) -> Result<String, String> {
    let token_data: GitHubTokenResponse = serde_json::from_str(body)
        .map_err(|_| "Resposta inválida do GitHub durante a autenticação.".to_string())?;

    if !status.is_success() {
        let message = token_data
            .error_description
            .or(token_data.error)
            .unwrap_or_else(|| format!("GitHub retornou HTTP {}.", status.as_u16()));
        return Err(message);
    }

    token_data
        .access_token
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| "O GitHub não retornou um token de acesso.".to_string())
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

    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;
    let token = parse_token_response(status, &body)?;

    Ok(AuthResult {
        token,
        provider: "github".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::parse_token_response;

    #[test]
    fn accepts_a_non_empty_access_token() {
        let token = parse_token_response(
            reqwest::StatusCode::OK,
            r#"{"access_token":"gho_test","token_type":"bearer"}"#,
        )
        .expect("token should be accepted");

        assert_eq!(token, "gho_test");
    }

    #[test]
    fn rejects_a_success_response_without_a_token() {
        let result = parse_token_response(reqwest::StatusCode::OK, r#"{"token_type":"bearer"}"#);

        assert!(result.is_err());
    }

    #[test]
    fn returns_github_error_description() {
        let result = parse_token_response(
            reqwest::StatusCode::BAD_REQUEST,
            r#"{"error":"bad_verification_code","error_description":"The code passed is incorrect."}"#,
        );

        assert_eq!(
            result.expect_err("the request should fail"),
            "The code passed is incorrect."
        );
    }
}
