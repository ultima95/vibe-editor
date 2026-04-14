use std::time::Duration;
use std::thread;

#[test]
fn test_spawn_pty_returns_id() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty("test-spawn-1".to_string(), 80, 24, None, None).unwrap();
    assert_eq!(id, "test-spawn-1");
    manager.kill_pty(&id).unwrap();
}

#[test]
fn test_kill_pty_cleans_up() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty("test-kill-1".to_string(), 80, 24, None, None).unwrap();
    manager.kill_pty(&id).unwrap();
    assert!(manager.kill_pty(&id).is_err());
}

#[test]
fn test_write_to_pty() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty("test-write-1".to_string(), 80, 24, None, None).unwrap();
    manager.write_to_pty(&id, "echo hello\n").unwrap();
    thread::sleep(Duration::from_millis(100));
    manager.kill_pty(&id).unwrap();
}

#[test]
fn test_resize_pty() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty("test-resize-1".to_string(), 80, 24, None, None).unwrap();
    manager.resize_pty(&id, 120, 40).unwrap();
    manager.kill_pty(&id).unwrap();
}

#[test]
fn test_write_to_nonexistent_pty_errors() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    assert!(manager.write_to_pty("nonexistent", "data").is_err());
}
