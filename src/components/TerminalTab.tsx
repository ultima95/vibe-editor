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

    const dims = fitAddon.proposeDimensions();
    spawn().then(() => {
      if (dims) {
        resize(dims.cols, dims.rows);
      }
    });

    return () => { terminal.dispose(); };
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
