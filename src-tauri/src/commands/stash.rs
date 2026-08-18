use serde_json::json;
use tauri::command;

use crate::models::stash::StashEntry;
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

fn validate_stash_reference(reference: &str) -> Result<(), String> {
    let valid_index = reference
        .strip_prefix("stash@{")
        .and_then(|value| value.strip_suffix('}'))
        .map(|value| !value.is_empty() && value.chars().all(|character| character.is_ascii_digit()))
        .unwrap_or(false);

    let valid_hash = reference.len() >= 7
        && reference.len() <= 64
        && reference
            .chars()
            .all(|character| character.is_ascii_hexdigit());

    if valid_index || valid_hash {
        Ok(())
    } else {
        Err("Referência de stash inválida".to_string())
    }
}

fn parse_stash_subject(subject: &str) -> (String, String) {
    let prefixes = ["On ", "WIP on ", "index on "];
    for prefix in prefixes {
        if let Some(rest) = subject.strip_prefix(prefix) {
            if let Some((branch, message)) = rest.split_once(": ") {
                return (branch.to_string(), message.to_string());
            }
            return (rest.to_string(), String::new());
        }
    }

    (String::new(), subject.to_string())
}

#[command]
pub fn list_stashes(repo_path: String) -> Result<Vec<StashEntry>, String> {
    let output = git_command(&repo_path)
        .args(["stash", "list", "--format=%gd%x1f%H%x1f%ci%x1f%gs"])
        .output()
        .map_err(|error| format!("Falha ao listar stashes: {}", error))?;

    if !output.status.success() {
        return Err(command_error(&output));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut stashes = Vec::new();

    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        let fields: Vec<&str> = line.split(FIELD_SEPARATOR).collect();
        if fields.len() < 4 {
            continue;
        }

        let (branch, message) = parse_stash_subject(fields[3]);
        stashes.push(StashEntry {
            reference: fields[0].trim().to_string(),
            commit: fields[1].trim().to_string(),
            created_at: fields[2].trim().to_string(),
            branch,
            message,
        });
    }

    Ok(stashes)
}

#[command]
pub fn create_stash(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
    staged_only: bool,
) -> Result<String, String> {
    if keep_index && staged_only {
        return Err(
            "Não é possível combinar manter o índice com apenas arquivos staged".to_string(),
        );
    }

    let mut command = git_command(&repo_path);
    command.arg("stash").arg("push");

    if include_untracked {
        command.arg("--include-untracked");
    }
    if keep_index {
        command.arg("--keep-index");
    }
    if staged_only {
        command.arg("--staged");
    }
    if let Some(message) = message.filter(|value| !value.trim().is_empty()) {
        command.args(["--message", &message]);
    }

    let output = command
        .output()
        .map_err(|error| format!("Falha ao criar stash: {}", error))?;

    if output.status.success() {
        Ok(output_message(&output))
    } else {
        Err(command_error(&output))
    }
}

#[command]
pub fn get_stash_diff(repo_path: String, reference: String) -> Result<serde_json::Value, String> {
    validate_stash_reference(&reference)?;
    let diff = run_git(
        &repo_path,
        &[
            "stash",
            "show",
            "--patch",
            "--binary",
            "--no-ext-diff",
            "--no-color",
            &reference,
        ],
    )?;

    Ok(json!({
        "diff": diff,
        "oldFile": null,
        "newFile": null
    }))
}

#[command]
pub fn apply_stash(
    repo_path: String,
    reference: String,
    restore_index: bool,
) -> Result<String, String> {
    validate_stash_reference(&reference)?;
    let mut args = vec!["stash", "apply"];
    if restore_index {
        args.push("--index");
    }
    args.push(&reference);
    run_git(&repo_path, &args)
}

#[command]
pub fn pop_stash(
    repo_path: String,
    reference: String,
    restore_index: bool,
) -> Result<String, String> {
    validate_stash_reference(&reference)?;
    let mut args = vec!["stash", "pop"];
    if restore_index {
        args.push("--index");
    }
    args.push(&reference);
    run_git(&repo_path, &args)
}

#[command]
pub fn drop_stash(repo_path: String, reference: String) -> Result<String, String> {
    validate_stash_reference(&reference)?;
    run_git(&repo_path, &["stash", "drop", &reference])
}

#[command]
pub fn clear_stashes(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["stash", "clear"])
}

#[command]
pub fn apply_stash_to_branch(
    repo_path: String,
    reference: String,
    target_branch: String,
    restore_index: bool,
) -> Result<String, String> {
    validate_stash_reference(&reference)?;
    if target_branch.trim().is_empty() {
        return Err("A branch de destino é obrigatória".to_string());
    }

    let status = git_command(&repo_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|error| format!("Falha ao verificar alterações locais: {}", error))?;
    if !status.status.success() {
        return Err(command_error(&status));
    }
    if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        return Err(
            "A working tree precisa estar limpa para aplicar um stash em outra branch".to_string(),
        );
    }

    run_git(&repo_path, &["checkout", &target_branch])?;
    apply_stash(repo_path, reference, restore_index)
}

#[cfg(test)]
mod tests {
    use super::{parse_stash_subject, validate_stash_reference};

    #[test]
    fn parses_named_stash_subject() {
        assert_eq!(
            parse_stash_subject("On feature/login: preserve token flow"),
            (
                "feature/login".to_string(),
                "preserve token flow".to_string()
            )
        );
    }

    #[test]
    fn parses_wip_stash_subject_without_losing_colons() {
        assert_eq!(
            parse_stash_subject("WIP on main: fix: handle empty state"),
            ("main".to_string(), "fix: handle empty state".to_string())
        );
    }

    #[test]
    fn validates_index_and_hash_references() {
        assert!(validate_stash_reference("stash@{0}").is_ok());
        assert!(validate_stash_reference("0123456789abcdef").is_ok());
        assert!(validate_stash_reference("stash@{oops}").is_err());
        assert!(validate_stash_reference("--drop-all").is_err());
    }
}
