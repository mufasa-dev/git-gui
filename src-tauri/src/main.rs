#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use dotenvy::dotenv;
mod ai;
mod authentication;
mod azure;
mod commands;
mod git_hub;
mod models;
mod tests;
mod utils;

use tauri::Emitter;
use tauri_plugin_deep_link::DeepLinkExt;

// Aceita "dev-brook://auth?code=..." e também as variações que o navegador /
// Windows às vezes produzem: "dev-brook://auth/?code=..." (barra extra),
// esquema em maiúsculas e aspas em volta do argumento.
fn is_github_oauth_callback(value: &str) -> bool {
    let lower = value.trim().trim_matches('"').to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix("dev-brook://auth") else {
        return false;
    };
    let rest = rest.strip_prefix('/').unwrap_or(rest);
    rest.is_empty() || rest.starts_with('?') || rest.starts_with('#')
}

#[cfg(test)]
mod oauth_callback_tests {
    use super::is_github_oauth_callback;

    #[test]
    fn accepts_github_oauth_callback_urls() {
        assert!(is_github_oauth_callback("dev-brook://auth?code=test"));
        assert!(is_github_oauth_callback("dev-brook://auth#error"));
        assert!(is_github_oauth_callback("dev-brook://auth/?code=test"));
        assert!(is_github_oauth_callback("DEV-BROOK://auth?code=test"));
        assert!(is_github_oauth_callback("\"dev-brook://auth?code=test\""));
    }

    #[test]
    fn rejects_other_urls_and_similar_prefixes() {
        assert!(!is_github_oauth_callback("https://github.com/login/oauth"));
        assert!(!is_github_oauth_callback(
            "dev-brook://auth-malformed?code=test"
        ));
        assert!(!is_github_oauth_callback("dev-brook://auth/path?code=test"));
    }
}

fn main() {
    dotenv().ok();

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 🔎 Diagnóstico: ajuda a identificar, rodando o app pelo terminal
            // (ex.: `npm run tauri dev`), se o SO está mesmo reabrindo o app
            // com a URL do callback do GitHub quando o navegador tenta usar
            // o protocolo "dev-brook://". Se essa linha nunca aparecer depois
            // de autorizar no GitHub, o problema está fora do app (protocolo
            // não associado no Windows, política do navegador bloqueando
            // abertura de app externo, etc.) e não no código do oauth em si.
            eprintln!("[single-instance] argumentos recebidos: {:?}", args);

            match args.iter().skip(1).find(|arg| is_github_oauth_callback(arg)) {
                Some(url) => {
                    let url = url.trim().trim_matches('"').to_string();
                    eprintln!("[single-instance] callback do GitHub reconhecido, emitindo oauth-callback: {url}");
                    let _ = app.emit("oauth-callback", url);
                }
                None if args.len() > 1 => {
                    eprintln!("[single-instance] nenhum argumento bateu com o callback esperado (dev-brook://auth...)");
                }
                None => {}
            }
        }));
    }

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                // 🔎 Diagnóstico: confirma se o registro do protocolo
                // "dev-brook://" no SO (registro do Windows / xdg no Linux)
                // deu certo nesta execução. Se aparecer um erro aqui, é
                // quase certo que o GitHub nunca vai conseguir reabrir o
                // app — vale rodar o app pelo terminal pra ver essa saída.
                match app.deep_link().register_all() {
                    Ok(()) => eprintln!("[deep-link] protocolo \"dev-brook://\" registrado com sucesso."),
                    Err(e) => eprintln!("[deep-link] falha ao registrar o protocolo \"dev-brook://\": {e}"),
                }
            }

            // Caminho oficial do plugin de deep-link: com o recurso "deep-link"
            // do single-instance ativo, a URL recebida pela segunda instância
            // chega aqui também. Emite o mesmo evento; o frontend ignora
            // duplicatas (flag `handled` em githubService.login).
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let url = url.to_string();
                    eprintln!("[deep-link] URL recebida: {url}");
                    if is_github_oauth_callback(&url) {
                        let _ = handle.emit("oauth-callback", url);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::repo::open_repo,
            commands::repo::get_repository_snapshot,
            commands::branch::list_branches,
            commands::branch::list_remote_branches,
            commands::branch::get_branch_status,
            commands::branch::get_current_branch,
            commands::branch::checkout_branch,
            commands::branch::create_branch,
            commands::branch::checkout_remote_branch,
            commands::branch::delete_branch,
            commands::branch::delete_remote_branch,
            commands::branch::list_branch_files,
            commands::branch::list_branch_files_with_size,
            commands::branch::get_branch_file_content,
            commands::branch::get_branch_file_page,
            commands::branch::get_file_metadata,
            commands::commit::list_commits,
            commands::commit::list_user_commits,
            commands::commit::get_commit_details,
            commands::commit::get_multiple_commits_subjects,
            commands::commit::git_commit,
            commands::commit::get_commit_file_diff,
            commands::commit::get_last_commit_for_path,
            commands::commit::get_path_history,
            commands::commit::list_directory,
            commands::commit::list_directory_with_commits,
            commands::stage::list_local_changes,
            commands::stage::get_repository_status,
            commands::stage::get_repositories_change_counts,
            commands::stage::ignore_file,
            commands::stage::stage_files,
            commands::stage::unstage_files,
            commands::stage::discard_changes,
            commands::stage::get_diff,
            commands::stage::get_amend_info,
            commands::stage::list_amend_changes,
            commands::stage::get_amend_diff,
            commands::stage::remove_from_amend,
            commands::stage::list_line_ending_changes,
            commands::stage::normalize_line_endings,
            commands::stage::create_gitattributes,
            commands::stage::apply_patch_to_index,
            commands::stage::reset_hard,
            commands::stash::list_stashes,
            commands::stash::create_stash,
            commands::stash::get_stash_diff,
            commands::stash::apply_stash,
            commands::stash::pop_stash,
            commands::stash::drop_stash,
            commands::stash::clear_stashes,
            commands::stash::apply_stash_to_branch,
            commands::tag::list_tags,
            commands::tag::create_tag,
            commands::tag::edit_tag_message,
            commands::tag::rename_tag,
            commands::tag::delete_tag,
            commands::tag::checkout_tag,
            commands::tag::get_tag_diff,
            commands::tag::push_tag,
            commands::tag::delete_remote_tag,
            commands::repo::push_repo,
            commands::repo::git_pull,
            commands::repo::pull_branch_without_checkout,
            commands::repo::git_config_pull,
            commands::repo::fetch_repo,
            commands::repo::get_remote_url,
            commands::repo::clone_repo,
            commands::terminal::open_console,
            commands::terminal::open_file_manager,
            commands::terminal::open_browser,
            commands::terminal::open_git_bash,
            commands::terminal::open_repo_in_browser,
            commands::vs_code::open_vscode,
            commands::vs_code::open_vscode_diff,
            commands::vs_code::open_vscode_git_diff,
            commands::image::load_image_base64,
            commands::image::load_git_image_base64,
            commands::merge::merge_branch,
            commands::merge::save_file,
            commands::merge::read_worktree_file,
            commands::merge::save_worktree_file,
            commands::pull_request::open_pull_request,
            commands::pr_conflict::prepare_pr_conflict,
            commands::pr_conflict::get_pr_conflict_status,
            commands::pr_conflict::commit_pr_conflict,
            commands::pr_conflict::cleanup_pr_conflict,
            commands::git_config::get_git_config,
            commands::git_config::set_git_config,
            commands::dashboard::get_code_coverage_ratio,
            commands::dashboard::get_code_churn,
            commands::dashboard::get_most_modified_files,
            commands::dashboard::get_user_most_modified_files,
            git_hub::auth::exchange_code_for_token,
            azure::auth::request_azure_device_code,
            azure::auth::get_user_avatar,
            azure::auth::fetch_azure_avatar,
            azure::queue::fetch_azure_queues,
            tests::jasmine_test::run_angular_tests,
            tests::jasmine_test::get_angular_test_files,
            tests::dotnet_test::run_dotnet_tests,
            tests::dotnet_test::get_dotnet_test_files,
            tests::process::stop_test_execution,
            tests::java_test::run_java_tests,
            tests::java_test::get_java_test_files,
            tests::ruby_test::run_ruby_tests,
            tests::ruby_test::get_ruby_test_files,
            tests::golang_test::run_go_tests,
            tests::golang_test::get_go_test_files,
            tests::rust_test::run_rust_tests,
            tests::rust_test::get_rust_test_files,
            tests::vitest_test::run_vitest_tests,
            tests::vitest_test::get_vitest_test_files,
            tests::project_type::detect_project_type,
            ai::commits::generate_commit_suggestion,
            ai::chat::ai_chat,
            commands::terminal::open_claude_code_terminal,
            authentication::login::login_with_supabase,
            authentication::login::register_with_supabase,
            authentication::login::get_my_profile,
            authentication::license::check_license,
            authentication::license::get_subscription_plans,
            authentication::license::open_checkout
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar o app");
}
