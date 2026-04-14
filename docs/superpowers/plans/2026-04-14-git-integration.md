# Git Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-featured git integration to Vibe Editor — backend service, sidebar panel, file tree indicators, and inline diff viewer.

**Architecture:** A new Rust module (`git_service.rs`) shells out to the system `git` CLI with machine-parseable flags. The frontend uses a Zustand store (`git-store.ts`) as the single source of truth for git state, consumed by both the Git sidebar panel and the file tree. Diffs render inline in CodeMirror editor tabs.

**Tech Stack:** Rust (`std::process::Command`), TypeScript/React, Zustand, CodeMirror 6, Tauri IPC

**Spec:** `docs/superpowers/specs/2026-04-14-git-integration-design.md`

---

## File Structure

### New Files (Backend)
- `src-tauri/src/git_service.rs` — All git CLI wrappers, output parsing, types (`GitFileStatus`, `FileStatus`, `StashEntry`, `LogEntry`, `BranchInfo`). One file because all functions follow the same pattern: build `Command`, run, parse output.
- `src-tauri/tests/git_service_test.rs` — Unit + integration tests for output parsing and live git repo operations.

### New Files (Frontend)
- `src/store/git-store.ts` — Zustand store: all git state + action methods that call Tauri commands.
- `src/components/GitPanel.tsx` — Source control sidebar panel: branch selector, commit area, file change lists.
- `src/components/BranchPicker.tsx` — Branch selector dropdown, reused by branch selector and merge/rebase.
- `src/components/GitLogTab.tsx` — Scrollable commit log tab with infinite scroll pagination.
- `src/components/DiffTab.tsx` — Read-only CodeMirror diff viewer with line decorations.
- `src/hooks/useGitDiff.ts` — Hook that fetches diff content via `git_diff` Tauri command.

### Modified Files
- `src-tauri/src/lib.rs` — Add `pub mod git_service;`, register all new Tauri commands in `generate_handler![]`.
- `src/types.ts` — Extend `Tab.type` to `"terminal" | "editor" | "diff" | "git-log"`. Add `diffCached?: boolean` to Tab.
- `src/store/sidebar-store.ts` — Extend `activePanel` type to `"files" | "search" | "git"`.
- `src/components/Sidebar.tsx` — Add "Git" tab button, render `<GitPanel />` when active.
- `src/components/FileTreeNode.tsx` — Read git store, render colored filenames + status letters + directory propagation.
- `src/components/TabGroup.tsx` — Handle `"diff"` and `"git-log"` tab types, render `<DiffTab />` and `<GitLogTab />`.
- `src/components/AppShell.tsx` — Call `git_store.refreshStatus()` on workspace open, listen for `fs-change` events to debounce status refresh.
- `src/App.tsx` — Add `Cmd+Shift+G` keyboard shortcut.
- `src/styles/globals.css` — Add git status color CSS variables.

---

### Task 1: Git CSS Variables

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add git status color variables to `:root`**

In `src/styles/globals.css`, add after the existing `--error` variable (line 13):

```css
  --git-added: #a6e3a1;
  --git-modified: #f9e2af;
  --git-deleted: #f38ba8;
  --git-untracked: #94e2d5;
  --git-conflicted: #f38ba8;
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd src-tauri && cargo build 2>&1 | tail -5`
Expected: compiles successfully (CSS is frontend only, but confirm nothing is broken)

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(git): add git status color CSS variables"
```

---

### Task 2: Backend — Git Service Core (Types + Status + Diff)

**Files:**
- Create: `src-tauri/src/git_service.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `git_service.rs` with types and helper**

Create `src-tauri/src/git_service.rs` with:

```rust
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FileStatus {
    Unmodified,
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Ignored,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub index_status: FileStatus,
    pub worktree_status: FileStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub branch: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusResult {
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatus>,
}

/// Run a git command in the given working directory.
/// Returns Ok(stdout) or Err(stderr / error message).
fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git not found. Install git to use source control.".to_string()
            } else {
                format!("Failed to run git: {}", e)
            }
        })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(stderr.trim().to_string())
    }
}
```

- [ ] **Step 2: Add `parse_status` and `git_status` command**

Append to `git_service.rs`:

```rust
fn parse_porcelain_v2_status(raw: &str) -> Vec<GitFileStatus> {
    let mut files = Vec::new();
    // Split by NUL for -z output; fall back to newlines if no NUL present
    let entries: Vec<&str> = if raw.contains('\0') {
        raw.split('\0').collect()
    } else {
        raw.lines().collect()
    };

    let mut i = 0;
    while i < entries.len() {
        let line = entries[i];
        if line.is_empty() {
            i += 1;
            continue;
        }

        if line.starts_with("1 ") || line.starts_with("2 ") {
            // Changed entry: "1 XY ..." or "2 XY ..." (rename)
            let chars: Vec<char> = line.chars().collect();
            if chars.len() >= 4 {
                let index_char = chars[2];
                let worktree_char = chars[3];
                // For "2" (rename/copy), the path is after a NUL separator
                // In the entries array, the path part follows
                let path = if line.starts_with("2 ") {
                    // Format: "2 XY sub mH mI mW hH hI path"
                    // With -z, next entry is the original path
                    let parts: Vec<&str> = line.splitn(10, ' ').collect();
                    let p = parts.last().unwrap_or(&"").to_string();
                    i += 1; // skip the original path entry
                    p
                } else {
                    // Format: "1 XY sub mH mI mW hH hI path"
                    let parts: Vec<&str> = line.splitn(9, ' ').collect();
                    parts.last().unwrap_or(&"").to_string()
                };

                files.push(GitFileStatus {
                    path,
                    index_status: char_to_status(index_char),
                    worktree_status: char_to_status(worktree_char),
                });
            }
        } else if line.starts_with("u ") {
            // Unmerged (conflicted) entry: "u XY sub m1 m2 m3 mW h1 h2 h3 path"
            let parts: Vec<&str> = line.splitn(11, ' ').collect();
            let path = parts.last().unwrap_or(&"").to_string();
            files.push(GitFileStatus {
                path,
                index_status: FileStatus::Conflicted,
                worktree_status: FileStatus::Conflicted,
            });
        } else if line.starts_with("? ") {
            // Untracked: "? path"
            let path = line[2..].to_string();
            files.push(GitFileStatus {
                path,
                index_status: FileStatus::Untracked,
                worktree_status: FileStatus::Untracked,
            });
        } else if line.starts_with("! ") {
            // Ignored: "! path"
            let path = line[2..].to_string();
            files.push(GitFileStatus {
                path,
                index_status: FileStatus::Ignored,
                worktree_status: FileStatus::Ignored,
            });
        }
        // Skip header lines ("# branch.oid ...", "# branch.head ...", etc.)

        i += 1;
    }

    files
}

fn char_to_status(c: char) -> FileStatus {
    match c {
        '.' => FileStatus::Unmodified,
        'M' => FileStatus::Modified,
        'T' => FileStatus::Modified, // type change treated as modified
        'A' => FileStatus::Added,
        'D' => FileStatus::Deleted,
        'R' => FileStatus::Renamed,
        'C' => FileStatus::Copied,
        'U' => FileStatus::Conflicted,
        _ => FileStatus::Unmodified,
    }
}

fn parse_branch_from_status(raw: &str) -> Option<String> {
    for line in raw.lines() {
        // Also handle NUL-separated
        let line = line.split('\0').next().unwrap_or(line);
        if line.starts_with("# branch.head ") {
            let branch = line.trim_start_matches("# branch.head ").to_string();
            if branch == "(detached)" {
                return Some("HEAD (detached)".to_string());
            }
            return Some(branch);
        }
    }
    None
}

pub fn git_status_impl(cwd: &str) -> Result<GitStatusResult, String> {
    let raw = run_git(cwd, &["status", "--porcelain=v2", "--branch", "-z"])?;
    let branch = parse_branch_from_status(&raw);
    let files = parse_porcelain_v2_status(&raw);

    // Get ahead/behind
    let (ahead, behind) = match run_git(cwd, &["rev-list", "--left-right", "--count", "HEAD...@{u}"]) {
        Ok(output) => {
            let parts: Vec<&str> = output.trim().split('\t').collect();
            let a = parts.first().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
            let b = parts.get(1).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
            (a, b)
        }
        Err(_) => (0, 0), // No upstream configured
    };

    Ok(GitStatusResult {
        is_git_repo: true,
        branch,
        ahead,
        behind,
        files,
    })
}

pub fn git_diff_impl(cwd: &str, path: &str, cached: bool) -> Result<String, String> {
    let mut args = vec!["diff"];
    if cached {
        args.push("--cached");
    }
    args.push("--");
    args.push(path);
    run_git(cwd, &args)
}
```

- [ ] **Step 3: Add stage, unstage, discard, commit commands**

Append to `git_service.rs`:

```rust
pub fn git_stage_impl(cwd: &str, paths: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["add", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(path_refs);
    run_git(cwd, &args)?;
    Ok(())
}

pub fn git_unstage_impl(cwd: &str, paths: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(path_refs);
    run_git(cwd, &args)?;
    Ok(())
}

pub fn git_discard_impl(cwd: &str, path: &str) -> Result<(), String> {
    run_git(cwd, &["restore", "--", path])?;
    Ok(())
}

pub fn git_commit_impl(cwd: &str, message: &str) -> Result<(), String> {
    run_git(cwd, &["commit", "-m", message])?;
    Ok(())
}

pub fn git_init_impl(cwd: &str) -> Result<(), String> {
    run_git(cwd, &["init"])?;
    Ok(())
}
```

- [ ] **Step 4: Add branch, log, stash, merge, rebase, push/pull commands**

Append to `git_service.rs`:

```rust
pub fn git_log_impl(cwd: &str, skip: u32, limit: u32) -> Result<Vec<LogEntry>, String> {
    let skip_str = skip.to_string();
    let limit_str = limit.to_string();
    let format = "--format=%H%x00%s%x00%an%x00%aI";
    let raw = run_git(cwd, &["log", format, "--skip", &skip_str, "-n", &limit_str])?;

    let entries = raw
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '\0').collect();
            if parts.len() >= 4 {
                Some(LogEntry {
                    hash: parts[0][..7.min(parts[0].len())].to_string(),
                    message: parts[1].to_string(),
                    author: parts[2].to_string(),
                    timestamp: parts[3].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(entries)
}

pub fn git_branches_impl(cwd: &str) -> Result<Vec<BranchInfo>, String> {
    let format = "%(if)%(HEAD)%(then)*%(else) %(end)%(refname:short)%(if)%(upstream)%(then) [%(upstream:short)]%(end)";
    let raw = run_git(cwd, &["branch", "-a", "--format=%(HEAD) %(refname:short) %(upstream:short)"])?;

    let branches = raw
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let is_current = line.starts_with('*');
            let name = line[2..].split_whitespace().next().unwrap_or("").to_string();
            let is_remote = name.starts_with("remotes/") || name.contains('/');
            BranchInfo {
                name: name.trim_start_matches("remotes/").to_string(),
                is_current,
                is_remote,
            }
        })
        .collect();

    Ok(branches)
}

pub fn git_checkout_branch_impl(cwd: &str, branch: &str) -> Result<(), String> {
    run_git(cwd, &["switch", branch])?;
    Ok(())
}

pub fn git_create_branch_impl(cwd: &str, branch: &str) -> Result<(), String> {
    run_git(cwd, &["switch", "-c", branch])?;
    Ok(())
}

pub fn git_delete_branch_impl(cwd: &str, branch: &str) -> Result<(), String> {
    run_git(cwd, &["branch", "-d", branch])?;
    Ok(())
}

pub fn git_merge_impl(cwd: &str, branch: &str) -> Result<String, String> {
    run_git(cwd, &["merge", branch])
}

pub fn git_merge_abort_impl(cwd: &str) -> Result<(), String> {
    run_git(cwd, &["merge", "--abort"])?;
    Ok(())
}

pub fn git_rebase_impl(cwd: &str, branch: &str) -> Result<String, String> {
    run_git(cwd, &["rebase", branch])
}

pub fn git_rebase_abort_impl(cwd: &str) -> Result<(), String> {
    run_git(cwd, &["rebase", "--abort"])?;
    Ok(())
}

pub fn git_rebase_continue_impl(cwd: &str) -> Result<(), String> {
    run_git(cwd, &["rebase", "--continue"])?;
    Ok(())
}

pub fn git_stash_push_impl(cwd: &str) -> Result<(), String> {
    run_git(cwd, &["stash", "push"])?;
    Ok(())
}

pub fn git_stash_pop_impl(cwd: &str, index: Option<u32>) -> Result<(), String> {
    match index {
        Some(i) => run_git(cwd, &["stash", "pop", &format!("stash@{{{}}}", i)])?,
        None => run_git(cwd, &["stash", "pop"])?,
    };
    Ok(())
}

pub fn git_stash_drop_impl(cwd: &str, index: u32) -> Result<(), String> {
    run_git(cwd, &["stash", "drop", &format!("stash@{{{}}}", index)])?;
    Ok(())
}

pub fn git_stash_list_impl(cwd: &str) -> Result<Vec<StashEntry>, String> {
    let raw = run_git(cwd, &[
        "stash", "list",
        "--format=%gd%x00%s%x00%aI",
    ])?;

    let entries = raw
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(3, '\0').collect();
            if parts.len() >= 3 {
                // Parse "stash@{0}" to extract index
                let idx_str = parts[0]
                    .trim_start_matches("stash@{")
                    .trim_end_matches('}');
                let index = idx_str.parse::<u32>().unwrap_or(0);
                Some(StashEntry {
                    index,
                    message: parts[1].to_string(),
                    branch: String::new(), // Not easily available from this format
                    timestamp: parts[2].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(entries)
}

pub fn git_push_impl(cwd: &str) -> Result<String, String> {
    run_git(cwd, &["push"])
}

pub fn git_pull_impl(cwd: &str) -> Result<String, String> {
    run_git(cwd, &["pull"])
}
```

- [ ] **Step 5: Register module and Tauri commands in `lib.rs`**

In `src-tauri/src/lib.rs`:

1. Add `pub mod git_service;` to the module declarations at line 1.
2. Add all the `#[tauri::command]` wrapper functions after the existing commands.
3. Register them in `generate_handler![]`.

Add these Tauri command wrappers (after the existing commands, before `pub fn run()`):

```rust
#[tauri::command]
fn git_status(workspace_root: String) -> Result<git_service::GitStatusResult, String> {
    git_service::git_status_impl(&workspace_root)
}

#[tauri::command]
fn git_diff(workspace_root: String, path: String, cached: bool) -> Result<String, String> {
    git_service::git_diff_impl(&workspace_root, &path, cached)
}

#[tauri::command]
fn git_stage(workspace_root: String, paths: Vec<String>) -> Result<(), String> {
    git_service::git_stage_impl(&workspace_root, paths)
}

#[tauri::command]
fn git_unstage(workspace_root: String, paths: Vec<String>) -> Result<(), String> {
    git_service::git_unstage_impl(&workspace_root, paths)
}

#[tauri::command]
fn git_discard(workspace_root: String, path: String) -> Result<(), String> {
    git_service::git_discard_impl(&workspace_root, &path)
}

#[tauri::command]
fn git_commit(workspace_root: String, message: String) -> Result<(), String> {
    git_service::git_commit_impl(&workspace_root, &message)
}

#[tauri::command]
fn git_init(workspace_root: String) -> Result<(), String> {
    git_service::git_init_impl(&workspace_root)
}

#[tauri::command]
fn git_log(workspace_root: String, skip: u32, limit: u32) -> Result<Vec<git_service::LogEntry>, String> {
    git_service::git_log_impl(&workspace_root, skip, limit)
}

#[tauri::command]
fn git_branches(workspace_root: String) -> Result<Vec<git_service::BranchInfo>, String> {
    git_service::git_branches_impl(&workspace_root)
}

#[tauri::command]
fn git_checkout_branch(workspace_root: String, branch: String) -> Result<(), String> {
    git_service::git_checkout_branch_impl(&workspace_root, &branch)
}

#[tauri::command]
fn git_create_branch(workspace_root: String, branch: String) -> Result<(), String> {
    git_service::git_create_branch_impl(&workspace_root, &branch)
}

#[tauri::command]
fn git_delete_branch(workspace_root: String, branch: String) -> Result<(), String> {
    git_service::git_delete_branch_impl(&workspace_root, &branch)
}

#[tauri::command]
fn git_merge(workspace_root: String, branch: String) -> Result<String, String> {
    git_service::git_merge_impl(&workspace_root, &branch)
}

#[tauri::command]
fn git_merge_abort(workspace_root: String) -> Result<(), String> {
    git_service::git_merge_abort_impl(&workspace_root)
}

#[tauri::command]
fn git_rebase(workspace_root: String, branch: String) -> Result<String, String> {
    git_service::git_rebase_impl(&workspace_root, &branch)
}

#[tauri::command]
fn git_rebase_abort(workspace_root: String) -> Result<(), String> {
    git_service::git_rebase_abort_impl(&workspace_root)
}

#[tauri::command]
fn git_rebase_continue(workspace_root: String) -> Result<(), String> {
    git_service::git_rebase_continue_impl(&workspace_root)
}

#[tauri::command]
fn git_stash_push(workspace_root: String) -> Result<(), String> {
    git_service::git_stash_push_impl(&workspace_root)
}

#[tauri::command]
fn git_stash_pop(workspace_root: String, index: Option<u32>) -> Result<(), String> {
    git_service::git_stash_pop_impl(&workspace_root, index)
}

#[tauri::command]
fn git_stash_drop(workspace_root: String, index: u32) -> Result<(), String> {
    git_service::git_stash_drop_impl(&workspace_root, index)
}

#[tauri::command]
fn git_stash_list(workspace_root: String) -> Result<Vec<git_service::StashEntry>, String> {
    git_service::git_stash_list_impl(&workspace_root)
}

#[tauri::command]
fn git_push(workspace_root: String) -> Result<String, String> {
    git_service::git_push_impl(&workspace_root)
}

#[tauri::command]
fn git_pull(workspace_root: String) -> Result<String, String> {
    git_service::git_pull_impl(&workspace_root)
}
```

Add all to the `generate_handler![]` macro at the end of `run()`:

```rust
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
git_pull,
```

- [ ] **Step 6: Verify it compiles**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: compiles successfully with no errors

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/git_service.rs src-tauri/src/lib.rs
git commit -m "feat(git): add git service backend with all Tauri commands"
```

---

### Task 3: Backend Tests — Status Parsing

**Files:**
- Create: `src-tauri/tests/git_service_test.rs`

- [ ] **Step 1: Write integration tests with real git repos**

Create `src-tauri/tests/git_service_test.rs`:

```rust
use std::process::Command;
use tempfile::TempDir;
use std::fs;

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

#[test]
fn test_git_status_clean_repo() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    let result = vibe_editor_lib::git_service::git_status_impl(dir.path().to_str().unwrap()).unwrap();
    assert!(result.is_git_repo);
    assert!(matches!(result.branch.as_deref(), Some("main") | Some("master")));
    assert!(result.files.is_empty());
}

#[test]
fn test_git_status_modified_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    // Modify the file
    fs::write(dir.path().join("file.txt"), "changed").unwrap();

    let result = vibe_editor_lib::git_service::git_status_impl(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].path, "file.txt");
    assert_eq!(result.files[0].worktree_status, vibe_editor_lib::git_service::FileStatus::Modified);
}

#[test]
fn test_git_status_untracked_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    // Add untracked file
    fs::write(dir.path().join("new.txt"), "new").unwrap();

    let result = vibe_editor_lib::git_service::git_status_impl(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].worktree_status, vibe_editor_lib::git_service::FileStatus::Untracked);
}

#[test]
fn test_git_status_staged_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    // Modify and stage
    fs::write(dir.path().join("file.txt"), "changed").unwrap();
    Command::new("git").args(["add", "file.txt"]).current_dir(dir.path()).output().unwrap();

    let result = vibe_editor_lib::git_service::git_status_impl(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].index_status, vibe_editor_lib::git_service::FileStatus::Modified);
}

#[test]
fn test_git_status_deleted_file() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    // Delete the file
    fs::remove_file(dir.path().join("file.txt")).unwrap();

    let result = vibe_editor_lib::git_service::git_status_impl(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].worktree_status, vibe_editor_lib::git_service::FileStatus::Deleted);
}

#[test]
fn test_git_diff_returns_content() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello\n").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    fs::write(dir.path().join("file.txt"), "hello\nworld\n").unwrap();

    let diff = vibe_editor_lib::git_service::git_diff_impl(dir.path().to_str().unwrap(), "file.txt", false).unwrap();
    assert!(diff.contains("+world"));
}

#[test]
fn test_git_stage_and_unstage() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    fs::write(dir.path().join("file.txt"), "changed").unwrap();
    let cwd = dir.path().to_str().unwrap();

    // Stage
    vibe_editor_lib::git_service::git_stage_impl(cwd, vec!["file.txt".to_string()]).unwrap();
    let status = vibe_editor_lib::git_service::git_status_impl(cwd).unwrap();
    assert_eq!(status.files[0].index_status, vibe_editor_lib::git_service::FileStatus::Modified);

    // Unstage
    vibe_editor_lib::git_service::git_unstage_impl(cwd, vec!["file.txt".to_string()]).unwrap();
    let status = vibe_editor_lib::git_service::git_status_impl(cwd).unwrap();
    assert_eq!(status.files[0].index_status, vibe_editor_lib::git_service::FileStatus::Unmodified);
}

#[test]
fn test_git_commit_flow() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();

    fs::write(dir.path().join("file.txt"), "changed").unwrap();
    let cwd = dir.path().to_str().unwrap();

    vibe_editor_lib::git_service::git_stage_impl(cwd, vec!["file.txt".to_string()]).unwrap();
    vibe_editor_lib::git_service::git_commit_impl(cwd, "test commit").unwrap();

    let status = vibe_editor_lib::git_service::git_status_impl(cwd).unwrap();
    assert!(status.files.is_empty());
}

#[test]
fn test_git_log() {
    let dir = TempDir::new().unwrap();
    init_git_repo(dir.path());
    fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
    Command::new("git").args(["commit", "-m", "first commit"]).current_dir(dir.path()).output().unwrap();

    let cwd = dir.path().to_str().unwrap();
    let log = vibe_editor_lib::git_service::git_log_impl(cwd, 0, 10).unwrap();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].message, "first commit");
}

#[test]
fn test_git_status_not_a_repo() {
    let dir = TempDir::new().unwrap();
    let result = vibe_editor_lib::git_service::git_status_impl(dir.path().to_str().unwrap());
    assert!(result.is_err());
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --test git_service_test 2>&1 | tail -20`
Expected: all tests pass. Fix any failures before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/git_service_test.rs
git commit -m "test(git): add integration tests for git service"
```

---

### Task 4: Frontend Types + Git Store

**Files:**
- Modify: `src/types.ts`
- Create: `src/store/git-store.ts`

- [ ] **Step 1: Extend Tab types in `types.ts`**

In `src/types.ts`, replace the `Tab` interface:

```typescript
export interface Tab {
  id: string;
  type: "terminal" | "editor" | "diff" | "git-log";
  title: string;
  ptyId?: string;
  filePath?: string;
  isDirty?: boolean;
  diffCached?: boolean;
}
```

- [ ] **Step 2: Create `git-store.ts`**

Create `src/store/git-store.ts`:

```typescript
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "./app-store";
import { useToastStore } from "./toast-store";

export interface GitFileStatus {
  path: string;
  index_status: string;
  worktree_status: string;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  timestamp: string;
}

export interface LogEntry {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

interface GitStatusResult {
  is_git_repo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

interface GitStore {
  isGitRepo: boolean;
  gitAvailable: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  stagedFiles: GitFileStatus[];
  changedFiles: GitFileStatus[];
  untrackedFiles: GitFileStatus[];
  conflictedFiles: GitFileStatus[];
  mergeInProgress: boolean;
  rebaseInProgress: boolean;
  stashEntries: StashEntry[];
  isLoading: boolean;
  operationInProgress: string | null;

  refreshStatus: () => Promise<void>;
  stageFiles: (paths: string[]) => Promise<void>;
  unstageFiles: (paths: string[]) => Promise<void>;
  discardFile: (path: string) => Promise<void>;
  commit: (message: string) => Promise<void>;
  initRepo: () => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  stashPush: () => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashDrop: (index: number) => Promise<void>;
  refreshStashList: () => Promise<void>;
  merge: (branch: string) => Promise<void>;
  mergeAbort: () => Promise<void>;
  rebase: (branch: string) => Promise<void>;
  rebaseAbort: () => Promise<void>;
  rebaseContinue: () => Promise<void>;
  checkoutBranch: (branch: string) => Promise<void>;
  createBranch: (branch: string) => Promise<void>;
  deleteBranch: (branch: string) => Promise<void>;
}

function getWorkspaceRoot(): string {
  return useAppStore.getState().workspaceRoot ?? "";
}

function toast(message: string, type: "info" | "success" | "error") {
  useToastStore.getState().addToast(message, type);
}

export const useGitStore = create<GitStore>((set, get) => ({
  isGitRepo: false,
  gitAvailable: true,
  branch: null,
  ahead: 0,
  behind: 0,
  stagedFiles: [],
  changedFiles: [],
  untrackedFiles: [],
  conflictedFiles: [],
  mergeInProgress: false,
  rebaseInProgress: false,
  stashEntries: [],
  isLoading: false,
  operationInProgress: null,

  refreshStatus: async () => {
    const root = getWorkspaceRoot();
    if (!root) return;
    set({ isLoading: true });
    try {
      const result = await invoke<GitStatusResult>("git_status", { workspaceRoot: root });
      const staged: GitFileStatus[] = [];
      const changed: GitFileStatus[] = [];
      const untracked: GitFileStatus[] = [];
      const conflicted: GitFileStatus[] = [];

      for (const f of result.files) {
        if (f.index_status === "Conflicted" || f.worktree_status === "Conflicted") {
          conflicted.push(f);
        } else if (f.index_status === "Untracked") {
          untracked.push(f);
        } else {
          if (f.index_status !== "Unmodified") staged.push(f);
          if (f.worktree_status !== "Unmodified") changed.push(f);
        }
      }

      // Detect merge/rebase in progress by checking for .git/MERGE_HEAD or .git/rebase-merge
      // We infer from conflict state — a more robust check would require a backend command
      // For now, maintain existing state (set by merge/rebase actions)
      set({
        isGitRepo: result.is_git_repo,
        gitAvailable: true,
        branch: result.branch,
        ahead: result.ahead,
        behind: result.behind,
        stagedFiles: staged,
        changedFiles: changed,
        untrackedFiles: untracked,
        conflictedFiles: conflicted,
        isLoading: false,
      });
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("not found")) {
        set({ gitAvailable: false, isLoading: false });
      } else if (errStr.includes("not a git repository")) {
        set({ isGitRepo: false, isLoading: false, gitAvailable: true });
      } else {
        set({ isLoading: false });
      }
    }
  },

  stageFiles: async (paths) => {
    set({ operationInProgress: "staging" });
    try {
      await invoke("git_stage", { workspaceRoot: getWorkspaceRoot(), paths });
      await get().refreshStatus();
    } catch (err) {
      toast(`Stage failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  unstageFiles: async (paths) => {
    set({ operationInProgress: "unstaging" });
    try {
      await invoke("git_unstage", { workspaceRoot: getWorkspaceRoot(), paths });
      await get().refreshStatus();
    } catch (err) {
      toast(`Unstage failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  discardFile: async (path) => {
    set({ operationInProgress: "discarding" });
    try {
      await invoke("git_discard", { workspaceRoot: getWorkspaceRoot(), path });
      await get().refreshStatus();
    } catch (err) {
      toast(`Discard failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  commit: async (message) => {
    set({ operationInProgress: "committing" });
    try {
      await invoke("git_commit", { workspaceRoot: getWorkspaceRoot(), message });
      toast("Changes committed", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Commit failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  initRepo: async () => {
    try {
      await invoke("git_init", { workspaceRoot: getWorkspaceRoot() });
      toast("Initialized git repository", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Init failed: ${err}`, "error");
    }
  },

  push: async () => {
    set({ operationInProgress: "pushing" });
    try {
      await invoke<string>("git_push", { workspaceRoot: getWorkspaceRoot() });
      toast("Pushed to remote", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Push failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  pull: async () => {
    set({ operationInProgress: "pulling" });
    try {
      await invoke<string>("git_pull", { workspaceRoot: getWorkspaceRoot() });
      toast("Pulled from remote", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Pull failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  stashPush: async () => {
    set({ operationInProgress: "stashing" });
    try {
      await invoke("git_stash_push", { workspaceRoot: getWorkspaceRoot() });
      toast("Changes stashed", "success");
      await get().refreshStatus();
      await get().refreshStashList();
    } catch (err) {
      toast(`Stash failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  stashPop: async (index) => {
    set({ operationInProgress: "popping stash" });
    try {
      await invoke("git_stash_pop", { workspaceRoot: getWorkspaceRoot(), index: index ?? null });
      toast("Stash applied", "success");
      await get().refreshStatus();
      await get().refreshStashList();
    } catch (err) {
      toast(`Stash pop failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  stashDrop: async (index) => {
    try {
      await invoke("git_stash_drop", { workspaceRoot: getWorkspaceRoot(), index });
      await get().refreshStashList();
    } catch (err) {
      toast(`Stash drop failed: ${err}`, "error");
    }
  },

  refreshStashList: async () => {
    try {
      const entries = await invoke<StashEntry[]>("git_stash_list", { workspaceRoot: getWorkspaceRoot() });
      set({ stashEntries: entries });
    } catch {
      set({ stashEntries: [] });
    }
  },

  merge: async (branch) => {
    set({ operationInProgress: "merging" });
    try {
      await invoke<string>("git_merge", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Merged ${branch}`, "success");
      set({ mergeInProgress: false });
      await get().refreshStatus();
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("CONFLICT") || errStr.includes("conflict")) {
        set({ mergeInProgress: true });
        toast("Merge conflict — resolve conflicts and commit, or abort", "error");
      } else {
        toast(`Merge failed: ${err}`, "error");
      }
      await get().refreshStatus();
    }
    set({ operationInProgress: null });
  },

  mergeAbort: async () => {
    try {
      await invoke("git_merge_abort", { workspaceRoot: getWorkspaceRoot() });
      set({ mergeInProgress: false });
      toast("Merge aborted", "info");
      await get().refreshStatus();
    } catch (err) {
      toast(`Abort failed: ${err}`, "error");
    }
  },

  rebase: async (branch) => {
    set({ operationInProgress: "rebasing" });
    try {
      await invoke<string>("git_rebase", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Rebased onto ${branch}`, "success");
      set({ rebaseInProgress: false });
      await get().refreshStatus();
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("CONFLICT") || errStr.includes("conflict")) {
        set({ rebaseInProgress: true });
        toast("Rebase conflict — resolve conflicts, stage, and continue", "error");
      } else {
        toast(`Rebase failed: ${err}`, "error");
      }
      await get().refreshStatus();
    }
    set({ operationInProgress: null });
  },

  rebaseAbort: async () => {
    try {
      await invoke("git_rebase_abort", { workspaceRoot: getWorkspaceRoot() });
      set({ rebaseInProgress: false });
      toast("Rebase aborted", "info");
      await get().refreshStatus();
    } catch (err) {
      toast(`Abort failed: ${err}`, "error");
    }
  },

  rebaseContinue: async () => {
    set({ operationInProgress: "continuing rebase" });
    try {
      await invoke("git_rebase_continue", { workspaceRoot: getWorkspaceRoot() });
      set({ rebaseInProgress: false });
      toast("Rebase continued", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Continue failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  checkoutBranch: async (branch) => {
    set({ operationInProgress: "switching branch" });
    try {
      await invoke("git_checkout_branch", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Switched to ${branch}`, "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Switch failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  createBranch: async (branch) => {
    set({ operationInProgress: "creating branch" });
    try {
      await invoke("git_create_branch", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Created branch ${branch}`, "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Create branch failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  deleteBranch: async (branch) => {
    try {
      await invoke("git_delete_branch", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Deleted branch ${branch}`, "success");
    } catch (err) {
      toast(`Delete branch failed: ${err}`, "error");
    }
  },
}));
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no new errors from these files. (Existing errors from unused imports are acceptable if they pre-exist.)

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/store/git-store.ts
git commit -m "feat(git): add frontend types and Zustand git store"
```

---

### Task 5: Sidebar Integration — Add Git Tab

**Files:**
- Modify: `src/store/sidebar-store.ts`
- Modify: `src/components/Sidebar.tsx`
- Create: `src/components/GitPanel.tsx` (placeholder)

- [ ] **Step 1: Extend sidebar store**

In `src/store/sidebar-store.ts`, change the `activePanel` type from `"files" | "search"` to `"files" | "search" | "git"` in both the interface and the create call. There are two places:

Line 7: `activePanel: "files" | "search" | "git";`
Line 12: `setActivePanel: (panel: "files" | "search" | "git") => void;`

- [ ] **Step 2: Create placeholder `GitPanel.tsx`**

Create `src/components/GitPanel.tsx`:

```tsx
import { useGitStore } from "../store/git-store";

export function GitPanel() {
  const { isGitRepo, gitAvailable, isLoading, initRepo } = useGitStore();

  if (!gitAvailable) {
    return (
      <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13, textAlign: "center" }}>
        git not found. Install git to use source control.
      </div>
    );
  }

  if (!isGitRepo) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
          Not a git repository
        </p>
        <button
          onClick={initRepo}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            padding: "6px 16px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Initialize Repository
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: 8, color: "var(--text-secondary)", fontSize: 12 }}>
      Git panel — full UI coming in next task
    </div>
  );
}
```

- [ ] **Step 3: Add Git tab to Sidebar.tsx**

In `src/components/Sidebar.tsx`:

1. Add import at line 3: `import { GitPanel } from "./GitPanel";`
2. Change the panels array on line 76 from `["files", "search"]` to `["files", "search", "git"]`
3. Update the label on line 88: add `panel === "git" ? "Git" :` before the existing ternary:
   ```tsx
   {panel === "files" ? "Files" : panel === "search" ? "Search" : "Git"}
   ```
4. Update the panel rendering on line 97:
   ```tsx
   {activePanel === "files" ? <FileTree /> : activePanel === "search" ? <SearchPanel /> : <GitPanel />}
   ```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/store/sidebar-store.ts src/components/Sidebar.tsx src/components/GitPanel.tsx
git commit -m "feat(git): add Git tab to sidebar with placeholder panel"
```

---

### Task 6: Auto-Refresh — Wire Status to Workspace Open + FS Events

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add git status refresh on workspace open in `AppShell.tsx`**

In `src/components/AppShell.tsx`:

1. Add import: `import { useGitStore } from "../store/git-store";`
2. Add import: `import { listen } from "@tauri-apps/api/event";`
3. Inside the existing `useEffect` that watches `workspaceRoot` (lines 23-28), after `openProject(workspaceRoot)`, add:
   ```typescript
   useGitStore.getState().refreshStatus();
   ```
4. Add a new `useEffect` for fs-change debounced refresh:
   ```typescript
   useEffect(() => {
     let debounceTimer: ReturnType<typeof setTimeout>;
     const unlisten = listen("fs-change", () => {
       clearTimeout(debounceTimer);
       debounceTimer = setTimeout(() => {
         useGitStore.getState().refreshStatus();
       }, 300);
     });

     return () => {
       clearTimeout(debounceTimer);
       unlisten.then((fn) => fn());
     };
   }, []);
   ```

- [ ] **Step 2: Add Cmd+Shift+G shortcut in `App.tsx`**

In `src/App.tsx`, inside the `handleKeyDown` function, add after the Cmd+B handler (around line 61):

```typescript
// Cmd+Shift+G: focus git panel
if (e.metaKey && e.shiftKey && e.key === "g") {
  e.preventDefault();
  const sidebar = useSidebarStore.getState();
  if (!sidebar.visible) sidebar.toggle();
  sidebar.setActivePanel("git");
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/AppShell.tsx src/App.tsx
git commit -m "feat(git): auto-refresh status on workspace open and fs changes, add Cmd+Shift+G"
```

---

### Task 7: Git Panel — Full UI (Branch Selector, Commit Area, File Lists)

**Files:**
- Modify: `src/components/GitPanel.tsx` (replace placeholder with full implementation)
- Create: `src/components/BranchPicker.tsx`

- [ ] **Step 1: Create `BranchPicker.tsx`**

Create `src/components/BranchPicker.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { BranchInfo } from "../store/git-store";

interface BranchPickerProps {
  onSelect: (branch: string) => void;
  onClose: () => void;
  excludeCurrent?: boolean;
}

export function BranchPicker({ onSelect, onClose, excludeCurrent }: BranchPickerProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  useEffect(() => {
    if (workspaceRoot) {
      invoke<BranchInfo[]>("git_branches", { workspaceRoot }).then(setBranches).catch(console.error);
    }
    inputRef.current?.focus();
  }, [workspaceRoot]);

  const filtered = branches
    .filter((b) => !excludeCurrent || !b.is_current)
    .filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        background: "var(--bg-primary)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        zIndex: 100,
        maxHeight: 240,
        overflow: "auto",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && filtered.length > 0) {
            onSelect(filtered[0].name);
            onClose();
          }
        }}
        placeholder="Filter branches..."
        style={{
          width: "100%",
          padding: "6px 8px",
          background: "var(--bg-secondary)",
          border: "none",
          borderBottom: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontSize: 12,
          outline: "none",
        }}
      />
      {filtered.map((b) => (
        <div
          key={b.name}
          onClick={() => {
            onSelect(b.name);
            onClose();
          }}
          style={{
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 12,
            color: b.is_current ? "var(--accent)" : b.is_remote ? "var(--text-secondary)" : "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {b.is_current && <span>✓</span>}
          {b.is_remote && <span style={{ fontSize: 10, opacity: 0.6 }}>⌘</span>}
          <span>{b.name}</span>
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ padding: 8, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
          No branches found
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace GitPanel.tsx with full implementation**

Replace the entire contents of `src/components/GitPanel.tsx` with the full implementation. This is a large component, so here's the structure:

```tsx
import { useState, useRef, useEffect } from "react";
import { useGitStore, GitFileStatus } from "../store/git-store";
import { useTabStore } from "../store/tab-store";
import { BranchPicker } from "./BranchPicker";

function statusColor(status: string): string {
  switch (status) {
    case "Added": case "Renamed": case "Copied": return "var(--git-added)";
    case "Modified": return "var(--git-modified)";
    case "Deleted": return "var(--git-deleted)";
    case "Untracked": return "var(--git-untracked)";
    case "Conflicted": return "var(--git-conflicted)";
    default: return "var(--text-primary)";
  }
}

function statusLetter(status: string): string {
  switch (status) {
    case "Added": return "A";
    case "Modified": return "M";
    case "Deleted": return "D";
    case "Renamed": return "R";
    case "Copied": return "C";
    case "Untracked": return "?";
    case "Conflicted": return "C";
    default: return "";
  }
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirName(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
}

function FileRow({
  file,
  statusField,
  onStage,
  onUnstage,
  onDiscard,
  onOpenDiff,
}: {
  file: GitFileStatus;
  statusField: "index_status" | "worktree_status";
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onOpenDiff: () => void;
}) {
  const status = file[statusField];
  const color = statusColor(status);
  const letter = statusLetter(status);
  const isDeleted = status === "Deleted";

  return (
    <div
      onClick={onOpenDiff}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "3px 4px",
        borderRadius: 3,
        gap: 6,
        cursor: "pointer",
        fontSize: 12,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.1)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color, fontSize: 10, fontWeight: "bold", width: 14, flexShrink: 0, fontFamily: "monospace" }}>
        {letter}
      </span>
      <span
        style={{
          color,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: isDeleted ? "line-through" : "none",
        }}
      >
        {fileName(file.path)}
      </span>
      <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
        {dirName(file.path)}
      </span>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {onDiscard && (
          <button onClick={onDiscard} title="Discard changes" style={actionBtnStyle}>✕</button>
        )}
        {onStage && (
          <button onClick={onStage} title="Stage" style={actionBtnStyle}>+</button>
        )}
        {onUnstage && (
          <button onClick={onUnstage} title="Unstage" style={actionBtnStyle}>−</button>
        )}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: 14,
  padding: "0 3px",
  lineHeight: 1,
};

export function GitPanel() {
  const git = useGitStore();
  const [commitMsg, setCommitMsg] = useState("");
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [mergeBranchPicker, setMergeBranchPicker] = useState<"merge" | "rebase" | null>(null);
  const [showStashList, setShowStashList] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const branchSelectorRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => {
      setShowOverflow(false);
      setShowBranchPicker(false);
      setMergeBranchPicker(null);
      setShowStashList(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!git.gitAvailable) {
    return (
      <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13, textAlign: "center" }}>
        git not found. Install git to use source control.
      </div>
    );
  }

  if (!git.isGitRepo) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
          Not a git repository
        </p>
        <button
          onClick={git.initRepo}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            padding: "6px 16px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Initialize Repository
        </button>
      </div>
    );
  }

  const openDiff = (path: string, cached: boolean) => {
    const { addTab, activeGroupId } = useTabStore.getState();
    const id = `diff-${cached ? "staged" : "unstaged"}-${path}-${Date.now()}`;
    addTab(activeGroupId, {
      id,
      type: "diff",
      title: `Δ ${fileName(path)}`,
      filePath: path,
      diffCached: cached,
    });
  };

  const handleCommit = () => {
    if (!commitMsg.trim()) return;
    git.commit(commitMsg.trim());
    setCommitMsg("");
  };

  const disabled = !!git.operationInProgress;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }}>
      {/* Merge/Rebase in progress banner */}
      {git.mergeInProgress && (
        <div style={{ padding: "6px 12px", background: "rgba(243,139,168,0.15)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--git-deleted)", fontSize: 11, flex: 1 }}>Merge in progress</span>
          <button onClick={git.mergeAbort} style={{ ...actionBtnStyle, color: "var(--git-deleted)" }}>Abort</button>
        </div>
      )}
      {git.rebaseInProgress && (
        <div style={{ padding: "6px 12px", background: "rgba(243,139,168,0.15)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--git-deleted)", fontSize: 11, flex: 1 }}>Rebase in progress</span>
          <button onClick={git.rebaseContinue} disabled={disabled} style={{ ...actionBtnStyle, color: "var(--git-added)" }}>Continue</button>
          <button onClick={git.rebaseAbort} style={{ ...actionBtnStyle, color: "var(--git-deleted)" }}>Abort</button>
        </div>
      )}

      {/* Branch selector */}
      <div
        ref={branchSelectorRef}
        style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6, position: "relative", cursor: "pointer" }}
        onMouseDown={(e) => { e.stopPropagation(); setShowBranchPicker(!showBranchPicker); }}
      >
        <span style={{ color: "var(--accent)" }}>⎇</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {git.branch ?? "HEAD"}
        </span>
        {(git.ahead > 0 || git.behind > 0) && (
          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
            ↑{git.ahead} ↓{git.behind}
          </span>
        )}
        {showBranchPicker && (
          <BranchPicker
            onSelect={(b) => git.checkoutBranch(b)}
            onClose={() => setShowBranchPicker(false)}
          />
        )}
      </div>

      {/* Commit area */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <input
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleCommit(); }}
          placeholder="Commit message..."
          style={{
            width: "100%",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "6px 8px",
            color: "var(--text-primary)",
            fontSize: 11,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            onClick={handleCommit}
            disabled={disabled || !commitMsg.trim() || git.stagedFiles.length === 0}
            style={{
              flex: 1,
              background: disabled || !commitMsg.trim() || git.stagedFiles.length === 0
                ? "var(--border)" : "var(--accent)",
              color: "white",
              border: "none",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {git.operationInProgress === "committing" ? "Committing..." : "Commit"}
          </button>
          <div ref={overflowRef} style={{ position: "relative" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowOverflow(!showOverflow); if (!showOverflow) git.refreshStashList(); }}
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ⋯
            </button>
            {showOverflow && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  zIndex: 100,
                  minWidth: 140,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                {[
                  { label: "Pull", action: () => git.pull(), disabled: disabled },
                  { label: "Push", action: () => git.push(), disabled: disabled },
                  { label: "Stash Changes", action: () => git.stashPush(), disabled: disabled || (git.changedFiles.length === 0 && git.untrackedFiles.length === 0) },
                  { label: "Pop Stash", action: () => git.stashPop(), disabled: disabled || git.stashEntries.length === 0 },
                  { label: "Stash List", action: () => setShowStashList(!showStashList), disabled: git.stashEntries.length === 0 },
                  { label: "Merge...", action: () => setMergeBranchPicker("merge"), disabled: disabled },
                  { label: "Rebase...", action: () => setMergeBranchPicker("rebase"), disabled: disabled },
                  {
                    label: "View Log",
                    action: () => {
                      const { addTab, activeGroupId } = useTabStore.getState();
                      addTab(activeGroupId, { id: `git-log-${Date.now()}`, type: "git-log", title: "Git Log" });
                      setShowOverflow(false);
                    },
                    disabled: false,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    onClick={() => { if (!item.disabled) { item.action(); setShowOverflow(false); } }}
                    style={{
                      padding: "6px 12px",
                      cursor: item.disabled ? "not-allowed" : "pointer",
                      color: item.disabled ? "var(--text-muted)" : "var(--text-primary)",
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "rgba(124,58,237,0.1)"; }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {mergeBranchPicker && (
          <div style={{ position: "relative", marginTop: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
              Select branch to {mergeBranchPicker}:
            </div>
            <BranchPicker
              excludeCurrent
              onSelect={(b) => {
                if (mergeBranchPicker === "merge") git.merge(b);
                else git.rebase(b);
                setMergeBranchPicker(null);
              }}
              onClose={() => setMergeBranchPicker(null)}
            />
          </div>
        )}
        {showStashList && git.stashEntries.length > 0 && (
          <div style={{
            position: "relative",
            marginTop: 6,
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            maxHeight: 180,
            overflow: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}>
            <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Stash List
            </div>
            {git.stashEntries.map((entry) => (
              <div
                key={entry.index}
                style={{ display: "flex", alignItems: "center", padding: "4px 8px", gap: 8, fontSize: 12 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 11, flexShrink: 0 }}>
                  {entry.index}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.message}
                </span>
                <button
                  onClick={() => { git.stashPop(entry.index); setShowStashList(false); }}
                  title="Pop"
                  style={{ ...actionBtnStyle, fontSize: 11 }}
                >
                  Pop
                </button>
                <button
                  onClick={() => git.stashDrop(entry.index)}
                  title="Drop"
                  style={{ ...actionBtnStyle, color: "var(--git-deleted)", fontSize: 11 }}
                >
                  Drop
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File lists */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Conflicted */}
        {git.conflictedFiles.length > 0 && (
          <FileSection
            title="Conflicts"
            count={git.conflictedFiles.length}
            files={git.conflictedFiles}
            statusField="worktree_status"
            onOpenDiff={(f) => openDiff(f.path, false)}
            onStageFile={(f) => git.stageFiles([f.path])}
          />
        )}

        {/* Staged */}
        {git.stagedFiles.length > 0 && (
          <FileSection
            title="Staged Changes"
            count={git.stagedFiles.length}
            files={git.stagedFiles}
            statusField="index_status"
            onOpenDiff={(f) => openDiff(f.path, true)}
            onUnstageFile={(f) => git.unstageFiles([f.path])}
            onUnstageAll={() => git.unstageFiles(git.stagedFiles.map((f) => f.path))}
          />
        )}

        {/* Unstaged */}
        {git.changedFiles.length > 0 && (
          <FileSection
            title="Changes"
            count={git.changedFiles.length}
            files={git.changedFiles}
            statusField="worktree_status"
            onOpenDiff={(f) => openDiff(f.path, false)}
            onStageFile={(f) => git.stageFiles([f.path])}
            onStageAll={() => git.stageFiles(git.changedFiles.map((f) => f.path))}
            onDiscardFile={(f) => git.discardFile(f.path)}
          />
        )}

        {/* Untracked */}
        {git.untrackedFiles.length > 0 && (
          <FileSection
            title="Untracked"
            count={git.untrackedFiles.length}
            files={git.untrackedFiles}
            statusField="worktree_status"
            onOpenDiff={(f) => openDiff(f.path, false)}
            onStageFile={(f) => git.stageFiles([f.path])}
            onStageAll={() => git.stageFiles(git.untrackedFiles.map((f) => f.path))}
          />
        )}

        {git.stagedFiles.length === 0 && git.changedFiles.length === 0 && git.untrackedFiles.length === 0 && git.conflictedFiles.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>
            No changes
          </div>
        )}
      </div>
    </div>
  );
}

function FileSection({
  title,
  count,
  files,
  statusField,
  onOpenDiff,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
}: {
  title: string;
  count: number;
  files: GitFileStatus[];
  statusField: "index_status" | "worktree_status";
  onOpenDiff: (f: GitFileStatus) => void;
  onStageFile?: (f: GitFileStatus) => void;
  onUnstageFile?: (f: GitFileStatus) => void;
  onDiscardFile?: (f: GitFileStatus) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
}) {
  return (
    <>
      <div style={{ padding: "10px 12px 2px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontFamily: "system-ui", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title} <span style={{ color: "var(--text-muted)" }}>({count})</span>
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {onStageAll && (
            <button onClick={onStageAll} title="Stage all" style={actionBtnStyle}>+</button>
          )}
          {onUnstageAll && (
            <button onClick={onUnstageAll} title="Unstage all" style={actionBtnStyle}>−</button>
          )}
        </div>
      </div>
      <div style={{ padding: "2px 12px" }}>
        {files.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            statusField={statusField}
            onOpenDiff={() => onOpenDiff(f)}
            onStage={onStageFile ? () => onStageFile(f) : undefined}
            onUnstage={onUnstageFile ? () => onUnstageFile(f) : undefined}
            onDiscard={onDiscardFile ? () => onDiscardFile(f) : undefined}
          />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/GitPanel.tsx src/components/BranchPicker.tsx
git commit -m "feat(git): implement full Git panel UI with branch selector, commit area, file lists"
```

---

### Task 8: File Tree Git Indicators

**Files:**
- Modify: `src/components/FileTreeNode.tsx`

- [ ] **Step 1: Add git status indicators to FileTreeNode**

In `src/components/FileTreeNode.tsx`:

1. Add import: `import { useGitStore } from "../store/git-store";`
2. Add import: `import { useAppStore } from "../store/app-store";`
3. Inside the `FileTreeNode` component, before the return statement, add:

```typescript
const workspaceRoot = useAppStore((s) => s.workspaceRoot) ?? "";
const allFiles = useGitStore((s) => [
  ...s.stagedFiles, ...s.changedFiles, ...s.untrackedFiles, ...s.conflictedFiles,
]);

// Compute relative path for this entry
const relativePath = entry.path.startsWith(workspaceRoot)
  ? entry.path.slice(workspaceRoot.length + 1)
  : entry.path;

// Find git status for this file
const gitFile = allFiles.find((f) => f.path === relativePath);
const gitStatus = gitFile
  ? (gitFile.worktree_status !== "Unmodified" ? gitFile.worktree_status : gitFile.index_status)
  : null;

// For directories, propagate child status with priority: Conflicted > Added > Modified > Deleted > Untracked
const dirGitStatus = entry.is_dir ? (() => {
  const priority: Record<string, number> = {
    Conflicted: 5, Added: 4, Modified: 3, Deleted: 2, Untracked: 1,
  };
  let best: string | null = null;
  let bestPriority = 0;
  for (const f of allFiles) {
    if (f.path.startsWith(relativePath + "/") || f.path.startsWith(relativePath + "\\")) {
      const s = f.worktree_status !== "Unmodified" ? f.worktree_status : f.index_status;
      const p = priority[s] ?? 0;
      if (p > bestPriority) {
        bestPriority = p;
        best = s;
      }
    }
  }
  return best;
})() : null;

const effectiveStatus = gitStatus ?? dirGitStatus;
const isDir = entry.is_dir;
const statusOpacity = isDir && dirGitStatus && !gitStatus ? 0.7 : 1;

function gitStatusColor(status: string | null): string | undefined {
  switch (status) {
    case "Added": case "Renamed": case "Copied": return "var(--git-added)";
    case "Modified": return "var(--git-modified)";
    case "Deleted": return "var(--git-deleted)";
    case "Untracked": return "var(--git-untracked)";
    case "Conflicted": return "var(--git-conflicted)";
    default: return undefined;
  }
}

function gitStatusLetter(status: string | null): string {
  switch (status) {
    case "Added": return "A";
    case "Modified": return "M";
    case "Deleted": return "D";
    case "Untracked": return "?";
    case "Conflicted": return "C";
    case "Renamed": return "R";
    default: return "";
  }
}

const nameColor = gitStatusColor(effectiveStatus) ?? "var(--text-primary)";
const isDeletedFile = effectiveStatus === "Deleted";
```

4. Update the filename `<span>` (the one currently on line 163 that renders `entry.name`) to use the git color:

```tsx
<span style={{
  overflow: "hidden",
  textOverflow: "ellipsis",
  flex: 1,
  color: nameColor,
  textDecoration: isDeletedFile ? "line-through" : "none",
}}>
  {entry.name}
</span>
```

5. After that span and before the closing `</div>` of the row, add the status letter:

```tsx
{effectiveStatus && (
  <span style={{
    color: gitStatusColor(effectiveStatus),
    fontSize: 9,
    fontWeight: "bold",
    fontFamily: "monospace",
    marginLeft: "auto",
    flexShrink: 0,
    opacity: statusOpacity,
    paddingRight: 4,
  }}>
    {gitStatusLetter(effectiveStatus)}
  </span>
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/FileTreeNode.tsx
git commit -m "feat(git): add git status indicators to file tree"
```

---

### Task 9: Inline Diff Tab

**Files:**
- Create: `src/hooks/useGitDiff.ts`
- Create: `src/components/DiffTab.tsx`
- Modify: `src/components/TabGroup.tsx`

- [ ] **Step 1: Create `useGitDiff.ts` hook**

Create `src/hooks/useGitDiff.ts`:

```typescript
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";

interface DiffLine {
  type: "context" | "added" | "removed" | "hunk";
  content: string;
  lineNumber?: number;
}

export function useGitDiff(filePath: string, cached: boolean) {
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [stats, setStats] = useState({ added: 0, removed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  useEffect(() => {
    if (!workspaceRoot || !filePath) return;
    setLoading(true);
    invoke<string>("git_diff", { workspaceRoot, path: filePath, cached })
      .then((raw) => {
        const parsed: DiffLine[] = [];
        let added = 0;
        let removed = 0;
        let lineNum = 0;

        for (const line of raw.split("\n")) {
          if (line.startsWith("@@")) {
            // Parse hunk header for line numbers
            const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
            if (match) lineNum = parseInt(match[1]) - 1;
            parsed.push({ type: "hunk", content: line });
          } else if (line.startsWith("+")) {
            lineNum++;
            added++;
            parsed.push({ type: "added", content: line.slice(1), lineNumber: lineNum });
          } else if (line.startsWith("-")) {
            removed++;
            parsed.push({ type: "removed", content: line.slice(1) });
          } else if (line.startsWith(" ")) {
            lineNum++;
            parsed.push({ type: "context", content: line.slice(1), lineNumber: lineNum });
          }
          // Skip diff header lines (diff --git, index, ---, +++)
        }

        setLines(parsed);
        setStats({ added, removed });
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [workspaceRoot, filePath, cached]);

  return { lines, stats, loading, error };
}
```

- [ ] **Step 2: Create `DiffTab.tsx`**

Create `src/components/DiffTab.tsx`:

```tsx
import { useGitDiff } from "../hooks/useGitDiff";

interface DiffTabProps {
  filePath: string;
  cached: boolean;
  isActive: boolean;
}

export function DiffTab({ filePath, cached, isActive }: DiffTabProps) {
  const { lines, stats, loading, error } = useGitDiff(filePath, cached);

  if (!isActive) return null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
        No changes
      </div>
    );
  }

  return (
    <div style={{
      width: "100%",
      height: "100%",
      overflow: "auto",
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
      fontSize: 13,
      lineHeight: 1.6,
      background: "var(--bg-primary)",
    }}>
      <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
        {filePath} — <span style={{ color: "var(--git-added)" }}>+{stats.added}</span>{" "}
        <span style={{ color: "var(--git-deleted)" }}>−{stats.removed}</span>
      </div>
      {lines.map((line, i) => {
        if (line.type === "hunk") {
          return (
            <div
              key={i}
              style={{
                display: "flex",
                background: "rgba(137,180,250,0.08)",
                borderTop: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                margin: "4px 0",
              }}
            >
              <span style={{ width: 50, textAlign: "right", paddingRight: 8, color: "var(--accent)", userSelect: "none", flexShrink: 0 }}>⋯</span>
              <span style={{ flex: 1, padding: "0 8px", color: "var(--accent)", fontSize: 11 }}>{line.content}</span>
            </div>
          );
        }

        const bgColor = line.type === "added"
          ? "rgba(166,227,161,0.12)"
          : line.type === "removed"
            ? "rgba(243,139,168,0.12)"
            : "transparent";

        const textColor = line.type === "added"
          ? "var(--git-added)"
          : line.type === "removed"
            ? "var(--git-deleted)"
            : "var(--text-primary)";

        const prefix = line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";

        return (
          <div key={i} style={{ display: "flex", background: bgColor }}>
            <span style={{
              width: 50,
              textAlign: "right",
              paddingRight: 8,
              color: line.type === "context" ? "var(--text-muted)" : textColor,
              userSelect: "none",
              flexShrink: 0,
              fontSize: 12,
            }}>
              {line.lineNumber ?? ""}
            </span>
            <span style={{ flex: 1, padding: "0 8px", color: textColor, whiteSpace: "pre" }}>
              {prefix} {line.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Wire DiffTab and GitLogTab into TabGroup.tsx**

In `src/components/TabGroup.tsx`:

1. Add imports:
   ```typescript
   import { DiffTab } from "./DiffTab";
   ```
2. In the tab rendering map (around line 43), add a case for `"diff"` before the default `EditorTab` return:

```tsx
{group.tabs.map((tab) => {
  const isActive = tab.id === group.activeTabId;
  if (tab.type === "terminal") {
    return <TerminalTab key={tab.id} isActive={isActive} />;
  }
  if (tab.type === "diff") {
    return (
      <DiffTab
        key={tab.id}
        filePath={tab.filePath ?? ""}
        cached={tab.diffCached ?? false}
        isActive={isActive}
      />
    );
  }
  return (
    <EditorTab
      key={tab.id}
      tabId={tab.id}
      groupId={groupId}
      filePath={tab.filePath ?? ""}
      isActive={isActive}
    />
  );
})}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGitDiff.ts src/components/DiffTab.tsx src/components/TabGroup.tsx
git commit -m "feat(git): add inline diff viewer tab"
```

---

### Task 10: Git Log Tab

**Files:**
- Create: `src/components/GitLogTab.tsx`
- Modify: `src/components/TabGroup.tsx`

- [ ] **Step 1: Create `GitLogTab.tsx`**

Create `src/components/GitLogTab.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { LogEntry } from "../store/git-store";

function relativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function GitLogTab({ isActive }: { isActive: boolean }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !workspaceRoot) return;
    setLoading(true);
    try {
      const newEntries = await invoke<LogEntry[]>("git_log", {
        workspaceRoot,
        skip: entries.length,
        limit: 50,
      });
      if (newEntries.length < 50) setHasMore(false);
      setEntries((prev) => [...prev, ...newEntries]);
    } catch (err) {
      console.error("Failed to load git log:", err);
      setHasMore(false);
    }
    setLoading(false);
  }, [loading, hasMore, workspaceRoot, entries.length]);

  useEffect(() => {
    if (isActive && entries.length === 0) loadMore();
  }, [isActive]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      loadMore();
    }
  };

  if (!isActive) return null;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        background: "var(--bg-primary)",
      }}
    >
      {entries.map((entry, i) => (
        <div
          key={`${entry.hash}-${i}`}
          style={{
            display: "flex",
            alignItems: "baseline",
            padding: "6px 16px",
            gap: 12,
            borderBottom: "1px solid var(--border)",
            fontSize: 13,
          }}
        >
          <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>
            {entry.hash}
          </span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
            {entry.message}
          </span>
          <span style={{ color: "var(--text-secondary)", fontSize: 12, flexShrink: 0 }}>
            {entry.author}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0, minWidth: 60, textAlign: "right" }}>
            {relativeTime(entry.timestamp)}
          </span>
        </div>
      ))}
      {loading && (
        <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          Loading...
        </div>
      )}
      {!hasMore && entries.length > 0 && (
        <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          End of log
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add GitLogTab to TabGroup.tsx**

In `src/components/TabGroup.tsx`:

1. Add import: `import { GitLogTab } from "./GitLogTab";`
2. Add a case for `"git-log"` after the `"diff"` case:

```tsx
if (tab.type === "git-log") {
  return <GitLogTab key={tab.id} isActive={isActive} />;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/GitLogTab.tsx src/components/TabGroup.tsx
git commit -m "feat(git): add git log tab with infinite scroll"
```

---

### Task 11: Full Build Verification

- [ ] **Step 1: Run Rust build**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: compiles successfully

- [ ] **Step 2: Run Rust tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -20`
Expected: all tests pass (including new git_service_test)

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: no errors

- [ ] **Step 4: Run frontend build**

Run: `npx vite build 2>&1 | tail -10`
Expected: builds successfully

- [ ] **Step 5: Fix any issues found in steps 1-4**

Address any compilation or test failures before proceeding.

- [ ] **Step 6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(git): address build/test issues"
```
