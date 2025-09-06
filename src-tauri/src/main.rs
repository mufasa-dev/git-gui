mod commands;

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
            commands::commit::list_commits,
            commands::commit::get_commit_details,
            commands::commit::git_commit,
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
            commands::repo::fetch_repo,
            commands::terminal::open_console,
            commands::terminal::open_file_manager,
            commands::terminal::open_browser,
            commands::terminal::open_vscode,
            commands::terminal::open_git_bash,
            commands::terminal::open_repo_in_browser
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar o app");
}
