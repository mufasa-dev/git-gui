use crate::models::license::LicenseDetails;

#[tauri::command]
pub async fn check_license(token: String) -> Result<LicenseDetails, String> {
    let client = reqwest::Client::new();
    let api_url = std::env::var("GO_API_URL").expect("GO_API_URL não definida");
    let endpoint = format!("{}/api/v1/license/check", api_url);

    let response = client
        .get(endpoint)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Erro na requisição de licença: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro da API Go (Licença): Status {}", response.status()));
    }

    let details: LicenseDetails = response.json().await.map_err(|e| {
        format!("Erro ao processar dados da licença: {}", e)
    })?;

    Ok(details)
}