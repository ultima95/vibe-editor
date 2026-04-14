import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./Sidebar";
import { TabGroupManager } from "./TabGroupManager";
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

export function AppShell() {
  const { position } = useSidebarStore();
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const prevRootRef = useRef<string | null>(null);

  useEffect(() => {
    if (workspaceRoot && workspaceRoot !== prevRootRef.current) {
      prevRootRef.current = workspaceRoot;
      openProject(workspaceRoot);
    }
  }, [workspaceRoot]);

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
