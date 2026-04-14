import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./Sidebar";
import { TabGroupManager } from "./TabGroupManager";
import { useSidebarStore } from "../store/sidebar-store";
import { useAppStore } from "../store/app-store";

export function AppShell() {
  const { position } = useSidebarStore();
  const setWorkspaceRoot = useAppStore((s) => s.setWorkspaceRoot);

  useEffect(() => {
    invoke<string>("cmd_get_default_workspace").then((root) => {
      setWorkspaceRoot(root);
      invoke("watch_directory", { path: root }).catch(console.error);
    });
  }, []);

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
