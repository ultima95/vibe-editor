import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useFileSystem, DirEntry } from "../hooks/use-file-system";
import { useAppStore } from "../store/app-store";
import { useTabStore } from "../store/tab-store";
import { FileTreeNode } from "./FileTreeNode";
import { Tab } from "../types";

export function FileTree() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const { listDirectory } = useFileSystem();
  const { addTab, activeGroupId } = useTabStore();

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
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workspaceRoot]);

  const handleFileClick = (path: string, name: string) => {
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

  return (
    <div style={{ overflow: "auto", height: "100%" }}>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onFileClick={handleFileClick}
        />
      ))}
    </div>
  );
}
