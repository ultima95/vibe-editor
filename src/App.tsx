import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AppShell } from "./components/AppShell";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { FuzzyFinder } from "./components/FuzzyFinder";
import { useSidebarStore } from "./store/sidebar-store";
import { useTabStore, createTerminalTab } from "./store/tab-store";
import { useAppStore } from "./store/app-store";
import { ToastContainer } from "./components/Toast";
import "./styles/globals.css";

function App() {
  const [fuzzyFinderOpen, setFuzzyFinderOpen] = useState(false);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  const openFolderDialog = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      useAppStore.getState().setWorkspaceRoot(selected);
    }
  }, []);

  useEffect(() => {
    // Load config + recent projects on startup
    invoke<{ sidebar_position: string; sidebar_visible: boolean }>("load_config").then((config) => {
      const sidebar = useSidebarStore.getState();
      sidebar.setPosition(config.sidebar_position as "left" | "right");
      if (config.sidebar_visible !== sidebar.visible) sidebar.toggle();
    }).catch(console.error);

    invoke<string[]>("cmd_get_recent_projects")
      .then(useAppStore.getState().setRecentProjects)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+O: open folder
      if (e.metaKey && e.key === "o") {
        e.preventDefault();
        openFolderDialog();
      }
      // Cmd+P: fuzzy file finder
      if (e.metaKey && e.key === "p") {
        e.preventDefault();
        setFuzzyFinderOpen((o) => !o);
      }
      // Cmd+Shift+F: focus search panel
      if (e.metaKey && e.shiftKey && e.key === "f") {
        e.preventDefault();
        const sidebar = useSidebarStore.getState();
        if (!sidebar.visible) sidebar.toggle();
        sidebar.setActivePanel("search");
      }
      // Cmd+B: toggle sidebar
      if (e.metaKey && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
      // Cmd+T: new terminal tab
      if (e.metaKey && e.key === "t") {
        e.preventDefault();
        const { addTab, activeGroupId } = useTabStore.getState();
        addTab(activeGroupId, createTerminalTab());
      }
      // Cmd+W: close current tab
      if (e.metaKey && e.key === "w") {
        e.preventDefault();
        const { groups, activeGroupId, removeTab } = useTabStore.getState();
        const group = groups[activeGroupId];
        if (group) removeTab(activeGroupId, group.activeTabId);
      }
      // Cmd+\: split vertical, Cmd+Shift+\: split horizontal
      if (e.metaKey && e.key === "\\") {
        e.preventDefault();
        const { activeGroupId, splitGroup } = useTabStore.getState();
        splitGroup(
          activeGroupId,
          e.shiftKey ? "horizontal" : "vertical",
          createTerminalTab()
        );
      }
      // Cmd+1-9: focus tab group by index
      if (e.metaKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const { groups, setActiveGroupId } = useTabStore.getState();
        const groupIds = Object.keys(groups);
        const index = parseInt(e.key) - 1;
        if (groupIds[index]) setActiveGroupId(groupIds[index]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, openFolderDialog]);

  if (!workspaceRoot) {
    return (
      <>
        <WelcomeScreen onOpenFolder={openFolderDialog} />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <AppShell />
      <FuzzyFinder
        isOpen={fuzzyFinderOpen}
        onClose={() => setFuzzyFinderOpen(false)}
      />
      <ToastContainer />
    </>
  );
}

export default App;
