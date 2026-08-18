use std::env;
use std::process::Stdio;

use tokio::io::AsyncReadExt;

use crate::utils::git_command_async;

const MAX_STAGED_FILES: usize = 100;
const MAX_FILE_SUMMARY_BYTES: usize = 8 * 1024;
const MAX_DIFF_FILES: usize = 20;
const MAX_DIFF_BYTES: usize = 12 * 1024;
const MAX_CHANGED_LINES_PER_FILE: usize = 500;

struct StagedFile {
    status: String,
    path: String,
}

fn parse_staged_files(output: &[u8]) -> Vec<StagedFile> {
    let mut fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut files = Vec::new();

    while let Some(status_bytes) = fields.next() {
        let Some(first_path_bytes) = fields.next() else {
            break;
        };

        let status = String::from_utf8_lossy(status_bytes).into_owned();
        let is_rename_or_copy = matches!(status.as_bytes().first(), Some(b'R' | b'C'));
        let path_bytes = if is_rename_or_copy {
            fields.next().unwrap_or(first_path_bytes)
        } else {
            first_path_bytes
        };

        files.push(StagedFile {
            status,
            path: String::from_utf8_lossy(path_bytes).into_owned(),
        });
    }

    files
}

fn status_label(status: &str) -> &'static str {
    match status.as_bytes().first() {
        Some(b'A') => "added",
        Some(b'M') => "modified",
        Some(b'D') => "deleted",
        Some(b'R') => "renamed",
        Some(b'C') => "copied",
        Some(b'T') => "type changed",
        Some(b'U') => "unmerged",
        _ => "changed",
    }
}

fn build_file_summary(files: &[StagedFile]) -> (String, usize) {
    let mut summary = String::new();
    let mut included_files = 0;

    for file in files.iter().take(MAX_STAGED_FILES) {
        let entry = format!("- {}: {}\n", status_label(&file.status), file.path);
        if summary.len() + entry.len() > MAX_FILE_SUMMARY_BYTES {
            break;
        }

        summary.push_str(&entry);
        included_files += 1;
    }

    (summary, files.len().saturating_sub(included_files))
}

fn is_diff_excluded(path: &str) -> bool {
    let normalized_path = path.replace('\\', "/").to_ascii_lowercase();
    let path_components = normalized_path.split('/');

    if path_components.clone().any(|component| {
        matches!(
            component,
            "node_modules"
                | "target"
                | "dist"
                | "build"
                | "coverage"
                | ".next"
                | "out"
                | "bin"
                | "obj"
        )
    }) {
        return true;
    }

    let extension = normalized_path
        .rsplit_once('.')
        .map(|(_, extension)| extension);

    matches!(
        extension,
        Some(
            "zip"
                | "rar"
                | "7z"
                | "tar"
                | "gz"
                | "exe"
                | "bin"
                | "dll"
                | "so"
                | "dylib"
                | "png"
                | "jpg"
                | "jpeg"
                | "gif"
                | "bmp"
                | "tif"
                | "tiff"
                | "ico"
                | "webp"
                | "svg"
                | "mp4"
                | "mkv"
                | "mov"
                | "mp3"
                | "ogg"
                | "wav"
                | "avi"
                | "webm"
                | "pdf"
                | "doc"
                | "docx"
                | "xls"
                | "xlsx"
                | "ppt"
                | "pptx"
                | "ifc"
                | "bim"
                | "rvt"
                | "rfa"
                | "nwd"
                | "nwc"
                | "blend"
                | "fbx"
                | "obj"
                | "gltf"
                | "glb"
                | "3d"
                | "3dm"
                | "3mf"
                | "x3d"
                | "3ds"
                | "max"
                | "ma"
                | "mb"
                | "step"
                | "stp"
                | "iges"
                | "igs"
                | "dwg"
                | "dxf"
                | "e57"
                | "las"
                | "laz"
                | "psd"
                | "ai"
                | "skp"
                | "dae"
                | "stl"
        )
    )
}

fn parse_numstat(output: &[u8]) -> Option<(usize, usize, bool)> {
    let record = output
        .split(|byte| *byte == 0)
        .find(|record| !record.is_empty())?;
    let mut fields = record.splitn(3, |byte| *byte == b'\t');
    let added = fields.next()?;
    let deleted = fields.next()?;

    if added == b"-" || deleted == b"-" {
        return Some((0, 0, true));
    }

    Some((
        std::str::from_utf8(added).ok()?.parse().ok()?,
        std::str::from_utf8(deleted).ok()?.parse().ok()?,
        false,
    ))
}

async fn get_staged_numstat(
    repo_path: &str,
    path: &str,
) -> Result<Option<(usize, usize, bool)>, String> {
    let output = git_command_async(repo_path)
        .args([
            "diff",
            "--cached",
            "--no-ext-diff",
            "--numstat",
            "-z",
            "--",
            path,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(parse_numstat(&output.stdout))
}

async fn run_git_output_limited(
    repo_path: &str,
    args: &[&str],
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let mut child = git_command_async(repo_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Não foi possível ler a saída do Git".to_string())?;
    let mut bytes = Vec::with_capacity(max_bytes.saturating_add(1));
    stdout
        .take(max_bytes.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .await
        .map_err(|e| e.to_string())?;

    let truncated = bytes.len() > max_bytes;
    if truncated {
        child.kill().await.map_err(|e| e.to_string())?;
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() && !truncated {
        return Err("Falha ao executar Git".to_string());
    }

    Ok(bytes)
}

async fn collect_staged_diff(
    repo_path: &str,
    files: &[StagedFile],
) -> Result<(String, usize), String> {
    let mut diff = String::new();
    let mut diff_files = 0;
    let mut skipped_files = 0;

    for file in files {
        if is_diff_excluded(&file.path) || diff_files >= MAX_DIFF_FILES {
            skipped_files += 1;
            continue;
        }

        let Some((added_lines, deleted_lines, is_binary)) =
            get_staged_numstat(repo_path, &file.path).await?
        else {
            skipped_files += 1;
            continue;
        };

        if is_binary || added_lines.saturating_add(deleted_lines) > MAX_CHANGED_LINES_PER_FILE {
            skipped_files += 1;
            continue;
        }

        let remaining_bytes = MAX_DIFF_BYTES.saturating_sub(diff.len());
        let separator_bytes = usize::from(!diff.is_empty() && !diff.ends_with('\n'));
        let max_diff_bytes = remaining_bytes.saturating_sub(separator_bytes);
        if max_diff_bytes == 0 {
            skipped_files += 1;
            continue;
        }

        let output = run_git_output_limited(
            repo_path,
            &[
                "diff",
                "--cached",
                "--no-ext-diff",
                "--no-color",
                "--unified=3",
                "--",
                file.path.as_str(),
            ],
            max_diff_bytes,
        )
        .await?;

        if output.len() > max_diff_bytes || output.is_empty() {
            if !output.is_empty() {
                skipped_files += 1;
            }
            continue;
        }

        if separator_bytes > 0 {
            diff.push('\n');
        }
        diff.push_str(&String::from_utf8_lossy(&output));
        diff_files += 1;
    }

    Ok((diff, skipped_files))
}

#[tauri::command]
pub async fn generate_commit_suggestion(
    repo_path: String,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    // 1. Validação prévia: Conta quantos arquivos estão no Stage (staged)
    let files_output = git_command_async(&repo_path)
        .args(["diff", "--cached", "--name-status", "-z"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !files_output.status.success() {
        return Err(String::from_utf8_lossy(&files_output.stderr)
            .trim()
            .to_string());
    }

    let staged_files = parse_staged_files(&files_output.stdout);
    let staged_files_count = staged_files.len();

    if staged_files_count == 0 {
        return Err("Nenhuma alteração preparada (staged) encontrada para analisar.".into());
    }

    let (file_summary, omitted_files) = build_file_summary(&staged_files);
    let (staged_diff, skipped_diff_files) = collect_staged_diff(&repo_path, &staged_files).await?;
    let omitted_notice = if omitted_files > 0 {
        format!(
            "\n[{} staged files omitted from the file summary due to size limits]",
            omitted_files
        )
    } else {
        String::new()
    };
    let diff_notice = if skipped_diff_files > 0 {
        format!("\n[Diff omitted for {} files because they are binary, generated, unsupported, or too large]", skipped_diff_files)
    } else {
        String::new()
    };
    let diff_content = if staged_diff.is_empty() {
        "[No eligible textual diff available; use the staged file names and statuses.]".to_string()
    } else {
        staged_diff
    };

    // 2. Envia nomes/status de todos os arquivos e somente diffs textuais pequenos e relevantes.
    // 3. Busca o título dos últimos 5 commits para dar contexto de estilo/idioma à IA
    let log_output = git_command_async(&repo_path)
        .args(["log", "-n", "5", "--format=%s"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let recent_commits = String::from_utf8_lossy(&log_output.stdout);

    let prompt = format!(
        "You are an expert Git assistant tasked with generating a high-level concise commit message and description.\n\n\
        REPOSITORY CONTEXT (Recent commit titles):\n\
        {}\n\n\
        CRITICAL INSTRUCTIONS:\n\
        1. LANGUAGE: Analyze the repository context above. If previous commits are in English, you MUST write both the \"title\" and \"description\" STRICTLY IN ENGLISH.\n\
        2. FORMAT: The \"title\" must strictly follow the Conventional Commits specification.\n\
        3. TITLE STYLE: Keep it concise, imperative, and brief (e.g., 'ui: update profile layout').\n\
        4. DESCRIPTION STYLE: Keep it SHORT and CONCISE. Avoid listing every single file. Use brief bullet points highlighting ONLY the high-level key changes. Do not exceed 3 or 4 short bullets.\n\
        5. Use the selective diff to understand the actual changes when available. For files listed without a diff, do not invent their contents; use only their names and statuses.\n\n\
        OUTPUT FORMAT:\n\
        You must return strictly a JSON object with \"title\" and \"description\" keys. Do not include markdown blocks like ```json or any conversational text.\n\n\
        EXAMPLE OF EXPECTED CONCISE OUTPUT:\n\
        {{\n  \"title\": \"feat: implement local change tracking\",\n  \"description\": \"- Add git integration to monitor project unstaged files\\n- Create a flexible custom folder tree view component\"\n}}\n\n\
        STAGED FILES (path and status only):\n{}{}\n\n\
        SELECTIVE STAGED DIFF:\n{}{}",
        recent_commits,
        file_summary,
        omitted_notice,
        diff_content,
        diff_notice
    );

    let key = match api_key {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => {
            let env_key = env::var("GEMINI_API_KEY")
                .map_err(|_| "Chave de API do Gemini não encontrada. Configure a variável GEMINI_API_KEY no seu .env ou passe via parâmetro.".to_string())?;

            if env_key.trim().is_empty() {
                return Err("A variável GEMINI_API_KEY no seu .env está vazia.".into());
            }
            env_key.trim().to_string()
        }
    };

    let url_string = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        key
    );

    let valid_url = reqwest::Url::parse(&url_string).map_err(|e| {
        format!(
            "Falha ao construir URL válida para a IA: {} (URL gerada: {})",
            e, url_string
        )
    })?;

    let client = reqwest::Client::new();
    let response = client
        .post(valid_url)
        .json(&serde_json::json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": { "responseMimeType": "application/json" }
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let res_body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    if let Some(error) = res_body.get("error") {
        return Err(format!(
            "Erro na API do Gemini (Código {}): {}",
            error["code"],
            error["message"].as_str().unwrap_or("Erro desconhecido")
        ));
    }

    let ai_text = res_body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| format!("Estrutura inesperada na resposta da IA: {}", res_body))?;

    let parsed_json: serde_json::Value = serde_json::from_str(ai_text).map_err(|e| {
        format!(
            "A IA respondeu, mas não conseguimos converter para JSON válido ({}) Texto da IA:\n{}",
            e, ai_text
        )
    })?;

    let title = parsed_json["title"].as_str().unwrap_or("").to_string();
    let description = parsed_json["description"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(vec![title, description])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_added_and_modified_files_without_content() {
        let output = b"A\0src/new.rs\0M\0src/changed.rs\0";
        let files = parse_staged_files(output);

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].status, "A");
        assert_eq!(files[0].path, "src/new.rs");
        assert_eq!(files[1].status, "M");
        assert_eq!(files[1].path, "src/changed.rs");
    }

    #[test]
    fn uses_the_new_path_for_renamed_files() {
        let output = b"R100\0src/old.rs\0src/new.rs\0";
        let files = parse_staged_files(output);

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "R100");
        assert_eq!(files[0].path, "src/new.rs");
    }

    #[test]
    fn identifies_binary_and_text_numstat_records() {
        assert_eq!(parse_numstat(b"12\t4\tsrc/main.rs\0"), Some((12, 4, false)));
        assert_eq!(
            parse_numstat(b"-\t-\tassets/image.png\0"),
            Some((0, 0, true))
        );
    }

    #[test]
    fn excludes_binary_image_and_generated_paths_from_diff() {
        assert!(is_diff_excluded("assets/model.ifc"));
        assert!(is_diff_excluded("images/screenshot.png"));
        assert!(is_diff_excluded("node_modules/package/index.js"));
        assert!(!is_diff_excluded("src/main.rs"));
    }

    #[test]
    fn summarizes_status_and_path_only_with_limits() {
        let files = vec![
            StagedFile {
                status: "A".into(),
                path: "assets/model.ifc".into(),
            },
            StagedFile {
                status: "M".into(),
                path: "src/main.rs".into(),
            },
        ];
        let (summary, omitted) = build_file_summary(&files);

        assert_eq!(
            summary,
            "- added: assets/model.ifc\n- modified: src/main.rs\n"
        );
        assert_eq!(omitted, 0);
        assert!(!summary.contains("fn main"));
    }
}
