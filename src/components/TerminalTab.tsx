import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { usePty } from "../hooks/use-pty";
import { useSettingsStore, themes } from "../store/settings-store";
import type { ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

function getTerminalTheme(uiThemeId: string): ITheme {
  const theme = themes.find((t) => t.id === uiThemeId) ?? themes[0];
  const c = theme.colors;
  return {
    background: c.bgPrimary,
    foreground: c.textPrimary,
    cursor: c.accent,
    selectionBackground: c.accent + "44",
    black: c.bgPrimary,
    red: c.error,
    green: c.success,
    yellow: c.warning,
    blue: c.accent,
    magenta: c.gitConflicted,
    cyan: c.gitAdded,
    white: c.textPrimary,
    brightBlack: c.textMuted,
    brightRed: c.gitDeleted,
    brightGreen: c.gitAdded,
    brightYellow: c.gitModified,
    brightBlue: c.accentHover,
    brightMagenta: c.gitConflicted,
    brightCyan: c.success,
    brightWhite: c.textPrimary,
  };
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
      }}
    />
  );
}
