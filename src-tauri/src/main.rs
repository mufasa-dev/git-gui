#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
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
            commands::commit::list_commits,
            commands::commit::get_commit_details,
            commands::commit::git_commit,
            commands::commit::get_commit_file_diff,
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
            commands::git_config::set_git_config
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar o app");
}
