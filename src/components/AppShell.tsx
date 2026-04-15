import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGitStore } from "../store/git-store";
import { Sidebar } from "./Sidebar";
import { TabGroupManager } from "./TabGroupManager";
import { TitleBar } from "./TitleBar";
import { useSidebarStore } from "../store/sidebar-store";
import { useAppStore } from "../store/app-store";

export function openProject(path: string) {
  const { setWorkspaceRoot, setRecentProjects } = useAppStore.getState();
  invoke("unwatch_directory").catch(() => {});
  setWorkspaceRoot(path);
  invoke("watch_directory", { path }).catch(console.error);
  invoke<string[]>("cmd_add_recent_project", { path })
    .then(setRecentProjects)
    .catch(console.error);
}

export function AppShell({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { position } = useSidebarStore();
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const prevRootRef = useRef<string | null>(null);

  useEffect(() => {
    if (workspaceRoot && workspaceRoot !== prevRootRef.current) {
      prevRootRef.current = workspaceRoot;
      openProject(workspaceRoot);
      useGitStore.getState().refreshStatus();
    }
  }, [workspaceRoot]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const unlisten = listen("fs-change", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        useGitStore.getState().refreshStatus();
      }, 300);
    });

    return () => {
      clearTimeout(debounceTimer);
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <TitleBar onOpenSettings={onOpenSettings} />
      <div
        style={{
          display: "flex",
          flexDirection: position === "left" ? "row" : "row-reverse",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <TabGroupManager />
        </div>
      </div>
    </div>
  );
}
