use serde_json::json;
use tauri::command;

use crate::models::tag::TagEntry;
use crate::utils::git_command;

const FIELD_SEPARATOR: char = '\u{1f}';

fn command_error(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        stderr
    }
}

fn output_message(output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{}\n{}", stdout, stderr),
    }
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = git_command(repo_path)
        .args(args)
        .output()
        .map_err(|error| format!("Falha ao executar Git: {}", error))?;

    if output.status.success() {
        Ok(output_message(&output))
    } else {
        Err(command_error(&output))
    }
}

fn validate_tag_name(repo_path: &str, name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.starts_with('-') || name.contains('\n') || name.contains('\r')
    {
        return Err("Nome de tag inválido".to_string());
    }

    let full_ref = format!("refs/tags/{}", name);
    run_git(repo_path, &["check-ref-format", &full_ref]).map(|_| ())
}

fn validate_commit(repo_path: &str, commit: &str) -> Result<(), String> {
    if commit.len() < 7
        || commit.len() > 64
        || !commit
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("O commit selecionado é inválido".to_string());
    }

    run_git(
        repo_path,
        &["rev-parse", "--verify", &format!("{}^{{commit}}", commit)],
    )
    .map(|_| ())
}

fn ensure_tag_does_not_exist(repo_path: &str, name: &str) -> Result<(), String> {
    let full_ref = format!("refs/tags/{}", name);
    let output = git_command(repo_path)
        .args(["show-ref", "--verify", "--quiet", &full_ref])
        .output()
        .map_err(|error| format!("Falha ao verificar tag existente: {}", error))?;

    if output.status.success() {
        Err(format!("A tag '{}' já existe", name))
    } else {
        Ok(())
    }
}

fn resolve_tag_commit(repo_path: &str, name: &str) -> Result<String, String> {
    run_git(repo_path, &["rev-parse", &format!("{}^{{commit}}", name)])
        .map(|value| value.lines().next().unwrap_or_default().trim().to_string())
}

#[command]
pub fn list_tags(repo_path: String) -> Result<Vec<TagEntry>, String> {
    let output = git_command(&repo_path)
        .args([
            "for-each-ref",
            "--format=%(refname:short)%x1f%(objecttype)%x1f%(creatordate:iso-strict)%x1f%(creator)%x1f%(subject)%x1f%(objectname)%x1f%(*objectname)",
            "refs/tags/",
        ])
        .output()
        .map_err(|error| format!("Falha ao listar tags: {}", error))?;

    if !output.status.success() {
        return Err(command_error(&output));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut tags = Vec::new();

    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        let fields: Vec<&str> = line.split(FIELD_SEPARATOR).collect();
        if fields.len() < 7 {
            continue;
        }

        let name = fields[0].trim().to_string();
        let kind = if fields[1].trim() == "tag" {
            "annotated".to_string()
        } else {
            "lightweight".to_string()
        };
        let peeled_commit = fields[6].trim();
        let target_commit = if peeled_commit.is_empty() {
            fields[5].trim()
        } else {
            peeled_commit
        }
        .to_string();
        let short_commit = target_commit.chars().take(short_hash_len()).collect();

        tags.push(TagEntry {
            name,
            target_commit,
            short_commit,
            kind,
            created_at: fields[2].trim().to_string(),
            tagger: fields[3].trim().to_string(),
            message: fields[4].trim().to_string(),
        });
    }

    Ok(tags)
}

fn short_hash_len() -> usize {
    8
}

#[command]
pub fn create_tag(
    repo_path: String,
    name: String,
    target_commit: String,
    kind: String,
    message: Option<String>,
) -> Result<String, String> {
    validate_tag_name(&repo_path, &name)?;
    validate_commit(&repo_path, &target_commit)?;
    ensure_tag_does_not_exist(&repo_path, &name)?;

    let normalized_kind = kind.to_lowercase();
    let mut command = git_command(&repo_path);
    command.arg("tag");

    if normalized_kind == "annotated" {
        let message = message
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "Tags anotadas precisam de uma mensagem".to_string())?;
        command.args([
            "--annotate",
            "--message",
            message.as_str(),
            name.as_str(),
            target_commit.as_str(),
        ]);
    } else if normalized_kind == "lightweight" {
        command.args([name.as_str(), target_commit.as_str()]);
    } else {
        return Err("Tipo de tag inválido".to_string());
    }

    let output = command
        .output()
        .map_err(|error| format!("Falha ao criar tag: {}", error))?;
    if output.status.success() {
        Ok(output_message(&output))
    } else {
        Err(command_error(&output))
    }
}

#[command]
pub fn edit_tag_message(
    repo_path: String,
    name: String,
    message: String,
) -> Result<String, String> {
    validate_tag_name(&repo_path, &name)?;
    if message.trim().is_empty() {
        return Err("A mensagem da tag não pode ficar vazia".to_string());
    }

    let target_commit = resolve_tag_commit(&repo_path, &name)?;
    run_git(
        &repo_path,
        &[
            "tag",
            "--annotate",
            "--force",
            "--message",
            message.as_str(),
            name.as_str(),
            target_commit.as_str(),
        ],
    )
}

#[command]
pub fn rename_tag(repo_path: String, old_name: String, new_name: String) -> Result<String, String> {
    validate_tag_name(&repo_path, &old_name)?;
    validate_tag_name(&repo_path, &new_name)?;
    ensure_tag_does_not_exist(&repo_path, &new_name)?;
    run_git(&repo_path, &["tag", &new_name, &old_name])?;
    run_git(&repo_path, &["tag", "--delete", &old_name])
}

#[command]
pub fn delete_tag(repo_path: String, name: String) -> Result<String, String> {
    validate_tag_name(&repo_path, &name)?;
    run_git(&repo_path, &["tag", "--delete", &name])
}

#[command]
pub fn checkout_tag(repo_path: String, name: String) -> Result<String, String> {
    validate_tag_name(&repo_path, &name)?;
    run_git(&repo_path, &["checkout", &name])
}

#[command]
pub fn get_tag_diff(repo_path: String, name: String) -> Result<serde_json::Value, String> {
    validate_tag_name(&repo_path, &name)?;
    let target_commit = resolve_tag_commit(&repo_path, &name)?;
    let diff = run_git(
        &repo_path,
        &[
            "diff",
            "--no-ext-diff",
            "--no-color",
            &format!("{}^!", target_commit),
        ],
    )?;

    Ok(json!({
        "diff": diff,
        "oldFile": null,
        "newFile": null
    }))
}

#[command]
pub fn push_tag(
    repo_path: String,
    remote: String,
    name: Option<String>,
    all: bool,
    token: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {
    if remote.trim().is_empty() {
        return Err("Remote inválido".to_string());
    }
    if !all {
        let tag_name = name
            .as_deref()
            .ok_or_else(|| "Informe uma tag para fazer push".to_string())?;
        validate_tag_name(&repo_path, tag_name)?;
    }

    let mut command =
        crate::commands::repo::configure_git_auth(git_command(&repo_path), token, provider);
    command.args(["push", &remote]);
    if all {
        command.arg("--tags");
    } else if let Some(tag_name) = name {
        command.arg(tag_name);
    }
    let output = command
        .output()
        .map_err(|error| format!("Falha ao fazer push da tag: {}", error))?;

    if output.status.success() {
        Ok(output_message(&output))
    } else {
        Err(command_error(&output))
    }
}

#[command]
pub fn delete_remote_tag(
    repo_path: String,
    remote: String,
    name: String,
    token: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {
    if remote.trim().is_empty() {
        return Err("Remote inválido".to_string());
    }
    validate_tag_name(&repo_path, &name)?;

    let mut command =
        crate::commands::repo::configure_git_auth(git_command(&repo_path), token, provider);
    command.args(["push", &remote, "--delete", &name]);
    let output = command
        .output()
        .map_err(|error| format!("Falha ao excluir tag remota: {}", error))?;

    if output.status.success() {
        Ok(output_message(&output))
    } else {
        Err(command_error(&output))
    }
}

#[cfg(test)]
mod tests {
    use super::short_hash_len;

    #[test]
    fn uses_a_readable_short_hash_length() {
        assert_eq!(short_hash_len(), 8);
    }
}
