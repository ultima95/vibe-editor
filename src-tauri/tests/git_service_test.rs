use std::fs;
use std::process::Command;
use tempfile::TempDir;
use vibe_editor_lib::git_service::*;

fn init_git_repo(dir: &std::path::Path) {
    Command::new("git")
        .args(["init"])
        .current_dir(dir)
        .output()
        .expect("git init failed");
    Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(dir)
        .output()
        .expect("git config email failed");
    Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(dir)
        .output()
        .expect("git config name failed");
}

fn cwd(dir: &std::path::Path) -> &str {
    dir.to_str().unwrap()
}

#[test]
fn test_git_status_clean_repo() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert!(result.is_git_repo);
    let branch = result.branch.unwrap();
    assert!(
        branch == "main" || branch == "master",
        "unexpected branch: {}",
        branch
    );
    assert!(result.files.is_empty());
}

#[test]
fn test_git_status_modified_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    fs::write(dir.path().join("file.txt"), "hello world").unwrap();

    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].worktree_status, FileStatus::Modified);
}

#[test]
fn test_git_status_untracked_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    // Need an initial commit so the repo is valid
    fs::write(dir.path().join("initial.txt"), "init").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    fs::write(dir.path().join("new_file.txt"), "untracked").unwrap();

    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].worktree_status, FileStatus::Untracked);
}

#[test]
fn test_git_status_staged_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    fs::write(dir.path().join("file.txt"), "hello world").unwrap();
    Command::new("git")
        .args(["add", "file.txt"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].index_status, FileStatus::Modified);
}

#[test]
fn test_git_status_deleted_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    fs::remove_file(dir.path().join("file.txt")).unwrap();

    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].worktree_status, FileStatus::Deleted);
}

#[test]
fn test_git_diff_returns_content() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello\n").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    fs::write(dir.path().join("file.txt"), "hello\nworld\n").unwrap();

    let diff = git_diff_impl(cwd(dir.path()), "file.txt", false).unwrap();
    assert!(diff.contains("+world"), "diff should contain '+world': {}", diff);
}

#[test]
fn test_git_stage_and_unstage() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    fs::write(dir.path().join("file.txt"), "hello world").unwrap();

    // Stage
    git_stage_impl(cwd(dir.path()), vec!["file.txt".to_string()]).unwrap();
    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].index_status, FileStatus::Modified);

    // Unstage
    git_unstage_impl(cwd(dir.path()), vec!["file.txt".to_string()]).unwrap();
    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].index_status, FileStatus::Unmodified);
    assert_eq!(result.files[0].worktree_status, FileStatus::Modified);
}

#[test]
fn test_git_commit_flow() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    fs::write(dir.path().join("file.txt"), "hello world").unwrap();
    git_stage_impl(cwd(dir.path()), vec!["file.txt".to_string()]).unwrap();
    git_commit_impl(cwd(dir.path()), "update file").unwrap();

    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert!(result.files.is_empty());
}

#[test]
fn test_git_log() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());

    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "initial commit"])
        .current_dir(dir.path())
        .output()
        .unwrap();

    let entries = git_log_impl(cwd(dir.path()), 0, 10).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].message, "initial commit");
    assert_eq!(entries[0].author, "Test");
}

#[test]
fn test_git_status_not_a_repo() {
    let dir = TempDir::new().unwrap();
    // Do NOT init git repo
    let result = git_status_impl(cwd(dir.path())).unwrap();
    assert!(!result.is_git_repo);
    assert!(result.branch.is_none());
    assert!(result.files.is_empty());
}
