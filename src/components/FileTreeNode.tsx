import { useState, useEffect, useRef } from "react";
import { useFileSystem, DirEntry } from "../hooks/use-file-system";
import { ContextMenu } from "./ContextMenu";

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
          ((e.currentTarget as HTMLElement).style.background = "rgba(124, 58, 237, 0.1)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <span style={{ fontSize: 11, width: 14, textAlign: "center" }}>
          {entry.is_dir ? (expanded ? "▼" : "▶") : " "}
        </span>
        <span>{entry.is_dir ? "📁" : "📄"}</span>
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
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
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
