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

fn is_github_oauth_callback(value: &str) -> bool {
    value
        .strip_prefix("dev-brook://auth")
        .is_some_and(|suffix| {
            suffix.is_empty() || suffix.starts_with('?') || suffix.starts_with('#')
        })
}

#[cfg(test)]
mod oauth_callback_tests {
    use super::is_github_oauth_callback;

    #[test]
    fn accepts_github_oauth_callback_urls() {
        assert!(is_github_oauth_callback("dev-brook://auth?code=test"));
        assert!(is_github_oauth_callback("dev-brook://auth#error"));
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
            if let Some(url) = args
                .iter()
                .skip(1)
                .find(|arg| is_github_oauth_callback(arg))
            {
                let _ = app.emit("oauth-callback", url.clone());
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
                app.deep_link().register_all()?;
            }
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
            commands::commit::list_directory_with_commits,
            commands::stage::list_local_changes,
            commands::stage::get_repository_status,
            commands::stage::ignore_file,
            commands::stage::stage_files,
            commands::stage::unstage_files,
            commands::stage::discard_changes,
            commands::stage::get_diff,
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
            commands::merge::merge_branch,
            commands::merge::save_file,
            commands::pull_request::open_pull_request,
            commands::pr_conflict::prepare_pr_conflict,
            commands::pr_conflict::get_pr_conflict_status,
            commands::pr_conflict::commit_pr_conflict,
            commands::pr_conflict::cleanup_pr_conflict,
            commands::git_config::get_git_config,
            commands::git_config::set_git_config,
            commands::dashboard::get_code_coverage_ratio,
            commands::dashboard::get_most_modified_files,
            commands::dashboard::get_user_most_modified_files,
            git_hub::auth::exchange_code_for_token,
            azure::auth::request_azure_device_code,
            azure::auth::get_user_avatar,
            azure::queue::fetch_azure_queues,
            tests::jasmine_test::run_angular_tests,
            tests::jasmine_test::get_angular_test_files,
            tests::dotnet_test::run_dotnet_tests,
            tests::golang_test::run_go_tests,
            tests::golang_test::get_go_test_files,
            tests::project_type::detect_project_type,
            ai::commits::generate_commit_suggestion,
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
