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
    // Generate ID client-side so we can set up listeners BEFORE spawning.
    // This prevents the race where PTY output arrives before the listener exists.
    const id = crypto.randomUUID();
    ptyIdRef.current = id;

    unlistenOutputRef.current = await listen<string>(
      `pty-output-${id}`,
      (event) => onData(event.payload)
    );
    unlistenExitRef.current = await listen<void>(
      `pty-exit-${id}`,
      () => onExit()
    );

    await invoke("spawn_pty", { id, cols, rows, cwd });

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
    return () => { kill(); };
  }, [kill]);

  return { spawn, write, resize, kill, ptyIdRef };
}
