import { useState, useEffect } from "react";
import { useFileSystem, DirEntry } from "../hooks/use-file-system";

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  onFileClick: (path: string, name: string) => void;
}

export function FileTreeNode({ entry, depth, onFileClick }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const { listDirectory } = useFileSystem();

  useEffect(() => {
    if (expanded && entry.is_dir && children.length === 0) {
      listDirectory(entry.path).then(setChildren).catch(console.error);
    }
  }, [expanded, entry.path, entry.is_dir]);

  const toggle = () => {
    if (entry.is_dir) {
      setExpanded(!expanded);
    } else {
      onFileClick(entry.path, entry.name);
    }
  };

  return (
    <>
      <div
        onClick={toggle}
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
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
      </div>
      {expanded &&
        children.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            onFileClick={onFileClick}
          />
        ))}
    </>
  );
}
