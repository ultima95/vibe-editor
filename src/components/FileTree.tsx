import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useFileSystem, DirEntry } from "../hooks/use-file-system";
import { useAppStore } from "../store/app-store";
import { useTabStore, focusExistingTab } from "../store/tab-store";
import { useSidebarStore } from "../store/sidebar-store";
import { FileTreeNode } from "./FileTreeNode";
import { Tab } from "../types";

export function FileTree() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [fsGeneration, setFsGeneration] = useState(0);
  const { listDirectory } = useFileSystem();
  const { addTab, activeGroupId } = useTabStore();

  const revealRequested = useSidebarStore((s) => s.revealRequested);
  const clearReveal = useSidebarStore((s) => s.clearReveal);

  // Compute reveal path only when explicitly requested (sidebar open / panel switch)
  const activeFilePath = useTabStore((s) => {
    const ag = s.groups[s.activeGroupId];
    if (!ag) return null;
    const activeTab = ag.tabs.find((t) => t.id === ag.activeTabId);
    return activeTab?.filePath ?? null;
  });

  const revealPath = revealRequested ? activeFilePath : null;

  // Clear the reveal flag after one render cycle
  useEffect(() => {
    if (revealRequested) {
      const timer = setTimeout(() => clearReveal(), 500);
      return () => clearTimeout(timer);
    }
  }, [revealRequested, clearReveal]);

  useEffect(() => {
    if (workspaceRoot) {
      listDirectory(workspaceRoot).then(setEntries).catch(console.error);
    }
  }, [workspaceRoot]);

  // Listen for fs-change events from the file watcher
  useEffect(() => {
    const unlisten = listen("fs-change", () => {
      if (workspaceRoot) {
        listDirectory(workspaceRoot).then(setEntries).catch(console.error);
      }
      setFsGeneration((g) => g + 1);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workspaceRoot]);

  const handleFileClick = (path: string, name: string) => {
    // Focus existing tab if already open
    if (focusExistingTab(path)) return;

    const tab: Tab = {
      id: `editor-${Date.now()}`,
      type: "editor",
      title: name,
      filePath: path,
      isDirty: false,
    };
    addTab(activeGroupId, tab);
  };

  if (!workspaceRoot) {
    return (
      <div style={{ padding: 12, color: "var(--text-muted)" }}>No folder open</div>
    );
  }

  const refreshRoot = () => {
    if (workspaceRoot) {
      listDirectory(workspaceRoot).then(setEntries).catch(console.error);
    }
  };

  return (
    <div style={{ overflow: "auto", height: "100%" }}>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onFileClick={handleFileClick}
          onRefresh={refreshRoot}
          revealPath={revealPath}
          fsGeneration={fsGeneration}
        />
      ))}
    </div>
  );
}
