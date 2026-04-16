import { useState, useEffect, useRef, useMemo } from "react";
import { useFileSystem, DirEntry } from "../hooks/use-file-system";
import { ContextMenu } from "./ContextMenu";
import { useGitStore } from "../store/git-store";
import { useAppStore } from "../store/app-store";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { FileIcon } from "./fileIcons";

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  onFileClick: (path: string, name: string) => void;
  onRefresh?: () => void;
}

export function FileTreeNode({ entry, depth, onFileClick, onRefresh }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(entry.name);
  const renameRef = useRef<HTMLInputElement>(null);
  const { listDirectory, renamePath, deletePath, copyPath } = useFileSystem();

  useEffect(() => {
    if (expanded && entry.is_dir && children.length === 0) {
      listDirectory(entry.path).then(setChildren).catch(console.error);
    }
  }, [expanded, entry.path, entry.is_dir]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      const dotIdx = renameName.lastIndexOf(".");
      renameRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : renameName.length);
    }
  }, [renaming]);

  const refreshChildren = () => {
    if (entry.is_dir && expanded) {
      listDirectory(entry.path).then(setChildren).catch(console.error);
    }
  };

  const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));

  const toggle = () => {
    if (entry.is_dir) {
      setExpanded(!expanded);
    } else {
      onFileClick(entry.path, entry.name);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRename = () => {
    setRenameName(entry.name);
    setRenaming(true);
  };

  const commitRename = async () => {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === entry.name) {
      setRenaming(false);
      return;
    }
    try {
      const newPath = parentDir + "/" + trimmed;
      await renamePath(entry.path, newPath);
      onRefresh?.();
    } catch (err) {
      console.error("Rename failed:", err);
    }
    setRenaming(false);
  };

  const handleDuplicate = async () => {
    try {
      const dotIdx = entry.name.lastIndexOf(".");
      const baseName = dotIdx > 0 ? entry.name.substring(0, dotIdx) : entry.name;
      const ext = dotIdx > 0 ? entry.name.substring(dotIdx) : "";
      const dst = parentDir + "/" + baseName + " copy" + ext;
      await copyPath(entry.path, dst);
      onRefresh?.();
    } catch (err) {
      console.error("Duplicate failed:", err);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete "${entry.name}"?`);
    if (!confirmed) return;
    try {
      await deletePath(entry.path);
      onRefresh?.();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const menuItems = [
    { label: "Rename", onClick: handleRename },
    { label: "Duplicate", onClick: handleDuplicate },
    { label: "Delete", onClick: handleDelete, danger: true },
  ];

  const workspaceRoot = useAppStore((s) => s.workspaceRoot) ?? "";
  const stagedFiles = useGitStore((s) => s.stagedFiles);
  const changedFiles = useGitStore((s) => s.changedFiles);
  const untrackedFiles = useGitStore((s) => s.untrackedFiles);
  const conflictedFiles = useGitStore((s) => s.conflictedFiles);
  const allFiles = useMemo(
    () => [...stagedFiles, ...changedFiles, ...untrackedFiles, ...conflictedFiles],
    [stagedFiles, changedFiles, untrackedFiles, conflictedFiles],
  );

  const relativePath = entry.path.startsWith(workspaceRoot)
    ? entry.path.slice(workspaceRoot.length + 1)
    : entry.path;

  const gitFile = allFiles.find((f) => f.path === relativePath);
  const gitStatus = gitFile
    ? (gitFile.worktree_status !== "Unmodified" ? gitFile.worktree_status : gitFile.index_status)
    : null;

  const dirGitStatus = entry.is_dir ? (() => {
    const priority: Record<string, number> = {
      Conflicted: 5, Added: 4, Modified: 3, Deleted: 2, Untracked: 1,
    };
    let best: string | null = null;
    let bestPriority = 0;
    for (const f of allFiles) {
      if (f.path.startsWith(relativePath + "/") || f.path.startsWith(relativePath + "\\")) {
        const s = f.worktree_status !== "Unmodified" ? f.worktree_status : f.index_status;
        const p = priority[s] ?? 0;
        if (p > bestPriority) {
          bestPriority = p;
          best = s;
        }
      }
    }
    return best;
  })() : null;

  const effectiveStatus = gitStatus ?? dirGitStatus;
  const statusOpacity = entry.is_dir && dirGitStatus && !gitStatus ? 0.7 : 1;

  function gitStatusColor(status: string | null): string | undefined {
    switch (status) {
      case "Added": case "Renamed": case "Copied": return "var(--git-added)";
      case "Modified": return "var(--git-modified)";
      case "Deleted": return "var(--git-deleted)";
      case "Untracked": return "var(--git-untracked)";
      case "Conflicted": return "var(--git-conflicted)";
      default: return undefined;
    }
  }

  function gitStatusLetter(status: string | null): string {
    switch (status) {
      case "Added": return "A";
      case "Modified": return "M";
      case "Deleted": return "D";
      case "Untracked": return "?";
      case "Conflicted": return "C";
      case "Renamed": return "R";
      default: return "";
    }
  }

  const nameColor = gitStatusColor(effectiveStatus) ?? "var(--text-primary)";
  const isDeletedFile = effectiveStatus === "Deleted";

  return (
    <>
      <div
        onClick={toggle}
        onContextMenu={handleContextMenu}
        style={{
          padding: "3px 8px",
          paddingLeft: depth * 16 + 8,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-primary)",
          userSelect: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "rgba(148, 163, 184, 0.08)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        {entry.is_dir ? (
          <span style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {expanded
              ? <ChevronDown size={12} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
              : <ChevronRight size={12} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
            }
            {expanded
              ? <FolderOpen size={14} strokeWidth={1.5} style={{ color: nameColor !== "var(--text-primary)" ? nameColor : "var(--text-secondary)" }} />
              : <Folder size={14} strokeWidth={1.5} style={{ color: nameColor !== "var(--text-primary)" ? nameColor : "var(--text-secondary)" }} />
            }
          </span>
        ) : (
          <span style={{ display: "flex", alignItems: "center", flexShrink: 0, width: 14 + 2 + 14, justifyContent: "flex-end" }}>
            <FileIcon
              filename={entry.name}
              size={14}
              strokeWidth={1.5}
              colorOverride={nameColor !== "var(--text-primary)" ? nameColor : undefined}
            />
          </span>
        )}
        {renaming ? (
          <input
            ref={renameRef}
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            style={{
              flex: 1,
              fontSize: 13,
              padding: "0 4px",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent)",
              borderRadius: 3,
              outline: "none",
              minWidth: 0,
            }}
          />
        ) : (
          <>
            <span style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              color: nameColor,
              textDecoration: isDeletedFile ? "line-through" : "none",
            }}>
              {entry.name}
            </span>
            {effectiveStatus && (
              <span style={{
                color: gitStatusColor(effectiveStatus),
                fontSize: 9,
                fontWeight: "bold",
                fontFamily: "monospace",
                marginLeft: "auto",
                flexShrink: 0,
                opacity: statusOpacity,
                paddingRight: 4,
              }}>
                {gitStatusLetter(effectiveStatus)}
              </span>
            )}
          </>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
      {expanded &&
        children.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            onFileClick={onFileClick}
            onRefresh={refreshChildren}
          />
        ))}
    </>
  );
}
