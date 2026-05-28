use base64::{engine::general_purpose, Engine as _};

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

#[tauri::command]
pub async fn get_user_avatar(token: &str, org: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("https://dev.azure.com/{}/_apis/GraphProfile/MemberAvatars/...", org);
    
    let response = client
        .get(&url)
        .basic_auth("", Some(token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let image_bytes = response.bytes().await.map_err(|e| e.to_string())?;
        
        // Converte os bytes recebidos para uma String Base64 Data URL
        let encoded = general_purpose::STANDARD.encode(image_bytes);
        let data_url = format!("data:image/png;base64,{}", encoded);
        
        Ok(data_url)
    } else {
        Err("Falha ao buscar avatar".to_string())
    }
}