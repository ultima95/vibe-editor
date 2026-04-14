use tempfile::TempDir;
use std::fs;

#[test]
fn test_fuzzy_search_finds_files() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("main.rs"), "").unwrap();
    fs::write(dir.path().join("lib.rs"), "").unwrap();
    fs::create_dir(dir.path().join("src")).unwrap();
    fs::write(dir.path().join("src").join("app.tsx"), "").unwrap();

    let results = vibe_editor_lib::search::fuzzy_search("main", dir.path().to_str().unwrap(), 10).unwrap();
    assert!(!results.is_empty());
    assert!(results[0].path.contains("main.rs"));
}

#[test]
fn test_fuzzy_search_empty_query() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), "").unwrap();

    let results = vibe_editor_lib::search::fuzzy_search("", dir.path().to_str().unwrap(), 10).unwrap();
    assert!(!results.is_empty());
}

#[test]
fn test_text_search() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("hello.txt"), "hello world\ngoodbye world").unwrap();
    fs::write(dir.path().join("other.txt"), "no match here").unwrap();

    let results = vibe_editor_lib::search::text_search("hello", dir.path().to_str().unwrap(), 100).unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].path.contains("hello.txt"));
    assert_eq!(results[0].line_number, 1);
}
