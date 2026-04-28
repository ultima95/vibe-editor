import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { usePty } from "../hooks/use-pty";
import { useSettingsStore } from "../store/settings-store";
import { useTabStore, focusExistingTab } from "../store/tab-store";
import { useAppStore } from "../store/app-store";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ITheme } from "@xterm/xterm";
import { Tab } from "../types";
import "@xterm/xterm/css/xterm.css";

interface TerminalPalette {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

const terminalPalettes: Record<string, TerminalPalette> = {
  "one-dark": {
    background: "#282c34",
    foreground: "#abb2bf",
    cursor: "#528bff",
    selectionBackground: "#3e4451",
    black: "#282c34",
    red: "#e06c75",
    green: "#98c379",
    yellow: "#e5c07b",
    blue: "#61afef",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    white: "#abb2bf",
    brightBlack: "#5c6370",
    brightRed: "#e06c75",
    brightGreen: "#98c379",
    brightYellow: "#e5c07b",
    brightBlue: "#61afef",
    brightMagenta: "#c678dd",
    brightCyan: "#56b6c2",
    brightWhite: "#ffffff",
  },
  abyss: {
    background: "#000c18",
    foreground: "#6688cc",
    cursor: "#ddbb88",
    selectionBackground: "#770811",
    black: "#000000",
    red: "#ff9da4",
    green: "#d1f1a9",
    yellow: "#ffeead",
    blue: "#6796e6",
    magenta: "#b898e6",
    cyan: "#a1efd3",
    white: "#bbdbfe",
    brightBlack: "#384d68",
    brightRed: "#ff7882",
    brightGreen: "#b5e48c",
    brightYellow: "#ffe585",
    brightBlue: "#82aaff",
    brightMagenta: "#c4a7e7",
    brightCyan: "#7ee7b0",
    brightWhite: "#d4e5ff",
  },
  "github-dark": {
    background: "#0d1117",
    foreground: "#c9d1d9",
    cursor: "#58a6ff",
    selectionBackground: "#264f78",
    black: "#484f58",
    red: "#ff7b72",
    green: "#3fb950",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#f0f6fc",
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    selectionBackground: "#44475a",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  monokai: {
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f8f8f0",
    selectionBackground: "#49483e",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
    brightBlack: "#75715e",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#f4bf75",
    brightBlue: "#66d9ef",
    brightMagenta: "#ae81ff",
    brightCyan: "#a1efe4",
    brightWhite: "#f9f8f5",
  },
  "github-light": {
    background: "#ffffff",
    foreground: "#24292e",
    cursor: "#044289",
    selectionBackground: "#c8c8fa",
    black: "#24292e",
    red: "#d73a49",
    green: "#22863a",
    yellow: "#b08800",
    blue: "#0366d6",
    magenta: "#6f42c1",
    cyan: "#1b7c83",
    white: "#6a737d",
    brightBlack: "#959da5",
    brightRed: "#cb2431",
    brightGreen: "#28a745",
    brightYellow: "#dbab09",
    brightBlue: "#2188ff",
    brightMagenta: "#8a63d2",
    brightCyan: "#3192aa",
    brightWhite: "#d1d5da",
  },
};

function getTerminalTheme(uiThemeId: string, opacity = 1): ITheme {
  const palette = terminalPalettes[uiThemeId] ?? terminalPalettes["one-dark"];
  return {
    ...palette,
    background: opacity < 1 ? "transparent" : palette.background,
  };
}

interface TerminalTabProps {
  tabId?: string;
  cwd?: string;
  isActive: boolean;
}

// Detect file paths in terminal output: absolute paths, ~/paths, and URLs
// Require at least one directory separator after the leading / or ~/ to avoid matching "1/5", "on/off" etc.
const TERM_PATH_RE = /(?:~\/[^\s"'`)<>\]},;:\x1b\x00-\x1f]+|\/[a-zA-Z0-9_.][^\s"'`)<>\]},;:\x1b\x00-\x1f]*\/[^\s"'`)<>\]},;:\x1b\x00-\x1f]+)/;
const TERM_URL_RE = /https?:\/\/[^\s"'`)<>\]},;\x1b\x00-\x1f]+/;

function openFileInEditor(filePath: string) {
  // Expand ~ to home dir (supports macOS /Users and Linux /home)
  let resolved = filePath;
  if (resolved.startsWith("~/")) {
    const root = useAppStore.getState().workspaceRoot ?? "";
    const homeMatch = root.match(/^(\/(?:Users|home)\/[^/]+)/);
    if (homeMatch) {
      resolved = homeMatch[1] + resolved.slice(1);
    }
  }

  // Check if already open
  if (focusExistingTab(resolved)) return;

  const fileName = resolved.split("/").pop() || resolved;
  const tab: Tab = {
    id: `editor-${Date.now()}`,
    type: "editor",
    title: fileName,
    filePath: resolved,
    isDirty: false,
  };
  const { addTab, activeGroupId } = useTabStore.getState();
  addTab(activeGroupId, tab);
}

// Terminal instance registry to preserve terminals across React remounts
const terminalRegistry = new Map<string, {
  terminal: Terminal;
  fitAddon: FitAddon;
  ptyCleanup: (() => Promise<void>) | null;
  container: HTMLDivElement;
  cwd?: string;
}>();

export function TerminalTab({ tabId, cwd, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { spawn, write, resize } = usePty();

  useEffect(() => {
    if (!containerRef.current) return;

    const registryKey = tabId ?? "";

    // Check registry for existing terminal (survives React remounts from layout changes)
    const cached = registryKey ? terminalRegistry.get(registryKey) : null;
    if (cached && cached.cwd === cwd) {
      // Reattach existing terminal to new container
      containerRef.current.appendChild(cached.container);
      terminalRef.current = cached.terminal;
      fitAddonRef.current = cached.fitAddon;
      // Refit after reattach
      requestAnimationFrame(() => {
        cached.fitAddon.fit();
        const dims = cached.fitAddon.proposeDimensions();
        if (dims) resize(dims.cols, dims.rows);
      });
      return () => {
        // Detach DOM but keep terminal alive in registry
        if (cached.container.parentElement === containerRef.current) {
          containerRef.current?.removeChild(cached.container);
        }
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    }

    // cwd changed — clean up stale cached terminal before spawning a new one
    if (cached) {
      terminalRegistry.delete(registryKey);
      cached.terminal.dispose();
      cached.ptyCleanup?.().catch(console.error);
    }

    let cancelled = false;
    let ptyCleanup: (() => Promise<void>) | null = null;

    const { colorTheme, appOpacity } = useSettingsStore.getState();

    // Create a wrapper div so we can detach/reattach the terminal DOM
    const termContainer = document.createElement("div");
    termContainer.style.width = "100%";
    termContainer.style.height = "100%";
    containerRef.current.appendChild(termContainer);

    const terminal = new Terminal({
      fontSize: 14,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
      theme: getTerminalTheme(colorTheme, appOpacity),
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(termContainer);

    // Load WebGL addon for better rendering (skip when transparent - WebGL canvas blocks transparency)
    if (appOpacity >= 1) {
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        terminal.loadAddon(webglAddon);
      } catch {
        // WebGL not available, fall back to canvas renderer
      }
    }

    fitAddon.fit();

    // CMD+click to open file paths / URLs in terminal output
    termContainer.addEventListener("mousedown", (e: MouseEvent) => {
      if (!e.metaKey) return;

      const buffer = terminal.buffer.active;

      // Calculate cell position from mouse coordinates using public APIs
      const rect = termContainer.getBoundingClientRect();
      if (terminal.cols === 0 || terminal.rows === 0) return;
      const cellWidth = rect.width / terminal.cols;
      const cellHeight = rect.height / terminal.rows;
      const col = Math.floor((e.clientX - rect.left) / cellWidth);
      const row = Math.floor((e.clientY - rect.top) / cellHeight);

      // Get the full line text
      const line = buffer.getLine(row + buffer.viewportY);
      if (!line) return;

      let lineText = "";
      for (let i = 0; i < line.length; i++) {
        lineText += line.getCell(i)?.getChars() || " ";
      }
      lineText = lineText.trimEnd();

      // Find URL or file path at click position

      // Check URLs first
      let match: RegExpExecArray | null;
      const urlRe = new RegExp(TERM_URL_RE.source, "g");
      while ((match = urlRe.exec(lineText)) !== null) {
        if (col >= match.index && col <= match.index + match[0].length) {
          e.preventDefault();
          e.stopPropagation();
          openUrl(match[0]).catch(console.error);
          return;
        }
      }

      // Check file paths
      const pathRe = new RegExp(TERM_PATH_RE.source, "g");
      while ((match = pathRe.exec(lineText)) !== null) {
        if (col >= match.index && col <= match.index + match[0].length) {
          e.preventDefault();
          e.stopPropagation();
          openFileInEditor(match[0]);
          return;
        }
      }
    });

    // Shift+Enter sends newline instead of carriage return
    terminal.attachCustomKeyEventHandler((ev) => {
      if (ev.type === "keydown" && ev.key === "Enter" && ev.shiftKey) {
        ev.preventDefault();
        write("\n");
        return false;
      }
      return true;
    });

    terminal.onData((data) => write(data));

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const dims = fitAddon.proposeDimensions();
    spawn({
      cols: dims?.cols ?? 80,
      rows: dims?.rows ?? 24,
      cwd,
      onData: (data) => terminal.write(data),
      onExit: () => {
        terminal.write("\r\n[Process exited]\r\n");
        // Clean up registry on exit
        if (registryKey) terminalRegistry.delete(registryKey);
      },
    }).then(({ cleanup }) => {
      if (cancelled) {
        cleanup();
        return;
      }
      ptyCleanup = cleanup;
      if (dims) resize(dims.cols, dims.rows);

      // Store in registry
      if (registryKey) {
        terminalRegistry.set(registryKey, {
          terminal,
          fitAddon,
          ptyCleanup: cleanup,
          container: termContainer,
          cwd,
        });
      }
    }).catch((err) => {
      if (!cancelled) {
        console.error("Failed to spawn PTY:", err);
        terminal.write(`\r\n\x1b[31mFailed to spawn terminal: ${err}\x1b[0m\r\n`);
      }
    });

    return () => {
      cancelled = true;
      // If in registry, just detach DOM (don't destroy)
      if (registryKey && terminalRegistry.has(registryKey)) {
        if (termContainer.parentElement === containerRef.current) {
          containerRef.current?.removeChild(termContainer);
        }
        terminalRef.current = null;
        fitAddonRef.current = null;
        // Schedule cleanup if tab was actually removed (not just layout change)
        requestAnimationFrame(() => {
          setTimeout(() => {
            const state = useTabStore.getState();
            const stillExists = Object.values(state.groups).some(
              (g) => g.tabs.some((t) => t.id === registryKey)
            );
            if (!stillExists) {
              const entry = terminalRegistry.get(registryKey);
              if (entry) {
                terminalRegistry.delete(registryKey);
                entry.terminal.dispose();
                entry.ptyCleanup?.().catch(console.error);
              }
            }
          }, 100);
        });
        return;
      }
      // Not in registry - full cleanup
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      ptyCleanup?.().catch((err) =>
        console.error("PTY cleanup failed:", err)
      );
    };
  }, [tabId, spawn, write, resize, cwd]);

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

  // Subscribe to theme and opacity changes for live update
  useEffect(() => {
    let prevTheme = useSettingsStore.getState().colorTheme;
    let prevOpacity = useSettingsStore.getState().appOpacity;
    const unsub = useSettingsStore.subscribe((state) => {
      const themeChanged = state.colorTheme !== prevTheme;
      const opacityChanged = state.appOpacity !== prevOpacity;
      if (themeChanged || opacityChanged) {
        prevTheme = state.colorTheme;
        prevOpacity = state.appOpacity;
        if (terminalRef.current) {
          terminalRef.current.options.theme = getTerminalTheme(state.colorTheme, state.appOpacity);
        }
        if (containerRef.current) {
          containerRef.current.classList.toggle("xterm-transparent", state.appOpacity < 1);
          containerRef.current.style.backgroundColor =
            state.appOpacity < 1 ? "transparent" : getTerminalTheme(state.colorTheme).background!;
        }
      }
    });
    return () => unsub();
  }, []);

  const initOpacity = useSettingsStore.getState().appOpacity;
  const initTransparent = initOpacity < 1;

  return (
    <div
      ref={containerRef}
      className={initTransparent ? "xterm-transparent" : undefined}
      style={{
        width: "100%",
        height: "100%",
        display: isActive ? "block" : "none",
        backgroundColor: initTransparent
          ? "transparent"
          : getTerminalTheme(useSettingsStore.getState().colorTheme).background,
      }}
    />
  );
}
