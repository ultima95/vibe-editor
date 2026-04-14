use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::mpsc;

#[derive(Debug, Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

pub struct FsWatcher {
    _watcher: RecommendedWatcher,
}

pub fn watch_directory(
    path: &str,
    callback: impl Fn(Event) + Send + 'static,
) -> Result<FsWatcher, String> {
    let (tx, rx) = mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(Path::new(path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", path, e))?;

    std::thread::spawn(move || {
        while let Ok(event) = rx.recv() {
            callback(event);
        }
    });

    Ok(FsWatcher { _watcher: watcher })
}

pub fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories for '{}': {}", path, e))?;
    }
    fs::write(path, content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

pub fn list_directory(path: &str) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory '{}': {}", path, e))?;

    let mut result: Vec<DirEntry> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata for '{}': {}", name, e))?;

        result.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    // Sort: directories first, then alphabetical (case-insensitive)
    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

pub fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path)
        .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_path, new_path, e))
}

pub fn delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to delete file '{}': {}", path, e))
    }
}

pub fn copy_path(src: &str, dst: &str) -> Result<(), String> {
    let src_path = Path::new(src);
    if src_path.is_dir() {
        copy_dir_recursive(src_path, Path::new(dst))
    } else {
        fs::copy(src, dst)
            .map(|_| ())
            .map_err(|e| format!("Failed to copy '{}' to '{}': {}", src, dst, e))
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory '{}': {}", dst.display(), e))?;

    let entries = fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory '{}': {}", src.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let src_child = entry.path();
        let dst_child = dst.join(entry.file_name());

        if src_child.is_dir() {
            copy_dir_recursive(&src_child, &dst_child)?;
        } else {
            fs::copy(&src_child, &dst_child).map_err(|e| {
                format!(
                    "Failed to copy '{}' to '{}': {}",
                    src_child.display(),
                    dst_child.display(),
                    e
                )
            })?;
        }
    }

    Ok(())
}
