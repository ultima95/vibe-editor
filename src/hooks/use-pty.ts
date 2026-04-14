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
  const spawnPromiseRef = useRef<Promise<string> | null>(null);

  const spawn = useCallback(() => {
    const id = crypto.randomUUID();

    // Store the full spawn pipeline as a promise so kill() can await it.
    const promise = (async () => {
      // Set up listeners BEFORE spawning so we never miss the initial prompt.
      unlistenOutputRef.current = await listen<string>(
        `pty-output-${id}`,
        (event) => onData(event.payload)
      );
      unlistenExitRef.current = await listen<void>(
        `pty-exit-${id}`,
        () => onExit()
      );

      await invoke("spawn_pty", { id, cols, rows, cwd });

      // Only expose the ID after the Rust side confirms the PTY exists.
      ptyIdRef.current = id;
      return id;
    })();

    spawnPromiseRef.current = promise;
    return promise;
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
    // Wait for any in-flight spawn to finish so we can clean it up.
    if (spawnPromiseRef.current) {
      try { await spawnPromiseRef.current; } catch { /* spawn failed, nothing to kill */ }
      spawnPromiseRef.current = null;
    }
    if (ptyIdRef.current) {
      unlistenOutputRef.current?.();
      unlistenExitRef.current?.();
      await invoke("kill_pty", { id: ptyIdRef.current }).catch(() => {});
      ptyIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { kill(); };
  }, [kill]);

  return { spawn, write, resize, kill, ptyIdRef };
}
