use reqwest::header::{HeaderMap, HeaderValue};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIConfig {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    #[allow(dead_code)]
    pub mode: String,
}

#[derive(Clone, Deserialize)]
pub struct AIMessage {
    pub role: String,
    pub content: String,
}

fn validate_config(config: &AIConfig) -> Result<(), String> {
    if config.api_key.trim().is_empty() {
        return Err("Configure uma chave de API antes de usar a IA.".to_string());
    }
    if config.model.trim().is_empty()
        || config.model.contains('?')
        || config.model.contains('#')
        || config.model.contains('/')
    {
        return Err("O modelo informado é inválido.".to_string());
    }
    match config.provider.as_str() {
        "gemini" | "openai" | "anthropic" => Ok(()),
        _ => Err("Provedor de IA não suportado.".to_string()),
    }
}

fn safe_api_error(
    provider: &str,
    status: reqwest::StatusCode,
    body: &str,
    api_key: &str,
) -> String {
    let message = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(|message| message.as_str())
                .or_else(|| value.get("message").and_then(|message| message.as_str()))
                .map(str::to_string)
        })
        .unwrap_or_else(|| format!("A API retornou HTTP {}.", status.as_u16()));

    format!(
        "Erro na API {}: {}",
        provider,
        message.replace(api_key, "[chave omitida]")
    )
}

fn openai_messages(messages: &[AIMessage], system: &str) -> Vec<serde_json::Value> {
    let mut result = vec![serde_json::json!({
        "role": "system",
        "content": system
    })];
    result.extend(messages.iter().map(|message| {
        serde_json::json!({
            "role": message.role,
            "content": message.content
        })
    }));
    result
}

pub async fn complete(
    config: &AIConfig,
    messages: &[AIMessage],
    system: &str,
) -> Result<String, String> {
    validate_config(config)?;
    let api_key = config.api_key.trim();
    let client = reqwest::Client::new();

    match config.provider.as_str() {
        "openai" => {
            let response = client
                .post("https://api.openai.com/v1/chat/completions")
                .bearer_auth(api_key)
                .json(&serde_json::json!({
                    "model": config.model.trim(),
                    "messages": openai_messages(messages, system)
                }))
                .send()
                .await
                .map_err(|_| "Não foi possível conectar à API da OpenAI.".to_string())?;
            let status = response.status();
            let body = response
                .text()
                .await
                .map_err(|_| "A OpenAI retornou uma resposta inválida.".to_string())?;
            if !status.is_success() {
                return Err(safe_api_error("OpenAI", status, &body, api_key));
            }
            serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|value| {
                    value
                        .pointer("/choices/0/message/content")
                        .and_then(|content| content.as_str())
                        .map(str::to_string)
                })
                .ok_or_else(|| "A resposta da OpenAI não contém texto.".to_string())
        }
        "anthropic" => {
            let mut headers = HeaderMap::new();
            headers.insert(
                "x-api-key",
                HeaderValue::from_str(api_key)
                    .map_err(|_| "A chave da Anthropic contém caracteres inválidos.".to_string())?,
            );
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            let response = client
                .post("https://api.anthropic.com/v1/messages")
                .headers(headers)
                .json(&serde_json::json!({
                    "model": config.model.trim(),
                    "max_tokens": 4096,
                    "system": system,
                    "messages": messages.iter().map(|message| serde_json::json!({
                        "role": if message.role == "assistant" { "assistant" } else { "user" },
                        "content": message.content
                    })).collect::<Vec<_>>()
                }))
                .send()
                .await
                .map_err(|_| "Não foi possível conectar à API da Anthropic.".to_string())?;
            let status = response.status();
            let body = response
                .text()
                .await
                .map_err(|_| "A Anthropic retornou uma resposta inválida.".to_string())?;
            if !status.is_success() {
                return Err(safe_api_error("Anthropic", status, &body, api_key));
            }
            serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|value| {
                    value
                        .pointer("/content/0/text")
                        .and_then(|content| content.as_str())
                        .map(str::to_string)
                })
                .ok_or_else(|| "A resposta da Anthropic não contém texto.".to_string())
        }
        "gemini" => {
            let mut url = reqwest::Url::parse(&format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
                config.model.trim()
            ))
            .map_err(|_| "O modelo do Gemini é inválido.".to_string())?;
            url.query_pairs_mut().append_pair("key", api_key);

            let contents = messages
                .iter()
                .map(|message| {
                    serde_json::json!({
                        "role": if message.role == "assistant" { "model" } else { "user" },
                        "parts": [{ "text": message.content }]
                    })
                })
                .collect::<Vec<_>>();
            let response = client
                .post(url)
                .json(&serde_json::json!({
                    "systemInstruction": { "parts": [{ "text": system }] },
                    "contents": contents
                }))
                .send()
                .await
                .map_err(|_| "Não foi possível conectar à API do Gemini.".to_string())?;
            let status = response.status();
            let body = response
                .text()
                .await
                .map_err(|_| "O Gemini retornou uma resposta inválida.".to_string())?;
            if !status.is_success() {
                return Err(safe_api_error("Gemini", status, &body, api_key));
            }
            serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|value| {
                    value
                        .pointer("/candidates/0/content/parts/0/text")
                        .and_then(|content| content.as_str())
                        .map(str::to_string)
                })
                .ok_or_else(|| "A resposta do Gemini não contém texto.".to_string())
        }
        _ => Err("Provedor de IA não suportado.".to_string()),
    }
}
