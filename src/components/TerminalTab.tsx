import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { usePty } from "../hooks/use-pty";
import { useSettingsStore } from "../store/settings-store";
import type { ITheme } from "@xterm/xterm";
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

function getTerminalTheme(uiThemeId: string): ITheme {
  return terminalPalettes[uiThemeId] ?? terminalPalettes["one-dark"];
}

interface TerminalTabProps {
  cwd?: string;
  isActive: boolean;
}

export function TerminalTab({ cwd, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { spawn, write, resize } = usePty();

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let ptyCleanup: (() => Promise<void>) | null = null;

    const terminal = new Terminal({
      fontSize: 14,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
      theme: getTerminalTheme(useSettingsStore.getState().colorTheme),
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

    const dims = fitAddon.proposeDimensions();
    spawn({
      cols: dims?.cols ?? 80,
      rows: dims?.rows ?? 24,
      cwd,
      onData: (data) => terminal.write(data),
      onExit: () => terminal.write("\r\n[Process exited]\r\n"),
    }).then(({ cleanup }) => {
      if (cancelled) {
        cleanup();
        return;
      }
      ptyCleanup = cleanup;
      if (dims) resize(dims.cols, dims.rows);
    }).catch((err) => {
      if (!cancelled) {
        console.error("Failed to spawn PTY:", err);
        terminal.write(`\r\n\x1b[31mFailed to spawn terminal: ${err}\x1b[0m\r\n`);
      }
    });

    return () => {
      cancelled = true;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      ptyCleanup?.();
    };
  }, [spawn, write, resize, cwd]);

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

  // Subscribe to theme changes for live update
  useEffect(() => {
    let prev = useSettingsStore.getState().colorTheme;
    const unsub = useSettingsStore.subscribe((state) => {
      if (state.colorTheme !== prev) {
        prev = state.colorTheme;
        if (terminalRef.current) {
          terminalRef.current.options.theme = getTerminalTheme(state.colorTheme);
        }
        if (containerRef.current) {
          containerRef.current.style.backgroundColor = getTerminalTheme(state.colorTheme).background!;
        }
      }
    });
    return () => unsub();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: isActive ? "block" : "none",
        backgroundColor: getTerminalTheme(useSettingsStore.getState().colorTheme).background,
      }}
    />
  );
}
