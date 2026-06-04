use base64::{engine::general_purpose, Engine as _};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};

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

#[tauri::command]
pub async fn fetch_azure_avatar(url: String, pat: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    
    // Cria a credencial Basic :PAT idêntica ao btoa do JS
    let auth_value = format!("Basic :{}", pat.trim());
    let mut header_value = HeaderValue::from_str(&auth_value)
        .map_err(|_| "Erro ao gerar header de autenticação".to_string())?;
    header_value.set_sensitive(true);
    
    headers.insert(AUTHORIZATION, header_value);

    // Faz a requisição direto pelo Rust (Bypass total de CORS!)
    let response = client.get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Falha na requisição: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro HTTP da Azure: {}", response.status()));
    }

    // Captura o Content-Type (ex: image/png)
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    // Lê os bytes brutos da imagem
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    
    // Converte para Base64 estável
    let b64_encoded = general_purpose::STANDARD.encode(bytes);
    
    // Devolve a String pronta para o src da img
    Ok(format!("data:{};base64,{}", content_type, b64_encoded))
}