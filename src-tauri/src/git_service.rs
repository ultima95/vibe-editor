use serde::{Deserialize, Serialize};
use std::process::Command;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlameLine {
    pub line_number: u32,
    pub hash: String,
    pub author: String,
    pub date: String,
    pub content: String,
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
    pub has_upstream: bool,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatus>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git not found".to_string()
            } else {
                format!("Failed to run git: {}", e)
            }
        })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(stderr)
    }
}

pub fn char_to_status(c: char) -> FileStatus {
    match c {
        '.' => FileStatus::Unmodified,
        'M' | 'T' => FileStatus::Modified,
        'A' => FileStatus::Added,
        'D' => FileStatus::Deleted,
        'R' => FileStatus::Renamed,
        'C' => FileStatus::Copied,
        'U' => FileStatus::Conflicted,
        _ => FileStatus::Unmodified,
    }
}

pub fn parse_branch_from_status(raw: &str) -> Option<String> {
    // With -z, header lines are NUL-terminated instead of LF-terminated
    for line in raw.split(|c| c == '\n' || c == '\0') {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            let branch = rest.trim();
            if branch == "(detached)" {
                return None;
            }
            return Some(branch.to_string());
        }
    }
    None
}

pub fn parse_porcelain_v2_status(raw: &str) -> Vec<GitFileStatus> {
    let mut results = Vec::new();

    // Split on NUL first; if only one segment, fall back to newline splitting
    let entries: Vec<&str> = if raw.contains('\0') {
        raw.split('\0').collect()
    } else {
        raw.lines().collect()
    };

    let mut i = 0;
    while i < entries.len() {
        let entry = entries[i];
        if entry.is_empty() {
            i += 1;
            continue;
        }

        if entry.starts_with("# ") {
            // Header line — skip
            i += 1;
            continue;
        }

        if entry.starts_with("? ") {
            // Untracked
            let path = entry[2..].to_string();
            results.push(GitFileStatus {
                path,
                index_status: FileStatus::Untracked,
                worktree_status: FileStatus::Untracked,
            });
            i += 1;
            continue;
        }

        if entry.starts_with("! ") {
            // Ignored
            let path = entry[2..].to_string();
            results.push(GitFileStatus {
                path,
                index_status: FileStatus::Ignored,
                worktree_status: FileStatus::Ignored,
            });
            i += 1;
            continue;
        }

        if entry.starts_with("u ") {
            // Unmerged / conflicted — format: u XY <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
            let parts: Vec<&str> = entry.splitn(11, ' ').collect();
            if parts.len() >= 11 {
                results.push(GitFileStatus {
                    path: parts[10].to_string(),
                    index_status: FileStatus::Conflicted,
                    worktree_status: FileStatus::Conflicted,
                });
            }
            i += 1;
            continue;
        }

        if entry.starts_with("1 ") {
            // Changed entry — format: 1 XY <sub> <mH> <mI> <mW> <hH> <hI> <path>
            let parts: Vec<&str> = entry.splitn(9, ' ').collect();
            if parts.len() >= 9 {
                let xy = parts[1];
                let mut chars = xy.chars();
                let x = chars.next().unwrap_or('.');
                let y = chars.next().unwrap_or('.');
                results.push(GitFileStatus {
                    path: parts[8].to_string(),
                    index_status: char_to_status(x),
                    worktree_status: char_to_status(y),
                });
            }
            i += 1;
            continue;
        }

        if entry.starts_with("2 ") {
            // Rename/copy entry — format: 2 XY <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>
            // Followed by NUL-separated original path
            let parts: Vec<&str> = entry.splitn(10, ' ').collect();
            if parts.len() >= 10 {
                let xy = parts[1];
                let mut chars = xy.chars();
                let x = chars.next().unwrap_or('.');
                let y = chars.next().unwrap_or('.');
                results.push(GitFileStatus {
                    path: parts[9].to_string(),
                    index_status: char_to_status(x),
                    worktree_status: char_to_status(y),
                });
            }
            // Skip next entry (original path)
            i += 2;
            continue;
        }

        i += 1;
    }

    results
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

pub fn git_status_impl(cwd: &str) -> Result<GitStatusResult, String> {
    // Check if this is a git repo
    let raw = match run_git(cwd, &["status", "--porcelain=v2", "-z", "--branch"]) {
        Ok(output) => output,
        Err(e) => {
            if e.contains("not a git repository") {
                return Ok(GitStatusResult {
                    is_git_repo: false,
                    branch: None,
                    has_upstream: false,
                    ahead: 0,
                    behind: 0,
                    files: vec![],
                });
            }
            return Err(e);
        }
    };

    let branch = parse_branch_from_status(&raw);
    let files = parse_porcelain_v2_status(&raw);

    // Get ahead/behind
    let (ahead, behind, has_upstream) = if branch.is_some() {
        match run_git(cwd, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]) {
            Ok(output) => {
                let parts: Vec<&str> = output.trim().split('\t').collect();
                let a = parts.first().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
                let b = parts.get(1).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
                (a, b, true)
            }
            Err(_) => (0, 0, false),
        }
    } else {
        (0, 0, false)
    };

    Ok(GitStatusResult {
        is_git_repo: true,
        branch,
        has_upstream,
        ahead,
        behind,
        files,
    })
}

pub fn git_diff_impl(cwd: &str, path: &str, cached: bool) -> Result<String, String> {
    if cached {
        run_git(cwd, &["diff", "--cached", "--", path])
    } else {
        run_git(cwd, &["diff", "--", path])
    }
}

pub fn git_stage_impl(cwd: &str, paths: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["add", "--"];
    let refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(refs);
    run_git(cwd, &args)?;
    Ok(())
}

pub fn git_unstage_impl(cwd: &str, paths: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    let refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(refs);
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

pub fn git_log_impl(cwd: &str, skip: u32, limit: u32) -> Result<Vec<LogEntry>, String> {
    let skip_str = format!("--skip={}", skip);
    let limit_str = format!("-{}", limit);
    let raw = run_git(
        cwd,
        &["log", "--format=%H%x00%s%x00%an%x00%aI", &limit_str, &skip_str],
    )?;

    let mut entries = Vec::new();
    for line in raw.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(4, '\0').collect();
        if parts.len() >= 4 {
            entries.push(LogEntry {
                hash: parts[0].to_string(),
                short_hash: parts[0].chars().take(7).collect(),
                message: parts[1].to_string(),
                author: parts[2].to_string(),
                timestamp: parts[3].to_string(),
            });
        }
    }
    Ok(entries)
}

pub fn git_branches_impl(cwd: &str) -> Result<Vec<BranchInfo>, String> {
    let raw = run_git(
        cwd,
        &["branch", "-a", "--format=%(HEAD) %(refname:short) %(upstream:short)"],
    )?;

    let mut branches = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let is_current = line.starts_with('*');
        let rest = if is_current { &line[2..] } else { line };
        let parts: Vec<&str> = rest.splitn(2, ' ').collect();
        let name = parts[0].to_string();
        let is_remote = name.starts_with("remotes/") || name.contains('/');
        branches.push(BranchInfo {
            name,
            is_current,
            is_remote,
        });
    }
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
        Some(i) => {
            let stash_ref = format!("stash@{{{}}}", i);
            run_git(cwd, &["stash", "pop", &stash_ref])?;
        }
        None => {
            run_git(cwd, &["stash", "pop"])?;
        }
    }
    Ok(())
}

pub fn git_stash_drop_impl(cwd: &str, index: u32) -> Result<(), String> {
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(cwd, &["stash", "drop", &stash_ref])?;
    Ok(())
}

pub fn git_stash_list_impl(cwd: &str) -> Result<Vec<StashEntry>, String> {
    let raw = run_git(cwd, &["stash", "list", "--format=%gd%x00%s%x00%aI"])?;

    let mut entries = Vec::new();
    for line in raw.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(3, '\0').collect();
        if parts.len() >= 3 {
            // parts[0] is like "stash@{0}"
            let gd = parts[0];
            let index = gd
                .strip_prefix("stash@{")
                .and_then(|s| s.strip_suffix('}'))
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);

            // Extract branch from message like "WIP on main: ..." or "On main: ..."
            let message = parts[1].to_string();
            let branch = message
                .split_once(" on ")
                .and_then(|(_, rest)| rest.split_once(':'))
                .map(|(b, _)| b.to_string())
                .unwrap_or_default();

            entries.push(StashEntry {
                index,
                message,
                branch,
                timestamp: parts[2].to_string(),
            });
        }
    }
    Ok(entries)
}

pub fn git_push_impl(cwd: &str) -> Result<String, String> {
    run_git(cwd, &["push"])
}

pub fn git_publish_branch_impl(cwd: &str, branch: &str) -> Result<String, String> {
    run_git(cwd, &["push", "--set-upstream", "origin", branch])
}

pub fn git_pull_impl(cwd: &str) -> Result<String, String> {
    run_git(cwd, &["pull"])
}

pub fn git_show_file_impl(cwd: &str, hash: &str, path: &str) -> Result<String, String> {
    let spec = format!("{}:{}", hash, path);
    run_git(cwd, &["show", &spec])
}

pub fn git_commit_diff_impl(cwd: &str, hash: &str, path: &str) -> Result<String, String> {
    run_git(cwd, &["diff", &format!("{}~1", hash), hash, "--", path])
}

pub fn git_commit_files_impl(cwd: &str, hash: &str) -> Result<Vec<CommitFile>, String> {
    let raw = run_git(cwd, &["diff-tree", "--no-commit-id", "-r", "--name-status", hash])?;

    let mut files = Vec::new();
    for line in raw.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() >= 2 {
            let status_code = parts[0];
            let status = if status_code == "A" {
                "Added"
            } else if status_code == "M" {
                "Modified"
            } else if status_code == "D" {
                "Deleted"
            } else if status_code.starts_with('R') {
                "Renamed"
            } else if status_code.starts_with('C') {
                "Copied"
            } else {
                "Modified"
            };
            files.push(CommitFile {
                path: parts[1].to_string(),
                status: status.to_string(),
            });
        }
    }
    Ok(files)
}

pub fn git_blame_impl(cwd: &str, path: &str) -> Result<Vec<BlameLine>, String> {
    let raw = run_git(cwd, &["blame", "--porcelain", path])?;
    let mut results: Vec<BlameLine> = Vec::new();
    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_date = String::new();
    let mut current_line_number: u32 = 0;
    let mut headers_seen: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();

    for line in raw.lines() {
        if line.is_empty() {
            continue;
        }

        // Header line: <hash> <orig_line> <final_line> [<num_lines>]
        if line.len() >= 40 && line.chars().take(40).all(|c| c.is_ascii_hexdigit()) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            current_hash = parts[0].to_string();
            if parts.len() >= 3 {
                current_line_number = parts[2].parse().unwrap_or(0);
            }
            // Reuse cached author/date if we've seen this commit before
            if let Some((author, date)) = headers_seen.get(&current_hash) {
                current_author = author.clone();
                current_date = date.clone();
            }
        } else if let Some(author) = line.strip_prefix("author ") {
            current_author = author.to_string();
        } else if let Some(time) = line.strip_prefix("author-time ") {
            // Convert unix timestamp to relative date
            if let Ok(ts) = time.trim().parse::<i64>() {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                let diff = now - ts;
                current_date = if diff < 60 {
                    "just now".to_string()
                } else if diff < 3600 {
                    format!("{} min ago", diff / 60)
                } else if diff < 86400 {
                    format!("{} hours ago", diff / 3600)
                } else if diff < 2592000 {
                    format!("{} days ago", diff / 86400)
                } else if diff < 31536000 {
                    format!("{} months ago", diff / 2592000)
                } else {
                    format!("{} years ago", diff / 31536000)
                };
            }
        } else if let Some(content) = line.strip_prefix('\t') {
            // This is the actual line content - marks end of a blame entry
            headers_seen.insert(current_hash.clone(), (current_author.clone(), current_date.clone()));
            results.push(BlameLine {
                line_number: current_line_number,
                hash: current_hash[..8.min(current_hash.len())].to_string(),
                author: current_author.clone(),
                date: current_date.clone(),
                content: content.to_string(),
            });
        }
    }

    Ok(results)
}
