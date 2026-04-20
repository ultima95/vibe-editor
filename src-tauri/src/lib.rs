pub mod config;
pub mod fs_service;
pub mod git_service;
pub mod pty_manager;
pub mod search;

use pty_manager::PtyManager;
use std::io::Read;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};
use tauri::utils::config::WindowEffectsConfig;
use tauri::utils::{WindowEffect, WindowEffectState};

struct AppState {
    pty_manager: PtyManager,
    fs_watcher: Mutex<Option<fs_service::FsWatcher>>,
}

#[tauri::command]
fn spawn_pty(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    state.pty_manager.spawn_pty(id.clone(), cols, rows, cwd, None)?;

    let reader = state.pty_manager.take_reader(&id)?;
    let pty_id = id;
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit(&format!("pty-output-{}", pty_id), &data);
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit(&format!("pty-exit-{}", pty_id), ());
    });

    Ok(())
}

#[tauri::command]
fn write_pty(
    state: State<'_, Arc<AppState>>,
    id: String,
    data: String,
) -> Result<(), String> {
    state.pty_manager.write_to_pty(&id, &data)
}

#[tauri::command]
fn resize_pty(
    state: State<'_, Arc<AppState>>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.pty_manager.resize_pty(&id, cols, rows)
}

#[tauri::command]
fn kill_pty(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    state.pty_manager.kill_pty(&id)
}

#[tauri::command]
fn watch_directory(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    let app_handle = app.clone();
    let watcher = fs_service::watch_directory(&path, move |event| {
        let _ = app_handle.emit(
            "fs-change",
            serde_json::json!({
                "kind": format!("{:?}", event.kind),
                "paths": event.paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
            }),
        );
    })?;
    *state.fs_watcher.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
fn cmd_read_file(path: String) -> Result<String, String> {
    fs_service::read_file(&path)
}

#[tauri::command]
fn cmd_write_file(path: String, content: String) -> Result<(), String> {
    fs_service::write_file(&path, &content)
}

#[tauri::command]
fn cmd_list_directory(path: String) -> Result<Vec<fs_service::DirEntry>, String> {
    fs_service::list_directory(&path)
}

#[tauri::command]
fn cmd_rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs_service::rename_path(&old_path, &new_path)
}

#[tauri::command]
fn cmd_delete_path(path: String) -> Result<(), String> {
    fs_service::delete_path(&path)
}

#[tauri::command]
fn cmd_copy_path(src: String, dst: String) -> Result<(), String> {
    fs_service::copy_path(&src, &dst)
}

#[tauri::command]
fn fuzzy_search(
    query: String,
    workspace_root: String,
    limit: usize,
) -> Result<Vec<search::SearchResult>, String> {
    search::fuzzy_search(&query, &workspace_root, limit)
}

#[tauri::command]
fn text_search(
    query: String,
    workspace_root: String,
    limit: usize,
) -> Result<Vec<search::TextSearchResult>, String> {
    search::text_search(&query, &workspace_root, limit)
}

#[tauri::command]
fn cmd_get_default_workspace() -> Result<String, String> {
    if let Ok(cwd) = std::env::current_dir() {
        // In Tauri dev mode, CWD is src-tauri/; use the project root instead
        if cwd.ends_with("src-tauri") {
            if let Some(parent) = cwd.parent() {
                return Ok(parent.to_string_lossy().to_string());
            }
        }
        // If CWD looks like a project directory, use it
        if cwd.join("package.json").exists() || cwd.join("Cargo.toml").exists() {
            return Ok(cwd.to_string_lossy().to_string());
        }
    }
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine default workspace".to_string())
}

#[tauri::command]
fn load_config() -> config::AppConfig {
    config::load_config()
}

#[tauri::command]
fn save_config(config: config::AppConfig) -> Result<(), String> {
    config::save_config(&config)
}

#[tauri::command]
fn cmd_get_recent_projects() -> Vec<String> {
    config::get_recent_projects()
}

#[tauri::command]
fn cmd_add_recent_project(path: String) -> Result<Vec<String>, String> {
    config::add_recent_project(&path)
}

#[tauri::command]
fn unwatch_directory(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut watcher = state.fs_watcher.lock().unwrap();
    *watcher = None;
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_new_window(app: AppHandle) -> Result<(), String> {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(1);
    let id = COUNTER.fetch_add(1, Ordering::Relaxed);
    let label = format!("main-{}", id);

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Vibe Editor")
        .inner_size(1200.0, 800.0)
        .min_inner_size(600.0, 400.0)
        .decorations(true)
        .transparent(true)
        .hidden_title(true)
        .title_bar_style(TitleBarStyle::Overlay)
        .build()
        .map_err(|e| e.to_string())?;

    window
        .set_title_bar_style(TitleBarStyle::Overlay)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn set_transparency(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("main window not found")?;
    if enabled {
        // Use native macOS NSVisualEffectView for the blur — this is stable across
        // focus/unfocus cycles unlike CSS backdrop-filter which WebKit can drop.
        let effects = WindowEffectsConfig {
            effects: vec![WindowEffect::UnderWindowBackground],
            state: Some(WindowEffectState::Active),
            radius: None,
            color: None,
        };
        window.set_effects(Some(effects)).map_err(|e| e.to_string())
    } else {
        window
            .set_effects(None::<WindowEffectsConfig>)
            .map_err(|e| e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Git commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn git_status(workspace_root: String) -> Result<git_service::GitStatusResult, String> {
    tokio::task::spawn_blocking(move || git_service::git_status_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_diff(workspace_root: String, path: String, cached: bool) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_diff_impl(&workspace_root, &path, cached))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_stage(workspace_root: String, paths: Vec<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_stage_impl(&workspace_root, paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_unstage(workspace_root: String, paths: Vec<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_unstage_impl(&workspace_root, paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_discard(workspace_root: String, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_discard_impl(&workspace_root, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_commit(workspace_root: String, message: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_commit_impl(&workspace_root, &message))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_init(workspace_root: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_init_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_log(workspace_root: String, skip: u32, limit: u32) -> Result<Vec<git_service::LogEntry>, String> {
    tokio::task::spawn_blocking(move || git_service::git_log_impl(&workspace_root, skip, limit))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_branches(workspace_root: String) -> Result<Vec<git_service::BranchInfo>, String> {
    tokio::task::spawn_blocking(move || git_service::git_branches_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_checkout_branch(workspace_root: String, branch: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_checkout_branch_impl(&workspace_root, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_create_branch(workspace_root: String, branch: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_create_branch_impl(&workspace_root, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_delete_branch(workspace_root: String, branch: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_delete_branch_impl(&workspace_root, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_merge(workspace_root: String, branch: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_merge_impl(&workspace_root, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_merge_abort(workspace_root: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_merge_abort_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_rebase(workspace_root: String, branch: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_rebase_impl(&workspace_root, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_rebase_abort(workspace_root: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_rebase_abort_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_rebase_continue(workspace_root: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_rebase_continue_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_stash_push(workspace_root: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_stash_push_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_stash_pop(workspace_root: String, index: Option<u32>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_stash_pop_impl(&workspace_root, index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_stash_drop(workspace_root: String, index: u32) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git_service::git_stash_drop_impl(&workspace_root, index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_stash_list(workspace_root: String) -> Result<Vec<git_service::StashEntry>, String> {
    tokio::task::spawn_blocking(move || git_service::git_stash_list_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_push(workspace_root: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_push_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_publish_branch(workspace_root: String, branch: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_publish_branch_impl(&workspace_root, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_pull(workspace_root: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_pull_impl(&workspace_root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_commit_files(workspace_root: String, hash: String) -> Result<Vec<git_service::CommitFile>, String> {
    tokio::task::spawn_blocking(move || git_service::git_commit_files_impl(&workspace_root, &hash))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_show_file(workspace_root: String, hash: String, path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_show_file_impl(&workspace_root, &hash, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_commit_diff(workspace_root: String, hash: String, path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_service::git_commit_diff_impl(&workspace_root, &hash, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AppState {
            pty_manager: PtyManager::new(),
            fs_watcher: Mutex::new(None),
        }))
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");
            window.set_title_bar_style(TitleBarStyle::Overlay)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            watch_directory,
            cmd_read_file,
            cmd_write_file,
            cmd_list_directory,
            cmd_rename_path,
            cmd_delete_path,
            cmd_copy_path,
            cmd_get_default_workspace,
            fuzzy_search,
            text_search,
            load_config,
            save_config,
            cmd_get_recent_projects,
            cmd_add_recent_project,
            unwatch_directory,
            quit_app,
            set_transparency,
            open_new_window,
            git_status,
            git_diff,
            git_stage,
            git_unstage,
            git_discard,
            git_commit,
            git_init,
            git_log,
            git_branches,
            git_checkout_branch,
            git_create_branch,
            git_delete_branch,
            git_merge,
            git_merge_abort,
            git_rebase,
            git_rebase_abort,
            git_rebase_continue,
            git_stash_push,
            git_stash_pop,
            git_stash_drop,
            git_stash_list,
            git_push,
            git_publish_branch,
            git_pull,
            git_commit_files,
            git_show_file,
            git_commit_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
