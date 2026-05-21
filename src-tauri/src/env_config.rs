use std::path::Path;

use crate::cursor_sdk_bridge;

/// Loads local `.env` files without overriding variables already set in the process.
///
/// Search order (first match wins per variable):
/// 1. `<repo>/.env` — convenient for `pnpm tauri dev`
/// 2. `<app_data_dir>/.env` — works when the packaged app has no repo checkout
pub fn load_local_env_files(app_data_dir: &Path) {
    if let Ok(repo_root) = cursor_sdk_bridge::repo_root() {
        load_env_file_if_present(&repo_root.join(".env"));
    }

    load_env_file_if_present(&app_data_dir.join(".env"));
}

fn load_env_file_if_present(path: &Path) {
    if !path.is_file() {
        return;
    }

    match dotenvy::from_path(path) {
        Ok(()) => {}
        Err(error) => eprintln!(
            "Warning: failed to load env file {}: {error}",
            path.display()
        ),
    }
}
