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

#[tauri::command]
pub async fn get_subscription_plans() -> Result<serde_json::Value, String> {
    let api_url = std::env::var("GO_API_URL").unwrap_or_else(|_| "https://sua-api.railway.app".to_string());
    let endpoint = format!("{}/api/v1/plans", api_url);

    let client = reqwest::Client::new();
    let response = client
        .get(endpoint)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json = response.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
pub async fn open_checkout(user_id: String) -> Result<(), String> {
    let checkout_id = std::env::var("POLAR_CHECKOUT_ID")
        .map_err(|_| "Variável POLAR_CHECKOUT_ID não definida no ambiente".to_string())?;

    let url = format!(
        "https://buy.polar.sh/{}?metadata[user_id]={}", 
        checkout_id.trim(), 
        user_id
    );
    
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e| e.to_string())?;
        
    Ok(())
}