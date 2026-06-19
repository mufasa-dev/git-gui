#[tauri::command]
pub async fn fetch_azure_queues(owner: String, project: String, token: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("https://dev.azure.com/{}/{}/_apis/build/queues?api-version=7.0", owner, project);
    
    let clean_token = token.trim();

    let response = client.get(&url)
        .basic_auth("", Some(clean_token)) 
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let body = response.text().await.map_err(|e| e.to_string())?;
        Ok(body)
    } else {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        Err(format!("Erro na API do Azure (Status {}): {}", status, error_body))
    }
}