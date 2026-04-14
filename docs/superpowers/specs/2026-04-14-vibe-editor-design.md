# Vibe Editor — Design Specification

**Date:** 2026-04-14
**Status:** Approved

## Overview

Vibe Editor is a lightweight, terminal-first macOS application that combines a terminal emulator with a file explorer and code editor. The primary use case is developers who want a fast, minimal terminal (like Warp or Alacritty) with integrated file browsing and editing — lighter than VS Code, more customizable than Zed.

The terminal is the primary surface. File explorer and editor are companions, not the center of the experience. The core design principle: **terminals and editors are equal citizens in a flexible tab group system**.

## Goals

- **Terminal-first:** the app launches into a terminal, not an editor
- **Lightweight:** ~30-50MB RAM baseline, fast startup
- **Flexible layout:** drag-and-drop tab groups where any tab can be a terminal or editor
- **Good file browsing:** tree view, fuzzy finder, full-text search, file operations
- **macOS only** for v0.1 — focus on one platform, ship faster

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| App shell | Tauri v2 | Lightweight native wrapper, Rust backend, system WebView (no bundled browser) |
| Frontend | React + TypeScript | Largest ecosystem, most terminal/editor libraries available |
| Terminal | xterm.js | Industry standard web terminal emulator (VS Code, Hyper, etc.) |
| Editor | CodeMirror 6 | Lighter than Monaco, modular, extensible, good for preview/edit |
| Backend | Rust | PTY management, file system operations, search |

## Architecture

### Single WebView per Window

Each window contains one WebView running the React SPA. All panels (file tree, editor tabs, terminal tabs) live in the same WebView and communicate via React state. Tauri IPC handles the Rust↔JS bridge.

```
┌─────────────────────────────────────────┐
│              macOS Window               │
│  ┌───────────────────────────────────┐  │
│  │         Single WebView            │  │
│  │  ┌─────────┬─────────────────┐   │  │
│  │  │ Sidebar │  Tab Group(s)   │   │  │
│  │  │ (toggle │  Terminal tabs   │   │  │
│  │  │  L / R) │  Editor tabs    │   │  │
│  │  │         │  Splits         │   │  │
│  │  └─────────┴─────────────────┘   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Rust Backend Modules

| Module | Responsibility |
|--------|---------------|
| `pty_manager` | Spawn/kill shells, stream I/O via Tauri events, handle resize |
| `fs_service` | Read/write/rename/move/copy/delete files. Watch directories for changes using the `notify` crate |
| `search` | Fuzzy file finder using `nucleo` crate. Full-text search using `grep` crate |
| `window_manager` | Track windows, workspace roots, persist layout state |
| `config` | User preferences — sidebar position, theme, keybindings. Stored as a config file |

### React Frontend Components

| Component | Responsibility |
|-----------|---------------|
| `TabGroupManager` | Manages the split layout. Creates/removes tab groups. Handles drag-drop between groups |
| `TabGroup` | A single group of tabs. Renders tab bar + active tab content |
| `TerminalTab` | xterm.js instance connected to a PTY via Tauri events |
| `EditorTab` | CodeMirror 6 instance. Reads/writes files via Tauri commands |
| `FileTree` | Virtual-scrolled directory tree. Context menu for file operations. Click to open in editor tab |
| `FuzzyFinder` | Cmd+P overlay. Queries Rust backend for fuzzy filename matches |
| `SearchPanel` | Sidebar panel for full-text search across files. Results open as editor tabs |
| `Sidebar` | Container for FileTree and SearchPanel. Toggleable with Cmd+B. Positionable left or right |

## Layout Model

### Flexible Tab Groups

The main content area uses a **tab group** system where:
- Each tab group holds an ordered list of tabs
- Each tab is either a **TerminalTab** or an **EditorTab**
- Tab groups can be split horizontally or vertically
- Tabs can be dragged between groups or to edges to create new splits
- When a group has no tabs, it closes and adjacent groups fill the space

### Sidebar

- Contains the file tree (default) or search panel
- Toggleable with `Cmd+B`
- Positionable on left or right side of the window
- Resizable via drag handle

### Default State

On launch: sidebar open (left), single tab group with one terminal tab. Terminal-first.

## Data Flow

### Terminal I/O

```
User types → xterm.js onData callback
  → Tauri event "pty-input" { id, data }
  → Rust: PTY manager writes to shell process stdin
  → Shell process produces output on stdout
  → Rust: PTY manager reads output
  → Tauri event "pty-output" { id, data }
  → xterm.js write() renders output
```

### File Operations

```
User clicks file in tree → Tauri invoke "read_file" { path }
  → Rust: read file contents
  → Return content to frontend
  → EditorTab renders content in CodeMirror

User saves (Cmd+S) → Tauri invoke "write_file" { path, content }
  → Rust: write file to disk
  → fs watcher detects change → updates FileTree
```

### Search

```
Fuzzy finder (Cmd+P):
  User types query → debounced Tauri invoke "fuzzy_search" { query, workspace_root }
  → Rust: nucleo fuzzy matches against file index
  → Return ranked results → render in overlay

Full-text search (Cmd+Shift+F):
  User submits query → Tauri invoke "text_search" { query, workspace_root, options }
  → Rust: grep crate searches files
  → Stream results via Tauri events → render incrementally in SearchPanel
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| PTY process crashes | Show error message in terminal tab. Offer "Restart Shell" button. Other tabs unaffected |
| File read/write failure | Toast notification with error (permission denied, not found, disk full, etc.) |
| Search timeout | Cancel after 10 seconds, show partial results with "Search timed out" message |
| File watcher disconnect | Auto-reconnect. Manual "Refresh" button as fallback |
| Large file opened in editor | Warn if file > 5MB. Offer read-only mode for very large files |
| Unsaved changes on close/quit | Show confirmation dialog: Save / Don't Save / Cancel. Per-tab for Cmd+W, bulk for Cmd+Q |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Toggle sidebar |
| `Cmd+P` | Fuzzy file finder |
| `Cmd+Shift+F` | Full-text search |
| `Cmd+T` | New terminal tab |
| `Cmd+N` | New editor tab |
| `Cmd+W` | Close current tab |
| `Cmd+S` | Save file |
| `Cmd+\` | Split tab group vertically (default) |
| `Cmd+Shift+\` | Split tab group horizontally |
| `Cmd+1/2/3` | Focus tab group 1/2/3 |

## Visual Style

- **Dark-first, minimal** — dark backgrounds (#1a1a2e), subtle borders (#2a2a4a)
- Purple accent (#7c3aed) for active indicators
- Monospace font throughout (system default or user-configured)
- No chrome, no decorations — content-dense

## MVP Scope (v0.1)

### In Scope

- Single window with flexible tab groups
- File tree sidebar (toggle, left/right position, resize)
- Terminal tabs (xterm.js + Rust PTY, multiple tabs)
- Editor tabs (CodeMirror 6, syntax highlighting, read/write)
- Tab drag-and-drop between groups, split to create groups
- Fuzzy file finder (Cmd+P)
- Full-text search (Cmd+Shift+F)
- File operations (rename, move, copy, delete via context menu)
- Dark theme
- Basic keybinding config (via config file)

### Out of Scope (Future)

- Multi-window support
- Custom themes / theme editor
- Git integration (status, blame, diff view)
- Extensions / plugin system
- Settings UI (config via file for v0.1)
- Auto-update mechanism
- Cross-platform (Linux, Windows)

## Testing Strategy

- **Rust backend:** Unit tests for PTY manager, fs_service, search modules. Integration tests for Tauri commands.
- **React frontend:** Component tests with React Testing Library. Integration tests for tab group drag-drop behavior.
- **E2E:** Tauri's WebDriver-based testing for full app flows (open file, edit, save, search).
