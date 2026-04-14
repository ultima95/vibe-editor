# Git Integration Design

## Overview

Add full-featured git integration to Vibe Editor: a source control sidebar panel, inline diff viewer, and file tree status indicators. The backend shells out to the git CLI via a dedicated Rust service module.

## Architecture

### Backend: `git_service.rs`

A new Rust module that wraps `std::process::Command` calls to the system `git` binary. All commands use machine-parseable flags (`--porcelain=v2`, `-z`, `--format`) for reliable output parsing.

**Tauri commands exposed:**

| Command | Git operation | Notes |
|---|---|---|
| `git_status` | `git status --porcelain=v2 -z` | Structured list of changed files with index + worktree status |
| `git_diff` | `git diff [--cached] -- <path>` | Unified diff for a single file |
| `git_stage` | `git add -- <paths>` | Stage one or more files |
| `git_unstage` | `git restore --staged -- <paths>` | Unstage one or more files |
| `git_discard` | `git restore -- <path>` | Discard working tree changes for a file |
| `git_commit` | `git commit -m <msg>` | Commit staged changes |
| `git_log` | `git log --format=<json-friendly>` | Paginated commit history (50 per page) |
| `git_branches` | `git branch -a --format=...` | List local and remote branches |
| `git_checkout_branch` | `git switch <branch>` | Switch branches |
| `git_create_branch` | `git switch -c <branch>` | Create and switch to new branch |
| `git_delete_branch` | `git branch -d <branch>` | Delete a local branch |
| `git_merge` | `git merge <branch>` | Merge a branch into current |
| `git_rebase` | `git rebase <branch>` | Rebase current branch onto target |
| `git_stash_push` | `git stash push -m <msg>` | Stash working changes |
| `git_stash_pop` | `git stash pop [index]` | Pop a stash entry |
| `git_stash_list` | `git stash list --format=...` | List stash entries |
| `git_push` | `git push` | Push to remote |
| `git_pull` | `git pull` | Pull from remote |
| `git_remote_status` | `git rev-list --left-right --count HEAD...@{u}` | Ahead/behind counts |

Each command runs in the workspace root directory. Errors from git (non-zero exit, stderr) are returned as `Result::Err(String)` to the frontend.

**Output parsing:** The `--porcelain=v2 -z` format for status provides structured, NUL-delimited output. Each entry includes the index status, worktree status, and file path. The module parses this into a `Vec<GitFileStatus>` struct:

```rust
struct GitFileStatus {
    path: String,
    index_status: FileStatus,   // Staged status
    worktree_status: FileStatus, // Unstaged status
}

enum FileStatus {
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
```

**Stash entry:**

```rust
struct StashEntry {
    index: u32,       // Stash index (0, 1, 2, ...)
    message: String,  // Stash message (user-provided or auto-generated)
    branch: String,   // Branch the stash was created on
    timestamp: String, // ISO 8601 timestamp
}
```

### Frontend: State Management

**`git-store.ts`** (Zustand) — single source of truth for all git state:

```typescript
interface StashEntry {
    index: number;
    message: string;
    branch: string;
    timestamp: string;
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
    stashEntries: StashEntry[];
    isLoading: boolean;
    operationInProgress: string | null;

    // Actions
    refreshStatus: () => Promise<void>;
    stageFiles: (paths: string[]) => Promise<void>;
    unstageFiles: (paths: string[]) => Promise<void>;
    commit: (message: string) => Promise<void>;
    // ... etc
}
```

Both the Git sidebar panel and the file tree consume this store. The file tree reads `stagedFiles`, `changedFiles`, `untrackedFiles`, and `conflictedFiles` to render per-file indicators.

### Data Flow

1. Workspace opens → frontend calls `git_status` → populates git store
2. Existing `fs-change` events from the file watcher → frontend debounces (300ms) → re-fetches `git_status`
3. User performs an action (stage, commit, etc.) → call Tauri command → on success, re-fetch status
4. Git panel and file tree both read from the same git store — no duplicated state

## UI Components

### Git Sidebar Panel (`GitPanel.tsx`)

Added as a third tab in the sidebar alongside "Files" and "Search". The sidebar store's `activePanel` type extends to `"files" | "search" | "git"`.

**Layout (top to bottom):**

1. **Branch selector** — shows current branch name, click to open a branch picker dropdown. Right side shows ahead/behind remote counts (e.g., `↑0 ↓2`).

2. **Commit area** — text input for commit message, "Commit" button, and an overflow menu button (`⋯`) containing: Pull, Push, Stash, Merge, Rebase, View Log.

3. **Staged Changes** section — header with count and "unstage all" button (`−`). Lists files with status letter + colored filename. Each file row has hover actions: unstage, open diff.

4. **Changes** (unstaged) section — header with count and "stage all" button (`+`). Lists modified/deleted files. Each file row has hover actions: stage, discard, open diff.

5. **Untracked** section — header with count and "stage all" button. Lists `?` files.

**Color scheme:**
- Added/new: green (`#a6e3a1`)
- Modified: yellow (`#f9e2af`)
- Deleted: red (`#f38ba8`), filename has strikethrough
- Untracked: teal (`#94e2d5`)
- Conflicted: red/yellow badge (`C`)

**Interactions:**
- Click file → opens inline diff in editor tab
- Click +/− on file → stage/unstage that file
- Section +/− → stage all / unstage all in section
- Right-click file → context menu: stage, unstage, discard changes, open file
- Branch selector click → branch picker dropdown
- ⋯ menu → Pull, Push, Stash, Merge, Rebase, View Log

### File Tree Git Indicators

Each file node in the existing `FileTreeNode.tsx` component gains:
- **Colored filename** matching the status color scheme above
- **Status letter** (A, M, D, ?) right-aligned in the row, same color as filename
- **Deleted files** get strikethrough text

**Directory propagation:** Parent directories inherit the "most important" status from their children, with priority: C > A > M > D > ?. Conflicted is highest because it requires user action. The badge appears at reduced opacity (0.7) to distinguish from direct file status. This ensures collapsed directories still signal that something changed inside.

### Inline Diff View

Clicking a changed file in the Git panel opens an inline diff in a new editor tab.

- **Tab title:** `Δ <filename>` with `+N −M` stats
- **Read-only** — diffs are for viewing, not editing
- **Rendered via CodeMirror extension** that adds:
  - Red background tint + `−` gutter marker for deleted lines
  - Green background tint + `+` gutter marker for added lines
  - Hunk separator lines (`⋯ @@ ... @@`) between non-adjacent changed regions
- **Tab type:** New `"diff"` type added to the `Tab` interface, storing the file path and whether it's a staged or unstaged diff
- Diff content is fetched on-demand via `git_diff` when the tab opens

## Error Handling

### Not a git repo
- `git_status` returns error → store sets `isGitRepo: false`
- Git tab shows "Not a git repository" with an "Initialize" button (runs `git init`)
- File tree shows no git indicators

### git not installed
- First git command fails with "command not found" → store sets `gitAvailable: false`
- Git tab shows: "git not found. Install git to use source control."

### Merge conflicts
- `git status --porcelain=v2` reports conflicts with `u` prefix
- Conflicted files get a `C` badge in both file tree and git panel
- Opening a conflicted file shows conflict markers in the normal editor (not diff view)

### Auth for push/pull
- Git CLI handles auth natively (SSH keys, credential helpers)
- If push/pull fails, show the error in a toast notification
- For interactive auth prompts, surface a toast: "Authentication required — use the terminal"

### Concurrent operations
- Disable action buttons while a git operation is in progress (`operationInProgress` in store)
- Show spinner on the active button
- Queue status refreshes — don't stack concurrent `git_status` calls

## Performance

- `git status --porcelain=v2 -z`: fast, structured, NUL-delimited output
- Status refresh debounced at 300ms after fs-change events
- `git log` paginated: 50 commits per request
- `git diff` fetched per-file on demand, not bulk
- File tree indicator lookup is O(1) via a Map keyed by relative path

## New Files

### Backend (Rust)
- `src-tauri/src/git_service.rs` — git CLI wrapper, output parsing, all Tauri commands

### Frontend (TypeScript/React)
- `src/store/git-store.ts` — Zustand store for git state
- `src/components/GitPanel.tsx` — source control sidebar panel
- `src/components/BranchPicker.tsx` — branch selector dropdown
- `src/hooks/useGitDiff.ts` — hook for fetching and managing diff state

### Modified Files
- `src-tauri/src/lib.rs` — register new git Tauri commands, add git_service module
- `src/types.ts` — add `"diff"` tab type, git-related type definitions
- `src/store/sidebar-store.ts` — extend `activePanel` to include `"git"`
- `src/components/Sidebar.tsx` — add Git tab button and render GitPanel
- `src/components/FileTreeNode.tsx` — add git status indicators (color + letter)
- `src/components/EditorTab.tsx` — handle `"diff"` tab type with CodeMirror diff decorations
- `src-tauri/Cargo.toml` — no new dependencies needed (uses `std::process::Command`)

## Keyboard Shortcuts

- `Cmd+Shift+G` — focus/toggle Git sidebar panel (matches VS Code convention)

## Overflow Menu Features

### View Log

Accessed from the `⋯` overflow menu. Opens a **new tab** with type `"git-log"` titled "Git Log".

**Layout:** A scrollable list of commits, each showing:
- Abbreviated hash (7 chars, monospace, dimmed)
- Commit message (first line, truncated)
- Author name
- Relative timestamp ("2 hours ago")

**Pagination:** Initial load fetches 50 commits. Scrolling to the bottom triggers loading the next 50. A small "Loading..." indicator appears during fetch.

**Interaction:** Clicking a commit is a no-op in v1 (future: show commit diff). The log is read-only.

### Merge / Rebase

Accessed from the `⋯` overflow menu. Both open a **branch picker modal** (small dropdown anchored to the menu button) listing local branches. The user selects a target branch and confirms.

**On success:** Toast notification ("Merged feature-x into main") and status refresh.

**On conflict:**
- Toast notification: "Merge conflict — resolve conflicts and commit, or abort"
- Conflicted files appear in the git panel with `C` status
- A persistent banner appears at the top of the Git panel: "Merge in progress" (or "Rebase in progress") with **Abort** and **Continue** buttons
- Abort runs `git merge --abort` / `git rebase --abort`, Continue runs `git rebase --continue` (after user resolves conflicts and stages)

### Stash

The `⋯` menu shows a "Stash" submenu with three actions:
- **Stash Changes** — runs `git stash push`. If working tree is clean, the option is disabled. No message prompt in v1 (uses git's default message).
- **Pop Stash** — runs `git stash pop`. Disabled if stash list is empty. Pops the most recent entry (index 0).
- **Stash List** — opens a small dropdown below the menu showing stash entries (index, message, relative time). Each entry has a "Pop" and "Drop" action on hover. Scrollable if more than 5 entries.

## Testing

- **Rust unit tests** in `git_service.rs`: test output parsing for `--porcelain=v2` format with various file states (modified, added, deleted, renamed, conflicted)
- **Integration tests**: test against a real temporary git repo (using `tempfile` crate already in dev-deps)
- **Frontend**: manual testing covering these scenarios:
  - Stage/unstage single file and "all" button
  - Commit flow (message input, commit, status refresh)
  - Diff tab opens for staged and unstaged files
  - Branch switching via branch picker
  - File tree indicators update after stage/commit
  - Conflict state display (C badges, merge-in-progress banner)
  - Overflow menu actions (push, pull, stash, merge)
  - Non-git-repo and git-not-installed states
