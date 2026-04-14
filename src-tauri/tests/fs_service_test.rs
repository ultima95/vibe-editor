use tempfile::TempDir;
use std::fs;

#[test]
fn test_read_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("test.txt");
    fs::write(&path, "hello world").unwrap();
    let content = vibe_editor_lib::fs_service::read_file(path.to_str().unwrap()).unwrap();
    assert_eq!(content, "hello world");
}

#[test]
fn test_write_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("test.txt");
    vibe_editor_lib::fs_service::write_file(path.to_str().unwrap(), "new content").unwrap();
    let content = fs::read_to_string(&path).unwrap();
    assert_eq!(content, "new content");
}

#[test]
fn test_list_directory() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), "").unwrap();
    fs::write(dir.path().join("b.txt"), "").unwrap();
    fs::create_dir(dir.path().join("subdir")).unwrap();
    let entries = vibe_editor_lib::fs_service::list_directory(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(entries.len(), 3);
    assert!(entries.iter().any(|e| e.name == "a.txt" && !e.is_dir));
    assert!(entries.iter().any(|e| e.name == "subdir" && e.is_dir));
}

#[test]
fn test_rename_file() {
    let dir = TempDir::new().unwrap();
    let old = dir.path().join("old.txt");
    let new_path = dir.path().join("new.txt");
    fs::write(&old, "content").unwrap();
    vibe_editor_lib::fs_service::rename_path(old.to_str().unwrap(), new_path.to_str().unwrap()).unwrap();
    assert!(!old.exists());
    assert!(new_path.exists());
}

#[test]
fn test_delete_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("delete_me.txt");
    fs::write(&path, "bye").unwrap();
    vibe_editor_lib::fs_service::delete_path(path.to_str().unwrap()).unwrap();
    assert!(!path.exists());
}

#[test]
fn test_copy_file() {
    let dir = TempDir::new().unwrap();
    let src = dir.path().join("src.txt");
    let dst = dir.path().join("dst.txt");
    fs::write(&src, "content").unwrap();
    vibe_editor_lib::fs_service::copy_path(src.to_str().unwrap(), dst.to_str().unwrap()).unwrap();
    assert!(src.exists());
    assert!(dst.exists());
    assert_eq!(fs::read_to_string(&dst).unwrap(), "content");
}
