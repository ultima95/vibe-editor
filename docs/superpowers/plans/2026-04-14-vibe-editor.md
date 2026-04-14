# Vibe Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, terminal-first macOS app with integrated file explorer and code editor using Tauri v2.

**Architecture:** Single-window Tauri v2 app with one WebView. React SPA frontend with xterm.js terminals and CodeMirror 6 editors sharing a flexible tab group layout. Rust backend handles PTY management, file system operations, and search via Tauri IPC commands and events.

**Tech Stack:** Tauri v2, Rust, React 18, TypeScript, xterm.js, CodeMirror 6, Zustand (state), Vite

---

## File Structure

```
vibe-editor/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── src/
│   │   ├── lib.rs                  # Tauri app builder, command registration
│   │   ├── main.rs                 # Entry point (calls lib::run)
│   │   ├── pty_manager.rs          # PTY spawn/kill/IO, resize
│   │   ├── fs_service.rs           # File CRUD, directory listing, watcher
│   │   ├── search.rs               # Fuzzy file finder (nucleo), full-text (grep)
│   │   └── config.rs               # User preferences (sidebar, theme, keybinds)
│   └── tests/
│       ├── pty_manager_test.rs
│       ├── fs_service_test.rs
│       └── search_test.rs
├── src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Root component, keyboard shortcut provider
│   ├── types.ts                    # Shared TypeScript types
│   ├── store/
│   │   ├── tab-store.ts            # Zustand store for tab groups, tabs, splits
│   │   ├── sidebar-store.ts        # Sidebar state (visible, position, active panel)
│   │   └── app-store.ts            # Global app state (workspace root, config)
│   ├── components/
│   │   ├── AppShell.tsx            # Top-level layout: sidebar + tab group area
│   │   ├── Sidebar.tsx             # Sidebar container (file tree / search panel)
│   │   ├── FileTree.tsx            # Virtual-scrolled directory tree
│   │   ├── FileTreeNode.tsx        # Single tree node (file or folder)
│   │   ├── TabGroupManager.tsx     # Renders split layout of tab groups
│   │   ├── TabGroup.tsx            # Tab bar + active tab content
│   │   ├── TabBar.tsx              # Tab strip with drag-drop
│   │   ├── TerminalTab.tsx         # xterm.js wrapper, PTY connection
│   │   ├── EditorTab.tsx           # CodeMirror 6 wrapper, file read/write
│   │   ├── FuzzyFinder.tsx         # Cmd+P overlay
│   │   ├── SearchPanel.tsx         # Full-text search in sidebar
│   │   ├── ContextMenu.tsx         # Right-click context menu
│   │   └── Toast.tsx               # Toast notification system
│   ├── hooks/
│   │   ├── use-pty.ts              # PTY lifecycle: spawn, write, listen, kill
│   │   ├── use-file-system.ts      # File operations via Tauri commands
│   │   ├── use-keyboard-shortcuts.ts # Global keybinding registration
│   │   └── use-resize-observer.ts  # Resize observer for panels
│   └── styles/
│       └── globals.css             # Dark theme, layout utilities
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── .gitignore
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: entire project skeleton via `create-tauri-app`
- Modify: `package.json` (add dependencies)
- Modify: `src-tauri/Cargo.toml` (add dependencies)
- Modify: `src-tauri/tauri.conf.json` (window config)

- [ ] **Step 1: Initialize Tauri v2 + React + TypeScript project**

```bash
cd /Users/ultima/Workspace/vibe-editor
# Remove existing files (only .git, docs, .gitignore, .superpowers exist)
npm create tauri-app@latest . -- --template react-ts --manager npm
```

If it prompts, choose: Package manager: npm, UI template: React, TypeScript.

- [ ] **Step 2: Install frontend dependencies**

```bash
npm install
npm install zustand @xterm/xterm @xterm/addon-fit @xterm/addon-webgl codemirror @codemirror/lang-javascript @codemirror/lang-rust @codemirror/lang-python @codemirror/lang-html @codemirror/lang-css @codemirror/lang-json @codemirror/theme-one-dark @codemirror/view @codemirror/state react-virtuoso
npm install -D @types/node
```

- [ ] **Step 3: Add Rust dependencies to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.8"
notify = { version = "7", features = ["macos_fsevent"] }
nucleo = "0.5"
grep-regex = "0.1"
grep-searcher = "0.1"
grep-matcher = "0.1"
uuid = { version = "1", features = ["v4"] }
dirs = "6"
toml = "0.8"
tokio = { version = "1", features = ["full"] }
parking_lot = "0.12"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 4: Configure the Tauri window**

In `src-tauri/tauri.conf.json`, update the window configuration:

```json
{
  "app": {
    "windows": [
      {
        "title": "Vibe Editor",
        "width": 1200,
        "height": 800,
        "minWidth": 600,
        "minHeight": 400,
        "decorations": true,
        "transparent": false
      }
    ]
  }
}
```

- [ ] **Step 5: Verify project builds and opens**

```bash
cd /Users/ultima/Workspace/vibe-editor
npm run tauri dev
```

Expected: A Tauri window opens showing the default React template.

- [ ] **Step 6: Update .gitignore and commit**

Append to `.gitignore`:

```
node_modules/
src-tauri/target/
dist/
.superpowers/
```

```bash
git add -A
git commit -m "feat: initialize Tauri v2 + React + TypeScript project

Scaffolded with create-tauri-app. Added dependencies:
- Frontend: xterm.js, CodeMirror 6, Zustand, react-virtuoso
- Backend: portable-pty, notify, nucleo, grep crates"
```

---

## Task 2: Rust PTY Manager

**Files:**
- Create: `src-tauri/src/pty_manager.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)
- Modify: `src-tauri/src/main.rs` (if needed)
- Create: `src-tauri/tests/pty_manager_test.rs`

- [ ] **Step 1: Write tests for PTY manager**

Create `src-tauri/tests/pty_manager_test.rs`:

```rust
use std::time::Duration;
use std::thread;

// Integration tests for PTY manager
// These test the public API without Tauri (direct function calls)

#[test]
fn test_spawn_pty_returns_id() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty(80, 24, None, None).unwrap();
    assert!(!id.is_empty());
    manager.kill_pty(&id).unwrap();
}

#[test]
fn test_kill_pty_cleans_up() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty(80, 24, None, None).unwrap();
    manager.kill_pty(&id).unwrap();
    // Killing again should return an error
    assert!(manager.kill_pty(&id).is_err());
}

#[test]
fn test_write_to_pty() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty(80, 24, None, None).unwrap();
    // Writing should not panic or error
    manager.write_to_pty(&id, "echo hello\n").unwrap();
    thread::sleep(Duration::from_millis(100));
    manager.kill_pty(&id).unwrap();
}

#[test]
fn test_resize_pty() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    let id = manager.spawn_pty(80, 24, None, None).unwrap();
    manager.resize_pty(&id, 120, 40).unwrap();
    manager.kill_pty(&id).unwrap();
}

#[test]
fn test_write_to_nonexistent_pty_errors() {
    let manager = vibe_editor_lib::pty_manager::PtyManager::new();
    assert!(manager.write_to_pty("nonexistent", "data").is_err());
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri
cargo test --test pty_manager_test 2>&1
```

Expected: Compilation error — `pty_manager` module doesn't exist yet.

- [ ] **Step 3: Implement PtyManager**

Create `src-tauri/src/pty_manager.rs`:

```rust
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use uuid::Uuid;

pub struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn_pty(
        &self,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
        shell: Option<String>,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell_path = shell.unwrap_or_else(|| {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        });

        let mut cmd = CommandBuilder::new(&shell_path);
        cmd.arg("-l"); // login shell
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let id = Uuid::new_v4().to_string();

        let instance = PtyInstance {
            master: pair.master,
            writer,
            _child: child,
        };

        self.instances.lock().insert(id.clone(), instance);
        Ok(id)
    }

    pub fn write_to_pty(&self, id: &str, data: &str) -> Result<(), String> {
        let mut instances = self.instances.lock();
        let instance = instances
            .get_mut(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        instance
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        instance
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    }

    pub fn resize_pty(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instances = self.instances.lock();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;
        Ok(())
    }

    pub fn kill_pty(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock();
        instances
            .remove(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        // Dropping the instance closes the master PTY, which signals the child
        Ok(())
    }

    pub fn take_reader(
        &self,
        id: &str,
    ) -> Result<Box<dyn Read + Send>, String> {
        let instances = self.instances.lock();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        instance
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))
    }
}
```

- [ ] **Step 4: Update lib.rs to expose the module**

Update `src-tauri/src/lib.rs`:

```rust
pub mod pty_manager;

use pty_manager::PtyManager;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

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

    // Spawn a thread to read PTY output and emit events
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
        .plugin(tauri_plugin_shell::init())
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd src-tauri
cargo test --test pty_manager_test 2>&1
```

Expected: All 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement Rust PTY manager

Spawn/kill shells, write input, resize, stream output via Tauri events.
Uses portable-pty crate for cross-platform PTY handling."
```

---

## Task 3: Terminal Tab Component (xterm.js)

**Files:**
- Create: `src/hooks/use-pty.ts`
- Create: `src/types.ts`
- Create: `src/components/TerminalTab.tsx`
- Modify: `src/App.tsx`
- Create: `src/styles/globals.css`

- [ ] **Step 1: Create shared types**

Create `src/types.ts`:

```typescript
export interface Tab {
  id: string;
  type: "terminal" | "editor";
  title: string;
  ptyId?: string;       // for terminal tabs
  filePath?: string;    // for editor tabs
  isDirty?: boolean;    // for editor tabs with unsaved changes
}

export interface TabGroup {
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

export type SplitDirection = "horizontal" | "vertical";

export interface SplitNode {
  type: "leaf" | "split";
  direction?: SplitDirection;
  ratio?: number;          // 0-1, how much space the first child gets
  groupId?: string;        // for leaf nodes
  children?: SplitNode[];  // for split nodes (always 2)
}

export interface SidebarState {
  visible: boolean;
  position: "left" | "right";
  width: number;
  activePanel: "files" | "search";
}
```

- [ ] **Step 2: Create the PTY hook**

Create `src/hooks/use-pty.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface UsePtyOptions {
  cols: number;
  rows: number;
  cwd?: string;
  onData: (data: string) => void;
  onExit: () => void;
}

export function usePty({ cols, rows, cwd, onData, onExit }: UsePtyOptions) {
  const ptyIdRef = useRef<string | null>(null);
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  const unlistenExitRef = useRef<UnlistenFn | null>(null);

  const spawn = useCallback(async () => {
    const id = await invoke<string>("spawn_pty", { cols, rows, cwd });
    ptyIdRef.current = id;

    unlistenOutputRef.current = await listen<string>(
      `pty-output-${id}`,
      (event) => onData(event.payload)
    );
    unlistenExitRef.current = await listen<void>(
      `pty-exit-${id}`,
      () => onExit()
    );

    return id;
  }, [cols, rows, cwd, onData, onExit]);

  const write = useCallback(async (data: string) => {
    if (ptyIdRef.current) {
      await invoke("write_pty", { id: ptyIdRef.current, data });
    }
  }, []);

  const resize = useCallback(async (cols: number, rows: number) => {
    if (ptyIdRef.current) {
      await invoke("resize_pty", { id: ptyIdRef.current, cols, rows });
    }
  }, []);

  const kill = useCallback(async () => {
    if (ptyIdRef.current) {
      unlistenOutputRef.current?.();
      unlistenExitRef.current?.();
      await invoke("kill_pty", { id: ptyIdRef.current });
      ptyIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      kill();
    };
  }, [kill]);

  return { spawn, write, resize, kill, ptyIdRef };
}
```

- [ ] **Step 3: Create the TerminalTab component**

Create `src/components/TerminalTab.tsx`:

```tsx
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { usePty } from "../hooks/use-pty";
import "@xterm/xterm/css/xterm.css";

interface TerminalTabProps {
  cwd?: string;
  isActive: boolean;
}

export function TerminalTab({ cwd, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);

  const handleData = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const handleExit = useCallback(() => {
    terminalRef.current?.write("\r\n[Process exited]\r\n");
  }, []);

  const { spawn, write, resize } = usePty({
    cols: 80,
    rows: 24,
    cwd,
    onData: handleData,
    onExit: handleExit,
  });

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const terminal = new Terminal({
      fontSize: 14,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#7c3aed",
        selectionBackground: "#7c3aed44",
        black: "#1a1a2e",
        red: "#ff5555",
        green: "#22c55e",
        yellow: "#e5c07b",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#e0e0e0",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available, fall back to canvas renderer
    }

    fitAddon.fit();

    terminal.onData((data) => write(data));

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Spawn PTY with terminal dimensions
    const dims = fitAddon.proposeDimensions();
    spawn().then(() => {
      if (dims) {
        resize(dims.cols, dims.rows);
      }
    });

    return () => {
      terminal.dispose();
    };
  }, []);

  // Handle resize when tab becomes active or window resizes
  useEffect(() => {
    if (!isActive || !fitAddonRef.current) return;

    const handleResize = () => {
      fitAddonRef.current?.fit();
      const dims = fitAddonRef.current?.proposeDimensions();
      if (dims) {
        resize(dims.cols, dims.rows);
      }
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isActive, resize]);

  // Focus terminal when active
  useEffect(() => {
    if (isActive) {
      terminalRef.current?.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: isActive ? "block" : "none",
      }}
    />
  );
}
```

- [ ] **Step 4: Create globals.css with dark theme**

Create `src/styles/globals.css`:

```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16162a;
  --bg-tertiary: #12121f;
  --border: #2a2a4a;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --text-muted: #555;
  --accent: #7c3aed;
  --accent-hover: #6d28d9;
  --success: #22c55e;
  --warning: #e5c07b;
  --error: #ff5555;
  --tab-height: 36px;
  --sidebar-min-width: 180px;
  --sidebar-default-width: 240px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

::selection {
  background: var(--accent);
  color: white;
}
```

- [ ] **Step 5: Update App.tsx to render a terminal**

Replace `src/App.tsx`:

```tsx
import { TerminalTab } from "./components/TerminalTab";
import "./styles/globals.css";

function App() {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <TerminalTab isActive={true} />
    </div>
  );
}

export default App;
```

- [ ] **Step 6: Verify terminal works**

```bash
npm run tauri dev
```

Expected: App opens with a working terminal. You can type commands, see output, use shell features (tab completion, history, etc.).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add working terminal tab with xterm.js

TerminalTab component with PTY hook, WebGL rendering, auto-fit,
dark theme. Terminal is functional with full shell interaction."
```

---

## Task 4: App Shell & Sidebar Layout

**Files:**
- Create: `src/store/sidebar-store.ts`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/hooks/use-resize-observer.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create sidebar store**

Create `src/store/sidebar-store.ts`:

```typescript
import { create } from "zustand";

interface SidebarStore {
  visible: boolean;
  position: "left" | "right";
  width: number;
  activePanel: "files" | "search";
  toggle: () => void;
  setPosition: (position: "left" | "right") => void;
  setWidth: (width: number) => void;
  setActivePanel: (panel: "files" | "search") => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  visible: true,
  position: "left",
  width: 240,
  activePanel: "files",
  toggle: () => set((s) => ({ visible: !s.visible })),
  setPosition: (position) => set({ position }),
  setWidth: (width) => set({ width: Math.max(180, Math.min(500, width)) }),
  setActivePanel: (activePanel) => set({ activePanel }),
}));
```

- [ ] **Step 2: Create Sidebar component with resize handle**

Create `src/components/Sidebar.tsx`:

```tsx
import { useRef, useCallback } from "react";
import { useSidebarStore } from "../store/sidebar-store";

export function Sidebar() {
  const { visible, position, width, setWidth } = useSidebarStore();
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      resizing.current = true;
      startX.current = e.clientX;
      startWidth.current = width;

      const onMouseMove = (e: MouseEvent) => {
        if (!resizing.current) return;
        const delta =
          position === "left"
            ? e.clientX - startX.current
            : startX.current - e.clientX;
        setWidth(startWidth.current + delta);
      };

      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, position, setWidth]
  );

  if (!visible) return null;

  const resizeHandle = (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 4,
        cursor: "col-resize",
        background: "transparent",
        flexShrink: 0,
      }}
      onMouseEnter={(e) =>
        ((e.target as HTMLElement).style.background = "var(--accent)")
      }
      onMouseLeave={(e) =>
        ((e.target as HTMLElement).style.background = "transparent")
      }
    />
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: position === "left" ? "row" : "row-reverse",
        width,
        flexShrink: 0,
        background: "var(--bg-secondary)",
        borderRight:
          position === "left" ? "1px solid var(--border)" : "none",
        borderLeft:
          position === "right" ? "1px solid var(--border)" : "none",
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            color: "var(--text-secondary)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1,
            userSelect: "none",
          }}
        >
          Explorer
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
          {/* FileTree will go here */}
          <div style={{ color: "var(--text-muted)", padding: "8px" }}>
            No folder open
          </div>
        </div>
      </div>
      {resizeHandle}
    </div>
  );
}
```

- [ ] **Step 3: Create AppShell component**

Create `src/components/AppShell.tsx`:

```tsx
import { Sidebar } from "./Sidebar";
import { TerminalTab } from "./TerminalTab";
import { useSidebarStore } from "../store/sidebar-store";

export function AppShell() {
  const { position } = useSidebarStore();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: position === "left" ? "row" : "row-reverse",
        width: "100%",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <Sidebar />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TerminalTab isActive={true} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update App.tsx**

Replace `src/App.tsx`:

```tsx
import { AppShell } from "./components/AppShell";
import "./styles/globals.css";

function App() {
  return <AppShell />;
}

export default App;
```

- [ ] **Step 5: Verify sidebar renders and resizes**

```bash
npm run tauri dev
```

Expected: App shows sidebar on the left with "Explorer" header and "No folder open" placeholder. Sidebar resize handle works. Terminal fills the remaining space.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add app shell with collapsible, resizable sidebar

Sidebar with resize handle, left/right positioning, toggle support.
AppShell composes sidebar + content area."
```

---

## Task 5: Tab Group System

**Files:**
- Create: `src/store/tab-store.ts`
- Create: `src/components/TabBar.tsx`
- Create: `src/components/TabGroup.tsx`
- Create: `src/components/TabGroupManager.tsx`
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Create tab store with Zustand**

Create `src/store/tab-store.ts`:

```typescript
import { create } from "zustand";
import { Tab, TabGroup, SplitNode } from "../types";

interface TabStore {
  groups: Record<string, TabGroup>;
  layout: SplitNode;

  // Tab operations
  addTab: (groupId: string, tab: Tab) => void;
  removeTab: (groupId: string, tabId: string) => void;
  setActiveTab: (groupId: string, tabId: string) => void;
  moveTab: (fromGroupId: string, toGroupId: string, tabId: string) => void;

  // Group operations
  splitGroup: (
    groupId: string,
    direction: "horizontal" | "vertical",
    newTab: Tab
  ) => void;
  removeGroup: (groupId: string) => void;

  // Helpers
  getActiveGroup: () => TabGroup | undefined;
  activeGroupId: string;
  setActiveGroupId: (id: string) => void;
}

let nextGroupNum = 1;

function createGroup(tab: Tab): TabGroup {
  return {
    id: `group-${nextGroupNum++}`,
    tabs: [tab],
    activeTabId: tab.id,
  };
}

function createTerminalTab(): Tab {
  const id = `terminal-${Date.now()}`;
  return {
    id,
    type: "terminal",
    title: "Terminal",
  };
}

const initialTab = createTerminalTab();
const initialGroup = createGroup(initialTab);

export const useTabStore = create<TabStore>((set, get) => ({
  groups: { [initialGroup.id]: initialGroup },
  layout: { type: "leaf", groupId: initialGroup.id },
  activeGroupId: initialGroup.id,

  addTab: (groupId, tab) =>
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabs: [...group.tabs, tab],
            activeTabId: tab.id,
          },
        },
      };
    }),

  removeTab: (groupId, tabId) =>
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      const newTabs = group.tabs.filter((t) => t.id !== tabId);
      if (newTabs.length === 0) {
        // Remove the group entirely
        get().removeGroup(groupId);
        return get();
      }
      const activeTabId =
        group.activeTabId === tabId
          ? newTabs[Math.max(0, group.tabs.findIndex((t) => t.id === tabId) - 1)]
              .id
          : group.activeTabId;
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, tabs: newTabs, activeTabId },
        },
      };
    }),

  setActiveTab: (groupId, tabId) =>
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, activeTabId: tabId },
        },
        activeGroupId: groupId,
      };
    }),

  moveTab: (fromGroupId, toGroupId, tabId) =>
    set((state) => {
      const from = state.groups[fromGroupId];
      const to = state.groups[toGroupId];
      if (!from || !to) return state;
      const tab = from.tabs.find((t) => t.id === tabId);
      if (!tab) return state;

      const newFromTabs = from.tabs.filter((t) => t.id !== tabId);
      const newGroups = { ...state.groups };

      if (newFromTabs.length === 0) {
        delete newGroups[fromGroupId];
      } else {
        newGroups[fromGroupId] = {
          ...from,
          tabs: newFromTabs,
          activeTabId:
            from.activeTabId === tabId ? newFromTabs[0].id : from.activeTabId,
        };
      }

      newGroups[toGroupId] = {
        ...to,
        tabs: [...to.tabs, tab],
        activeTabId: tab.id,
      };

      return { groups: newGroups, activeGroupId: toGroupId };
    }),

  splitGroup: (groupId, direction, newTab) =>
    set((state) => {
      const newGroup = createGroup(newTab);

      function splitNode(node: SplitNode): SplitNode {
        if (node.type === "leaf" && node.groupId === groupId) {
          return {
            type: "split",
            direction,
            ratio: 0.5,
            children: [
              { type: "leaf", groupId },
              { type: "leaf", groupId: newGroup.id },
            ],
          };
        }
        if (node.type === "split" && node.children) {
          return {
            ...node,
            children: node.children.map(splitNode),
          };
        }
        return node;
      }

      return {
        groups: { ...state.groups, [newGroup.id]: newGroup },
        layout: splitNode(state.layout),
        activeGroupId: newGroup.id,
      };
    }),

  removeGroup: (groupId) =>
    set((state) => {
      const newGroups = { ...state.groups };
      delete newGroups[groupId];

      function collapseNode(node: SplitNode): SplitNode | null {
        if (node.type === "leaf") {
          return node.groupId === groupId ? null : node;
        }
        if (node.type === "split" && node.children) {
          const children = node.children
            .map(collapseNode)
            .filter(Boolean) as SplitNode[];
          if (children.length === 0) return null;
          if (children.length === 1) return children[0];
          return { ...node, children };
        }
        return node;
      }

      const newLayout = collapseNode(state.layout);
      const groupIds = Object.keys(newGroups);
      const newActiveGroupId = groupIds.includes(state.activeGroupId)
        ? state.activeGroupId
        : groupIds[0] || "";

      return {
        groups: newGroups,
        layout: newLayout || { type: "leaf", groupId: "" },
        activeGroupId: newActiveGroupId,
      };
    }),

  getActiveGroup: () => {
    const state = get();
    return state.groups[state.activeGroupId];
  },

  setActiveGroupId: (id) => set({ activeGroupId: id }),
}));

export { createTerminalTab };
```

- [ ] **Step 2: Create TabBar component**

Create `src/components/TabBar.tsx`:

```tsx
import { Tab } from "../types";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}: TabBarProps) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
        height: "var(--tab-height)",
        alignItems: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            style={{
              padding: "0 12px",
              height: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontSize: 12,
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              background: isActive ? "var(--bg-primary)" : "transparent",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span>{tab.type === "terminal" ? "⬛" : "📄"}</span>
            <span>{tab.title}{tab.isDirty ? " •" : ""}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              style={{
                opacity: 0.5,
                fontSize: 14,
                lineHeight: 1,
                marginLeft: 4,
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.opacity = "1")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.opacity = "0.5")
              }
            >
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create TabGroup component**

Create `src/components/TabGroup.tsx`:

```tsx
import { TabBar } from "./TabBar";
import { TerminalTab } from "./TerminalTab";
import { useTabStore } from "../store/tab-store";

interface TabGroupProps {
  groupId: string;
}

export function TabGroup({ groupId }: TabGroupProps) {
  const group = useTabStore((s) => s.groups[groupId]);
  const activeGroupId = useTabStore((s) => s.activeGroupId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const setActiveGroupId = useTabStore((s) => s.setActiveGroupId);

  if (!group) return null;

  const isActiveGroup = groupId === activeGroupId;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        outline: isActiveGroup ? "1px solid var(--accent)" : "none",
        outlineOffset: -1,
      }}
      onClick={() => setActiveGroupId(groupId)}
    >
      <TabBar
        tabs={group.tabs}
        activeTabId={group.activeTabId}
        onSelectTab={(tabId) => setActiveTab(groupId, tabId)}
        onCloseTab={(tabId) => removeTab(groupId, tabId)}
      />
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {group.tabs.map((tab) => {
          const isActive = tab.id === group.activeTabId;
          if (tab.type === "terminal") {
            return (
              <TerminalTab
                key={tab.id}
                isActive={isActive && isActiveGroup}
              />
            );
          }
          // EditorTab will be added in Task 7
          return (
            <div
              key={tab.id}
              style={{
                display: isActive ? "flex" : "none",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-muted)",
              }}
            >
              Editor: {tab.filePath}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create TabGroupManager for split rendering**

Create `src/components/TabGroupManager.tsx`:

```tsx
import { SplitNode } from "../types";
import { TabGroup } from "./TabGroup";
import { useTabStore } from "../store/tab-store";

function RenderNode({ node }: { node: SplitNode }) {
  if (node.type === "leaf") {
    if (!node.groupId) return null;
    return <TabGroup groupId={node.groupId} />;
  }

  if (node.type === "split" && node.children) {
    const isVertical = node.direction === "vertical";
    const ratio = node.ratio ?? 0.5;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: isVertical ? "row" : "column",
          width: "100%",
          height: "100%",
        }}
      >
        <div
          style={{
            [isVertical ? "width" : "height"]: `${ratio * 100}%`,
            overflow: "hidden",
          }}
        >
          <RenderNode node={node.children[0]} />
        </div>
        <div
          style={{
            [isVertical ? "width" : "height"]: 1,
            background: "var(--border)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            flex: 1,
            overflow: "hidden",
          }}
        >
          <RenderNode node={node.children[1]} />
        </div>
      </div>
    );
  }

  return null;
}

export function TabGroupManager() {
  const layout = useTabStore((s) => s.layout);
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <RenderNode node={layout} />
    </div>
  );
}
```

- [ ] **Step 5: Update AppShell to use TabGroupManager**

Replace `src/components/AppShell.tsx`:

```tsx
import { Sidebar } from "./Sidebar";
import { TabGroupManager } from "./TabGroupManager";
import { useSidebarStore } from "../store/sidebar-store";

export function AppShell() {
  const { position } = useSidebarStore();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: position === "left" ? "row" : "row-reverse",
        width: "100%",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <Sidebar />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TabGroupManager />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify tab groups work**

```bash
npm run tauri dev
```

Expected: App shows sidebar + a single tab group with one terminal tab. Terminal has a tab bar showing "⬛ Terminal" with close button. Active group has a subtle accent outline.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add tab group system with splits

TabStore (Zustand) manages groups, tabs, splits, and active state.
TabBar, TabGroup, and TabGroupManager render the flexible layout.
Supports terminal and editor tabs as equal citizens."
```

---

## Task 5b: Tab Drag-and-Drop

**Files:**
- Modify: `src/components/TabBar.tsx` (add drag source/drop target)
- Modify: `src/components/TabGroupManager.tsx` (drop zones for new splits)

- [ ] **Step 1: Add drag-and-drop to TabBar**

Update `src/components/TabBar.tsx` to make each tab draggable using the HTML Drag and Drop API:

```tsx
// On each tab div, add:
draggable
onDragStart={(e) => {
  e.dataTransfer.setData("tab-id", tab.id);
  e.dataTransfer.setData("from-group", groupId);
  e.dataTransfer.effectAllowed = "move";
}}
```

Add a `groupId` prop to `TabBarProps` and pass it through from `TabGroup`.

Add a drop target on the tab bar itself:

```tsx
onDragOver={(e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}}
onDrop={(e) => {
  e.preventDefault();
  const tabId = e.dataTransfer.getData("tab-id");
  const fromGroup = e.dataTransfer.getData("from-group");
  if (fromGroup && tabId && fromGroup !== groupId) {
    moveTab(fromGroup, groupId, tabId);
  }
}}
```

- [ ] **Step 2: Add edge drop zones in TabGroupManager for creating new splits**

In `src/components/TabGroupManager.tsx`, wrap each `TabGroup` leaf node in a container that shows drop zones on the edges (top, bottom, left, right) when a tab is being dragged. When a tab is dropped on an edge, call `splitGroup` with the appropriate direction and move the tab into the new group.

```tsx
// Drop zone overlay — shown during drag
function DropZoneOverlay({ groupId }: { groupId: string }) {
  const splitGroup = useTabStore((s) => s.splitGroup);
  const moveTab = useTabStore((s) => s.moveTab);

  const handleEdgeDrop = (
    e: React.DragEvent,
    direction: "horizontal" | "vertical"
  ) => {
    e.preventDefault();
    const tabId = e.dataTransfer.getData("tab-id");
    const fromGroup = e.dataTransfer.getData("from-group");
    if (!tabId || !fromGroup) return;

    // Create a placeholder tab in the new split, then move the dragged tab
    const placeholder: Tab = {
      id: `terminal-${Date.now()}`,
      type: "terminal",
      title: "Terminal",
    };
    splitGroup(groupId, direction, placeholder);

    // After split, move the dragged tab to the new group and remove placeholder
    // (The new group is the last one created)
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Left edge */}
      <div
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "20%", pointerEvents: "auto" }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => handleEdgeDrop(e, "vertical")}
      />
      {/* Right edge */}
      <div
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "20%", pointerEvents: "auto" }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => handleEdgeDrop(e, "vertical")}
      />
      {/* Top/bottom edges similarly for horizontal splits */}
    </div>
  );
}
```

- [ ] **Step 3: Verify drag-and-drop works**

```bash
npm run tauri dev
```

Expected: Open multiple tabs across split groups. Drag a tab from one group's tab bar and drop on another group's tab bar → tab moves. Drag to an edge of a group → creates a new split.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add tab drag-and-drop between groups

Drag tabs between tab bars to move them. Drag to group edges
to create new splits. HTML5 Drag and Drop API."
```

---

## Task 6: File System Service (Rust)

**Files:**
- Create: `src-tauri/src/fs_service.rs`
- Create: `src-tauri/tests/fs_service_test.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)

- [ ] **Step 1: Write tests for fs_service**

Create `src-tauri/tests/fs_service_test.rs`:

```rust
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
    let new = dir.path().join("new.txt");
    fs::write(&old, "content").unwrap();

    vibe_editor_lib::fs_service::rename_path(old.to_str().unwrap(), new.to_str().unwrap()).unwrap();
    assert!(!old.exists());
    assert!(new.exists());
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test --test fs_service_test 2>&1
```

Expected: Compilation error — module doesn't exist.

- [ ] **Step 3: Implement fs_service**

Create `src-tauri/src/fs_service.rs`:

```rust
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

pub fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    fs::write(path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

pub fn list_directory(path: &str) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let read_dir =
        fs::read_dir(path).map_err(|e| format!("Failed to read directory {}: {}", path, e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files starting with .
        if name.starts_with('.') {
            continue;
        }

        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

pub fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path)
        .map_err(|e| format!("Failed to rename {} to {}: {}", old_path, new_path, e))
}

pub fn delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to delete {}: {}", path, e))
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to delete {}: {}", path, e))
    }
}

pub fn copy_path(src: &str, dst: &str) -> Result<(), String> {
    let src_path = Path::new(src);
    if src_path.is_dir() {
        copy_dir_recursive(src, dst)
    } else {
        fs::copy(src, dst)
            .map(|_| ())
            .map_err(|e| format!("Failed to copy {} to {}: {}", src, dst, e))
    }
}

fn copy_dir_recursive(src: &str, dst: &str) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {}", dst, e))?;
    for entry in
        fs::read_dir(src).map_err(|e| format!("Failed to read {}: {}", src, e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = Path::new(dst).join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(
                src_path.to_str().unwrap(),
                dst_path.to_str().unwrap(),
            )?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| {
                format!("Failed to copy {:?} to {:?}: {}", src_path, dst_path, e)
            })?;
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Register fs commands in lib.rs**

Add to `src-tauri/src/lib.rs` — add `pub mod fs_service;` at the top, then add these command functions and register them:

```rust
pub mod fs_service;

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs_service::read_file(&path)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs_service::write_file(&path, &content)
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<fs_service::DirEntry>, String> {
    fs_service::list_directory(&path)
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs_service::rename_path(&old_path, &new_path)
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    fs_service::delete_path(&path)
}

#[tauri::command]
fn copy_path(src: String, dst: String) -> Result<(), String> {
    fs_service::copy_path(&src, &dst)
}
```

Add to `invoke_handler`: `read_file, write_file, list_directory, rename_path, delete_path, copy_path`

- [ ] **Step 5: Run tests**

```bash
cd src-tauri && cargo test --test fs_service_test 2>&1
```

Expected: All 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement file system service

Read/write/list/rename/delete/copy files and directories.
Hidden files filtered, dirs sorted first. Tauri commands registered."
```

---

## Task 6b: File Watcher

**Files:**
- Modify: `src-tauri/src/fs_service.rs` (add watcher)
- Modify: `src-tauri/src/lib.rs` (register watch/unwatch commands, emit events)

- [ ] **Step 1: Add file watcher to fs_service**

Add to `src-tauri/src/fs_service.rs`:

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::sync::mpsc;

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
        .watch(std::path::Path::new(path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", path, e))?;

    // Spawn thread to forward events
    std::thread::spawn(move || {
        while let Ok(event) = rx.recv() {
            callback(event);
        }
    });

    Ok(FsWatcher { _watcher: watcher })
}
```

- [ ] **Step 2: Register watch command and emit Tauri events**

In `src-tauri/src/lib.rs`, add a `watch_directory` Tauri command that starts watching and emits `"fs-change"` events to the frontend:

```rust
use std::sync::Mutex;

// Add to AppState:
// fs_watcher: Mutex<Option<fs_service::FsWatcher>>,

#[tauri::command]
fn watch_directory(state: State<'_, Arc<AppState>>, app: AppHandle, path: String) -> Result<(), String> {
    let app_handle = app.clone();
    let watcher = fs_service::watch_directory(&path, move |event| {
        let _ = app_handle.emit("fs-change", serde_json::json!({
            "kind": format!("{:?}", event.kind),
            "paths": event.paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
        }));
    })?;
    *state.fs_watcher.lock() = Some(watcher);
    Ok(())
}
```

Register `watch_directory` in the invoke_handler.

- [ ] **Step 3: Listen for fs-change events in FileTree**

In `src/components/FileTree.tsx`, listen for the `"fs-change"` Tauri event and refresh the affected directory:

```typescript
import { listen } from "@tauri-apps/api/event";

useEffect(() => {
  const unlisten = listen("fs-change", () => {
    // Re-fetch root directory listing
    if (workspaceRoot) {
      listDirectory(workspaceRoot).then(setEntries).catch(console.error);
    }
  });
  return () => { unlisten.then((fn) => fn()); };
}, [workspaceRoot]);
```

- [ ] **Step 4: Start watcher on workspace open**

In `src/components/AppShell.tsx`, after setting workspaceRoot, also invoke `watch_directory`:

```typescript
invoke<string>("get_default_workspace").then((root) => {
  setWorkspaceRoot(root);
  invoke("watch_directory", { path: root }).catch(console.error);
});
```

- [ ] **Step 5: Verify file watcher works**

```bash
npm run tauri dev
```

Expected: Create/delete/rename a file from the terminal → file tree updates automatically without manual refresh.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add file system watcher

notify crate watches workspace directory recursively.
fs-change events emitted to frontend, file tree auto-refreshes."
```

---

## Task 7: File Tree Component

**Files:**
- Create: `src/hooks/use-file-system.ts`
- Create: `src/components/FileTreeNode.tsx`
- Create: `src/components/FileTree.tsx`
- Create: `src/store/app-store.ts`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Create app store for workspace root**

Create `src/store/app-store.ts`:

```typescript
import { create } from "zustand";

interface AppStore {
  workspaceRoot: string | null;
  setWorkspaceRoot: (path: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  workspaceRoot: null,
  setWorkspaceRoot: (workspaceRoot) => set({ workspaceRoot }),
}));
```

- [ ] **Step 2: Create file system hook**

Create `src/hooks/use-file-system.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export function useFileSystem() {
  const listDirectory = async (path: string): Promise<DirEntry[]> => {
    return invoke<DirEntry[]>("list_directory", { path });
  };

  const readFile = async (path: string): Promise<string> => {
    return invoke<string>("read_file", { path });
  };

  const writeFile = async (path: string, content: string): Promise<void> => {
    return invoke<void>("write_file", { path, content });
  };

  const renamePath = async (
    oldPath: string,
    newPath: string
  ): Promise<void> => {
    return invoke<void>("rename_path", { oldPath, newPath });
  };

  const deletePath = async (path: string): Promise<void> => {
    return invoke<void>("delete_path", { path });
  };

  const copyPath = async (src: string, dst: string): Promise<void> => {
    return invoke<void>("copy_path", { src, dst });
  };

  return { listDirectory, readFile, writeFile, renamePath, deletePath, copyPath };
}
```

- [ ] **Step 3: Create FileTreeNode component**

Create `src/components/FileTreeNode.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useFileSystem, DirEntry } from "../hooks/use-file-system";

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  onFileClick: (path: string, name: string) => void;
}

export function FileTreeNode({
  entry,
  depth,
  onFileClick,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const { listDirectory } = useFileSystem();

  useEffect(() => {
    if (expanded && entry.is_dir && children.length === 0) {
      listDirectory(entry.path).then(setChildren).catch(console.error);
    }
  }, [expanded, entry.path, entry.is_dir]);

  const toggle = () => {
    if (entry.is_dir) {
      setExpanded(!expanded);
    } else {
      onFileClick(entry.path, entry.name);
    }
  };

  return (
    <>
      <div
        onClick={toggle}
        style={{
          padding: "3px 8px",
          paddingLeft: depth * 16 + 8,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-primary)",
          userSelect: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background =
            "rgba(124, 58, 237, 0.1)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <span style={{ fontSize: 11, width: 14, textAlign: "center" }}>
          {entry.is_dir ? (expanded ? "▼" : "▶") : " "}
        </span>
        <span>{entry.is_dir ? "📁" : "📄"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry.name}
        </span>
      </div>
      {expanded &&
        children.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            onFileClick={onFileClick}
          />
        ))}
    </>
  );
}
```

- [ ] **Step 4: Create FileTree component**

Create `src/components/FileTree.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useFileSystem, DirEntry } from "../hooks/use-file-system";
import { useAppStore } from "../store/app-store";
import { useTabStore, createTerminalTab } from "../store/tab-store";
import { FileTreeNode } from "./FileTreeNode";
import { Tab } from "../types";

export function FileTree() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const { listDirectory } = useFileSystem();
  const { addTab, activeGroupId } = useTabStore();

  useEffect(() => {
    if (workspaceRoot) {
      listDirectory(workspaceRoot).then(setEntries).catch(console.error);
    }
  }, [workspaceRoot]);

  const handleFileClick = (path: string, name: string) => {
    const tab: Tab = {
      id: `editor-${Date.now()}`,
      type: "editor",
      title: name,
      filePath: path,
      isDirty: false,
    };
    addTab(activeGroupId, tab);
  };

  if (!workspaceRoot) {
    return (
      <div style={{ padding: 12, color: "var(--text-muted)" }}>
        No folder open
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto", height: "100%" }}>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onFileClick={handleFileClick}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Update Sidebar to use FileTree and add folder opener**

Update `src/components/Sidebar.tsx` to replace the placeholder with `<FileTree />` and add a Tauri dialog to open folders. Add to App.tsx or AppShell: on mount, set workspaceRoot to the current directory by default or via command-line arg.

Add to `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
fn get_default_workspace() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "/".to_string()))
}
```

Register `get_default_workspace` in the invoke_handler.

In `src/components/AppShell.tsx`, add:

```tsx
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";

// Inside AppShell component:
const setWorkspaceRoot = useAppStore((s) => s.setWorkspaceRoot);

useEffect(() => {
  invoke<string>("get_default_workspace").then(setWorkspaceRoot);
}, []);
```

- [ ] **Step 6: Verify file tree renders**

```bash
npm run tauri dev
```

Expected: Sidebar shows the file tree of the current directory. Clicking folders expands them. Clicking files creates a new editor tab (placeholder content for now).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add file tree with directory browsing

FileTree component with lazy-loading directory expansion.
Click files to open editor tabs. Workspace root from cwd."
```

---

## Task 8: Editor Tab Component (CodeMirror 6)

**Files:**
- Create: `src/components/EditorTab.tsx`
- Modify: `src/components/TabGroup.tsx` (render EditorTab)

- [ ] **Step 1: Create EditorTab component**

Create `src/components/EditorTab.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { useFileSystem } from "../hooks/use-file-system";
import { useTabStore } from "../store/tab-store";

interface EditorTabProps {
  tabId: string;
  groupId: string;
  filePath: string;
  isActive: boolean;
}

function getLanguageExtension(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "rs":
      return rust();
    case "py":
      return python();
    case "html":
      return html();
    case "css":
    case "scss":
      return css();
    case "json":
      return json();
    default:
      return [];
  }
}

export function EditorTab({
  tabId,
  groupId,
  filePath,
  isActive,
}: EditorTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { readFile, writeFile } = useFileSystem();
  const groups = useTabStore((s) => s.groups);

  useEffect(() => {
    if (!containerRef.current) return;

    let view: EditorView;

    readFile(filePath)
      .then((content) => {
        if (!containerRef.current) return;

        const state = EditorState.create({
          doc: content,
          extensions: [
            lineNumbers(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            getLanguageExtension(filePath),
            oneDark,
            EditorView.theme({
              "&": {
                height: "100%",
                background: "var(--bg-primary)",
              },
              ".cm-scroller": {
                fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
                fontSize: "14px",
              },
            }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                // Mark tab as dirty
                const group = groups[groupId];
                if (group) {
                  const tab = group.tabs.find((t) => t.id === tabId);
                  if (tab && !tab.isDirty) {
                    useTabStore.setState((state) => ({
                      groups: {
                        ...state.groups,
                        [groupId]: {
                          ...state.groups[groupId],
                          tabs: state.groups[groupId].tabs.map((t) =>
                            t.id === tabId ? { ...t, isDirty: true } : t
                          ),
                        },
                      },
                    }));
                  }
                }
              }
            }),
          ],
        });

        view = new EditorView({
          state,
          parent: containerRef.current,
        });

        viewRef.current = view;
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });

    return () => {
      view?.destroy();
    };
  }, [filePath]);

  // Save handler (called from keyboard shortcut system)
  useEffect(() => {
    const handleSave = async (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "s" && isActive) {
        e.preventDefault();
        const content = viewRef.current?.state.doc.toString();
        if (content !== undefined) {
          try {
            await writeFile(filePath, content);
            // Mark as not dirty
            useTabStore.setState((state) => ({
              groups: {
                ...state.groups,
                [groupId]: {
                  ...state.groups[groupId],
                  tabs: state.groups[groupId].tabs.map((t) =>
                    t.id === tabId ? { ...t, isDirty: false } : t
                  ),
                },
              },
            }));
          } catch (err) {
            console.error("Failed to save:", err);
          }
        }
      }
    };

    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [filePath, isActive, groupId, tabId, writeFile]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
        }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--error)",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: isActive ? "block" : "none",
      }}
    />
  );
}
```

- [ ] **Step 2: Update TabGroup to render EditorTab**

In `src/components/TabGroup.tsx`, import `EditorTab` and update the tab rendering:

```tsx
import { EditorTab } from "./EditorTab";

// In the tab rendering loop, replace the editor placeholder:
if (tab.type === "editor" && tab.filePath) {
  return (
    <EditorTab
      key={tab.id}
      tabId={tab.id}
      groupId={groupId}
      filePath={tab.filePath}
      isActive={isActive}
    />
  );
}
```

- [ ] **Step 3: Verify editor opens files**

```bash
npm run tauri dev
```

Expected: Click a file in the file tree → editor tab opens with syntax highlighting. Cmd+S saves. Tab title shows "•" when dirty.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add CodeMirror 6 editor tab

Syntax highlighting for JS/TS/Rust/Python/HTML/CSS/JSON.
One Dark theme, Cmd+S to save, dirty indicator in tab."
```

---

## Task 9: Fuzzy File Finder

**Files:**
- Create: `src-tauri/src/search.rs`
- Create: `src-tauri/tests/search_test.rs`
- Create: `src/components/FuzzyFinder.tsx`
- Modify: `src-tauri/src/lib.rs` (register commands)
- Modify: `src/App.tsx` (keyboard shortcut)

- [ ] **Step 1: Write tests for fuzzy search**

Create `src-tauri/tests/search_test.rs`:

```rust
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
    // Empty query returns all files (up to limit)
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test --test search_test 2>&1
```

Expected: Compilation error.

- [ ] **Step 3: Implement search module**

Create `src-tauri/src/search.rs`:

```rust
use serde::Serialize;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub score: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct TextSearchResult {
    pub path: String,
    pub line_number: u32,
    pub line_content: String,
    pub match_start: u32,
    pub match_end: u32,
}

pub fn fuzzy_search(query: &str, root: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
    let mut files: Vec<String> = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target"
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            files.push(entry.path().to_string_lossy().to_string());
        }
    }

    if query.is_empty() {
        return Ok(files
            .into_iter()
            .take(limit)
            .map(|path| {
                let name = Path::new(&path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                SearchResult {
                    path,
                    name,
                    score: 0,
                }
            })
            .collect());
    }

    // Simple fuzzy matching: check if all query chars appear in order in the filename
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResult> = files
        .into_iter()
        .filter_map(|path| {
            let name = Path::new(&path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let name_lower = name.to_lowercase();

            // Check subsequence match
            let mut qi = 0;
            let query_chars: Vec<char> = query_lower.chars().collect();
            let mut score: u32 = 0;

            for (i, c) in name_lower.chars().enumerate() {
                if qi < query_chars.len() && c == query_chars[qi] {
                    // Bonus for consecutive matches and start-of-word matches
                    if qi > 0 && i > 0 {
                        score += 10;
                    }
                    if i == 0 || name.as_bytes().get(i - 1) == Some(&b'_')
                        || name.as_bytes().get(i - 1) == Some(&b'-')
                        || name.as_bytes().get(i - 1) == Some(&b'.')
                    {
                        score += 20;
                    }
                    qi += 1;
                    score += 10;
                }
            }

            if qi == query_chars.len() {
                Some(SearchResult { path, name, score })
            } else {
                None
            }
        })
        .collect();

    results.sort_by(|a, b| b.score.cmp(&a.score));
    results.truncate(limit);
    Ok(results)
}

pub fn text_search(
    query: &str,
    root: &str,
    limit: usize,
) -> Result<Vec<TextSearchResult>, String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target"
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() || results.len() >= limit {
            continue;
        }

        // Skip binary files (heuristic: check first 512 bytes)
        let path = entry.path();
        if let Ok(content) = std::fs::read_to_string(path) {
            for (line_num, line) in content.lines().enumerate() {
                if results.len() >= limit {
                    break;
                }
                let line_lower = line.to_lowercase();
                if let Some(pos) = line_lower.find(&query_lower) {
                    results.push(TextSearchResult {
                        path: path.to_string_lossy().to_string(),
                        line_number: (line_num + 1) as u32,
                        line_content: line.to_string(),
                        match_start: pos as u32,
                        match_end: (pos + query.len()) as u32,
                    });
                }
            }
        }
    }

    Ok(results)
}
```

Note: Add `walkdir = "2"` to `src-tauri/Cargo.toml` dependencies.

- [ ] **Step 4: Register search commands in lib.rs**

Add `pub mod search;` and the Tauri commands:

```rust
#[tauri::command]
fn fuzzy_search(query: String, workspace_root: String, limit: usize) -> Result<Vec<search::SearchResult>, String> {
    search::fuzzy_search(&query, &workspace_root, limit)
}

#[tauri::command]
fn text_search(query: String, workspace_root: String, limit: usize) -> Result<Vec<search::TextSearchResult>, String> {
    search::text_search(&query, &workspace_root, limit)
}
```

Register `fuzzy_search` and `text_search` in the invoke_handler.

- [ ] **Step 5: Run tests**

```bash
cd src-tauri && cargo test --test search_test 2>&1
```

Expected: All 3 tests pass.

- [ ] **Step 6: Create FuzzyFinder component**

Create `src/components/FuzzyFinder.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { useTabStore } from "../store/tab-store";
import { Tab } from "../types";

interface SearchResult {
  path: string;
  name: string;
  score: number;
}

interface FuzzyFinderProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FuzzyFinder({ isOpen, onClose }: FuzzyFinderProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const { addTab, activeGroupId } = useTabStore();

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !workspaceRoot) return;

    const timer = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult[]>("fuzzy_search", {
          query,
          workspaceRoot,
          limit: 20,
        });
        setResults(res);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [query, isOpen, workspaceRoot]);

  const openFile = useCallback(
    (result: SearchResult) => {
      const tab: Tab = {
        id: `editor-${Date.now()}`,
        type: "editor",
        title: result.name,
        filePath: result.path,
        isDirty: false,
      };
      addTab(activeGroupId, tab);
      onClose();
    },
    [addTab, activeGroupId, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          openFile(results[selectedIndex]);
        }
        break;
      case "Escape":
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxHeight: 400,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files..."
          style={{
            width: "100%",
            padding: "12px 16px",
            border: "none",
            borderBottom: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            fontFamily: "'SF Mono', monospace",
          }}
        />
        <div style={{ maxHeight: 340, overflow: "auto" }}>
          {results.map((result, i) => (
            <div
              key={result.path}
              onClick={() => openFile(result)}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                background:
                  i === selectedIndex
                    ? "rgba(124, 58, 237, 0.2)"
                    : "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ color: "var(--text-primary)", fontSize: 13 }}>
                {result.name}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {result.path}
              </span>
            </div>
          ))}
          {results.length === 0 && query && (
            <div
              style={{
                padding: 16,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              No files found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add Cmd+P shortcut in App.tsx**

Update `src/App.tsx`:

```tsx
import { useState, useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { FuzzyFinder } from "./components/FuzzyFinder";
import { useSidebarStore } from "./store/sidebar-store";
import "./styles/globals.css";

function App() {
  const [fuzzyFinderOpen, setFuzzyFinderOpen] = useState(false);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "p") {
        e.preventDefault();
        setFuzzyFinderOpen((o) => !o);
      }
      if (e.metaKey && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <>
      <AppShell />
      <FuzzyFinder
        isOpen={fuzzyFinderOpen}
        onClose={() => setFuzzyFinderOpen(false)}
      />
    </>
  );
}

export default App;
```

- [ ] **Step 8: Verify fuzzy finder works**

```bash
npm run tauri dev
```

Expected: Cmd+P opens fuzzy finder overlay. Type to search files. Arrow keys to navigate, Enter to open, Escape to close. Cmd+B toggles sidebar.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add fuzzy file finder and search backend

Rust fuzzy search with subsequence matching and scoring.
Full-text search across files. FuzzyFinder overlay with Cmd+P.
Cmd+B toggles sidebar."
```

---

## Task 10: Full-Text Search Panel

**Files:**
- Create: `src/components/SearchPanel.tsx`
- Modify: `src/components/Sidebar.tsx` (add panel switching)
- Modify: `src/App.tsx` (Cmd+Shift+F shortcut)

- [ ] **Step 1: Create SearchPanel component**

Create `src/components/SearchPanel.tsx`:

```tsx
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { useTabStore } from "../store/tab-store";
import { Tab } from "../types";

interface TextSearchResult {
  path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
}

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TextSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const { addTab, activeGroupId } = useTabStore();

  const doSearch = useCallback(async () => {
    if (!query.trim() || !workspaceRoot) return;
    setSearching(true);
    try {
      const res = await invoke<TextSearchResult[]>("text_search", {
        query: query.trim(),
        workspaceRoot,
        limit: 200,
      });
      setResults(res);
    } catch (err) {
      console.error("Search error:", err);
    }
    setSearching(false);
  }, [query, workspaceRoot]);

  const openResult = (result: TextSearchResult) => {
    const name = result.path.split("/").pop() || result.path;
    const tab: Tab = {
      id: `editor-${Date.now()}`,
      type: "editor",
      title: name,
      filePath: result.path,
      isDirty: false,
    };
    addTab(activeGroupId, tab);
  };

  // Group results by file
  const grouped = results.reduce<Record<string, TextSearchResult[]>>(
    (acc, r) => {
      if (!acc[r.path]) acc[r.path] = [];
      acc[r.path].push(r);
      return acc;
    },
    {}
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="Search in files..."
          style={{
            width: "100%",
            padding: "6px 8px",
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 12,
            outline: "none",
            fontFamily: "'SF Mono', monospace",
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto", fontSize: 12 }}>
        {searching && (
          <div style={{ padding: 12, color: "var(--text-muted)" }}>
            Searching...
          </div>
        )}
        {Object.entries(grouped).map(([path, matches]) => (
          <div key={path}>
            <div
              style={{
                padding: "6px 8px",
                color: "var(--text-secondary)",
                fontSize: 11,
                background: "var(--bg-tertiary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {path.split("/").pop()} ({matches.length})
            </div>
            {matches.map((m, i) => (
              <div
                key={`${m.line_number}-${i}`}
                onClick={() => openResult(m)}
                style={{
                  padding: "4px 8px 4px 16px",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "rgba(124, 58, 237, 0.1)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "transparent")
                }
              >
                <span style={{ color: "var(--text-muted)", marginRight: 8 }}>
                  {m.line_number}:
                </span>
                {m.line_content.trim()}
              </div>
            ))}
          </div>
        ))}
        {!searching && results.length === 0 && query && (
          <div
            style={{
              padding: 12,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            No results
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update Sidebar with panel tabs**

In `src/components/Sidebar.tsx`, add tab buttons for "Files" and "Search" at the top, and render either `<FileTree />` or `<SearchPanel />` based on `activePanel` from `useSidebarStore`.

- [ ] **Step 3: Add Cmd+Shift+F shortcut in App.tsx**

Add to the keydown handler in `App.tsx`:

```typescript
if (e.metaKey && e.shiftKey && e.key === "f") {
  e.preventDefault();
  const sidebar = useSidebarStore.getState();
  if (!sidebar.visible) sidebar.toggle();
  sidebar.setActivePanel("search");
}
```

- [ ] **Step 4: Verify search works**

```bash
npm run tauri dev
```

Expected: Cmd+Shift+F opens sidebar to search panel. Type query, press Enter. Results grouped by file. Click result to open in editor tab.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add full-text search panel

SearchPanel with results grouped by file. Cmd+Shift+F shortcut.
Sidebar switches between file tree and search panel."
```

---

## Task 11: File Operations (Context Menu)

**Files:**
- Create: `src/components/ContextMenu.tsx`
- Modify: `src/components/FileTreeNode.tsx` (right-click handler)

- [ ] **Step 1: Create ContextMenu component**

Create `src/components/ContextMenu.tsx`:

```tsx
import { useEffect, useRef } from "react";

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 2000,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        padding: "4px 0",
        minWidth: 160,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          style={{
            padding: "6px 16px",
            cursor: "pointer",
            fontSize: 13,
            color: item.danger ? "var(--error)" : "var(--text-primary)",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background =
              "rgba(124, 58, 237, 0.15)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "transparent")
          }
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add right-click context menu to FileTreeNode**

Update `src/components/FileTreeNode.tsx` to handle `onContextMenu` events. Show context menu with: Rename, Copy, Delete (and Move To for a future version). Wire up each action to the file system hook.

For rename, show an inline text input that replaces the filename. For delete, confirm with a dialog. For copy, prompt for destination name.

- [ ] **Step 3: Verify context menu works**

```bash
npm run tauri dev
```

Expected: Right-click a file → context menu appears. Rename changes the filename. Delete removes the file. File tree refreshes automatically.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add file operations via context menu

Right-click context menu on file tree nodes. Rename, copy, delete
with confirmation. File tree refreshes after operations."
```

---

## Task 12: New Terminal Tab Shortcut & Tab Management

**Files:**
- Modify: `src/App.tsx` (add Cmd+T, Cmd+W, Cmd+\, Cmd+N shortcuts)

- [ ] **Step 1: Add keyboard shortcuts**

Update the keydown handler in `src/App.tsx` to support:

```typescript
// Cmd+T: new terminal tab
if (e.metaKey && e.key === "t") {
  e.preventDefault();
  const { addTab, activeGroupId } = useTabStore.getState();
  addTab(activeGroupId, createTerminalTab());
}

// Cmd+W: close current tab
if (e.metaKey && e.key === "w") {
  e.preventDefault();
  const { groups, activeGroupId, removeTab } = useTabStore.getState();
  const group = groups[activeGroupId];
  if (group) removeTab(activeGroupId, group.activeTabId);
}

// Cmd+\: split vertical
if (e.metaKey && e.key === "\\") {
  e.preventDefault();
  const { activeGroupId, splitGroup } = useTabStore.getState();
  splitGroup(
    activeGroupId,
    e.shiftKey ? "horizontal" : "vertical",
    createTerminalTab()
  );
}

// Cmd+1/2/3: focus tab group
if (e.metaKey && e.key >= "1" && e.key <= "9") {
  e.preventDefault();
  const { groups, setActiveGroupId } = useTabStore.getState();
  const groupIds = Object.keys(groups);
  const index = parseInt(e.key) - 1;
  if (groupIds[index]) setActiveGroupId(groupIds[index]);
}
```

- [ ] **Step 2: Verify shortcuts work**

```bash
npm run tauri dev
```

Expected: Cmd+T creates new terminal tab. Cmd+W closes current tab. Cmd+\ splits vertically (Cmd+Shift+\ horizontally). Cmd+1/2/3 focuses tab groups.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add keyboard shortcuts for tab management

Cmd+T new terminal, Cmd+W close tab, Cmd+\\ split vertical,
Cmd+Shift+\\ split horizontal, Cmd+1/2/3 focus groups."
```

---

## Task 13: Toast Notifications & Error Handling

**Files:**
- Create: `src/components/Toast.tsx`
- Create: `src/store/toast-store.ts`
- Modify: various components to use toast for error feedback

- [ ] **Step 1: Create toast store**

Create `src/store/toast-store.ts`:

```typescript
import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type: Toast["type"]) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type) => {
    const id = `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
```

- [ ] **Step 2: Create Toast component**

Create `src/components/Toast.tsx`:

```tsx
import { useToastStore } from "../store/toast-store";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 3000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            background:
              toast.type === "error"
                ? "var(--error)"
                : toast.type === "success"
                  ? "var(--success)"
                  : "var(--accent)",
            color: "white",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            cursor: "pointer",
            maxWidth: 360,
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add ToastContainer to App.tsx and wire up error handling**

Add `<ToastContainer />` to `App.tsx`. Update `EditorTab` save errors, `FileTree` operation errors, and `SearchPanel` errors to call `useToastStore.getState().addToast(message, "error")`.

- [ ] **Step 4: Verify toasts work**

```bash
npm run tauri dev
```

Expected: Errors show as toast notifications in the bottom-right corner. They auto-dismiss after 4 seconds. Click to dismiss early.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add toast notification system

Toast store with auto-dismiss. Error handling for file operations,
editor save, and search wired to toast notifications."
```

---

## Task 13b: Configuration System

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs` (register config commands)
- Modify: `src/App.tsx` (load config on startup)

- [ ] **Step 1: Implement config module**

Create `src-tauri/src/config.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default = "default_sidebar_position")]
    pub sidebar_position: String,
    #[serde(default = "default_sidebar_visible")]
    pub sidebar_visible: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u16,
    #[serde(default = "default_font_family")]
    pub font_family: String,
}

fn default_sidebar_position() -> String { "left".into() }
fn default_sidebar_visible() -> bool { true }
fn default_font_size() -> u16 { 14 }
fn default_font_family() -> String { "SF Mono, Menlo, Monaco, monospace".into() }

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            sidebar_position: default_sidebar_position(),
            sidebar_visible: default_sidebar_visible(),
            font_size: default_font_size(),
            font_family: default_font_family(),
        }
    }
}

fn config_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("vibe-editor");
    fs::create_dir_all(&dir).ok();
    dir.join("config.toml")
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(content) => toml::from_str(&content).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let content = toml::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write config: {}", e))
}
```

- [ ] **Step 2: Register config commands**

In `src-tauri/src/lib.rs`:

```rust
pub mod config;

#[tauri::command]
fn load_config() -> config::AppConfig {
    config::load_config()
}

#[tauri::command]
fn save_config(config: config::AppConfig) -> Result<(), String> {
    config::save_config(&config)
}
```

Register `load_config` and `save_config` in the invoke_handler.

- [ ] **Step 3: Load config on startup in App.tsx**

In `src/App.tsx`, on mount call `invoke("load_config")` and apply sidebar position/visibility to `useSidebarStore`.

- [ ] **Step 4: Verify config persists**

```bash
npm run tauri dev
```

Expected: Toggle sidebar, restart app → sidebar state persists. Config file created at `~/Library/Application Support/vibe-editor/config.toml`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add configuration system

TOML config file at ~/Library/Application Support/vibe-editor/.
Persists sidebar position, visibility, font size, font family."
```

---

## Task 14: Final Polish & Verification

- [ ] **Step 1: Run full build**

```bash
npm run tauri build 2>&1
```

Expected: Builds successfully. DMG/app produced in `src-tauri/target/release/bundle/`.

- [ ] **Step 2: Test the production build**

Open the built app. Verify:
- Terminal works (type commands, see output)
- File tree shows files
- Click file → opens in editor
- Cmd+S saves
- Cmd+P fuzzy finder works
- Cmd+Shift+F search works
- Cmd+T new terminal
- Cmd+W close tab
- Cmd+\ split
- Cmd+B toggle sidebar
- Right-click file → context menu
- Error toasts appear for invalid operations

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final build verification for v0.1 MVP"
```
