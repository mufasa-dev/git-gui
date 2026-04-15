#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod git_hub;
mod models;
mod utils;
mod tests;

use tauri::{Emitter, Listener};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                
                app.listen("deep-link://fallback", move |event| {
                    let url = event.payload().to_string();
                    println!("URL recebida pelo Deep Link: {}", url); // Verifique seu terminal!
                    handle.emit("oauth-callback", url).unwrap();
                });
            }
            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let url = args[1].clone(); 
            app.emit("oauth-callback", url).unwrap();
        }))
        .invoke_handler(tauri::generate_handler![
            commands::repo::open_repo,
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
            commands::branch::get_file_metadata,
            commands::commit::list_commits,
            commands::commit::list_user_commits,
            commands::commit::get_commit_details,
            commands::commit::git_commit,
            commands::commit::get_commit_file_diff,
            commands::commit::get_last_commit_for_path,
            commands::commit::get_path_history,
            commands::commit::list_directory_with_commits,
            commands::stage::list_local_changes,
            commands::stage::stage_files,
            commands::stage::unstage_files,
            commands::stage::discard_changes,
            commands::stage::get_diff,
            commands::stage::stash_changes,
            commands::stage::stash_pop,
            commands::stage::reset_hard,
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
            commands::git_config::get_git_config,
            commands::git_config::set_git_config,
            commands::dashboard::get_code_coverage_ratio,
            commands::dashboard::get_most_modified_files,
            commands::dashboard::get_user_most_modified_files,
            git_hub::auth::exchange_code_for_token,
            tests::front_test::run_angular_tests,
            tests::project_type::detect_project_type,
            tests::project_type::get_project_test_files
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar o app");
}
