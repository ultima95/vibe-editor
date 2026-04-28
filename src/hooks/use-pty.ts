import { useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SpawnOptions {
  cols: number;
  rows: number;
  cwd?: string;
  onData: (data: string) => void;
  onExit: () => void;
}

export interface SpawnResult {
  id: string;
  cleanup: () => Promise<void>;
}

export function usePty() {
  const ptyIdRef = useRef<string | null>(null);
  const spawnGenRef = useRef(0);

  const spawn = useCallback(async (opts: SpawnOptions): Promise<SpawnResult> => {
    const { cols, rows, cwd, onData, onExit } = opts;
    const id = crypto.randomUUID();
    const gen = ++spawnGenRef.current;

    const unlistenOutput = await listen<string>(
      `pty-output-${id}`,
      (event) => onData(event.payload)
    );
    const unlistenExit = await listen<void>(
      `pty-exit-${id}`,
      () => onExit()
    );

    try {
      await invoke("spawn_pty", { id, cols, rows, cwd });
    } catch (err) {
      unlistenOutput();
      unlistenExit();
      throw err;
    }

    // Only claim ownership if no newer spawn has started
    if (spawnGenRef.current === gen) {
      ptyIdRef.current = id;
    }

    const cleanup = async () => {
      unlistenOutput();
      unlistenExit();
      await invoke("kill_pty", { id }).catch(() => {});
      if (ptyIdRef.current === id) {
        ptyIdRef.current = null;
      }
    };

    return { id, cleanup };
  }, []);

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

  return { spawn, write, resize, ptyIdRef };
}
