pub mod pty_manager;

use pty_manager::PtyManager;
use std::io::Read;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

struct AppState {
    pty_manager: PtyManager,
}

#[tauri::command]
fn spawn_pty(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<String, String> {
    let id = state.pty_manager.spawn_pty(cols, rows, cwd, None)?;

    let reader = state.pty_manager.take_reader(&id)?;
    let pty_id = id.clone();
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

    Ok(id)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(AppState {
            pty_manager: PtyManager::new(),
        }))
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
