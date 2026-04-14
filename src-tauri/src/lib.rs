pub mod config;
pub mod fs_service;
pub mod pty_manager;
pub mod search;

use pty_manager::PtyManager;
use std::io::Read;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(AppState {
            pty_manager: PtyManager::new(),
            fs_watcher: Mutex::new(None),
        }))
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
