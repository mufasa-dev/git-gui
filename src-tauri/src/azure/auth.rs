#[tauri::command]
pub async fn request_azure_device_code(client_id: String) -> Result<String, String> {
    // Criamos um cliente HTTP nativo usando o reqwest (que o Tauri usa por baixo dos panos)
    let client = reqwest::Client::new();
    
    let params = [
        ("client_id", client_id.as_str()),
        ("scope", "499b84ac-1321-427f-aa17-267ca6975798/.default offline_access"),
    ];

    let response = client
        .post("https://login.microsoftonline.com/common/oauth2/v2.0/devicecode")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}