use serde::Deserialize;
use std::process::Stdio;
use tokio::io::AsyncReadExt;

use crate::ai::client::{complete, AIConfig, AIMessage};
use crate::utils::git_command_async;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIChatRequest {
    pub repo_path: String,
    pub config: AIConfig,
    pub messages: Vec<AIMessage>,
}

async fn git_context(repo_path: &str, args: &[&str], max_bytes: usize) -> String {
    let Ok(mut child) = git_command_async(repo_path)
        .args(args)
        .stdout(Stdio::piped())
        .spawn()
    else {
        return "Não foi possível ler o contexto do Git.".to_string();
    };
    let Some(stdout) = child.stdout.take() else {
        return "Não foi possível ler o contexto do Git.".to_string();
    };
    let mut bytes = Vec::with_capacity(max_bytes.saturating_add(1));
    if stdout
        .take(max_bytes.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .await
        .is_err()
    {
        return "Não foi possível ler o contexto do Git.".to_string();
    }
    if bytes.len() > max_bytes {
        let _ = child.kill().await;
        bytes.truncate(max_bytes);
    }
    let _ = child.wait().await;
    String::from_utf8_lossy(&bytes).to_string()
}

#[tauri::command]
pub async fn ai_chat(request: AIChatRequest) -> Result<String, String> {
    if request.messages.is_empty() {
        return Err("Digite uma mensagem para iniciar a conversa.".to_string());
    }

    let status = git_context(&request.repo_path, &["status", "--short"], 12_000).await;
    let diff = git_context(
        &request.repo_path,
        &[
            "diff",
            "HEAD",
            "--no-ext-diff",
            "--no-color",
            "--unified=2",
            "--",
        ],
        24_000,
    )
    .await;
    let mode_instruction = if request.config.mode == "agent" {
        "O modo Agent está ativo. Estruture a resposta como um plano executável, liste os arquivos e comandos envolvidos e peça confirmação antes de qualquer ação destrutiva."
    } else {
        "O modo Chat está ativo. Responda com explicações objetivas e exemplos quando forem úteis."
    };
    let system = format!(
        "Você é o assistente de desenvolvimento do Dev Brook. Trabalhe com precisão e não invente \
         conteúdo que não esteja no contexto. Você pode analisar o contexto abaixo, mas não tem \
         ferramentas para editar arquivos ou executar comandos nesta conversa; nunca afirme que \
         realizou uma alteração que não realizou. {mode_instruction}\n\n\
         Repositório: {repo_path}\n\
         Status atual do Git:\n{status}",
        mode_instruction = mode_instruction,
        repo_path = request.repo_path,
        status = status
    );
    let system = format!("{system}\n\nAlterações textuais atuais (podem estar truncadas):\n{diff}");

    complete(&request.config, &request.messages, &system).await
}
