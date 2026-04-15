import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { BranchInfo } from "../store/git-store";

interface BranchPickerProps {
  onSelect: (branch: string) => void;
  onClose: () => void;
  excludeCurrent?: boolean;
}

export function BranchPicker({ onSelect, onClose, excludeCurrent }: BranchPickerProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  useEffect(() => {
    if (workspaceRoot) {
      invoke<BranchInfo[]>("git_branches", { workspaceRoot }).then(setBranches).catch(console.error);
    }
    inputRef.current?.focus();
  }, [workspaceRoot]);

  const filtered = branches
    .filter((b) => !excludeCurrent || !b.is_current)
    .filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        background: "var(--bg-primary)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        zIndex: 100,
        maxHeight: 240,
        overflow: "auto",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && filtered.length > 0) {
            onSelect(filtered[0].name);
            onClose();
          }
        }}
        placeholder="Filter branches..."
        style={{
          width: "100%",
          padding: "6px 8px",
          background: "var(--bg-secondary)",
          border: "none",
          borderBottom: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontSize: 12,
          outline: "none",
        }}
      />
      {filtered.map((b) => (
        <div
          key={b.name}
          onClick={() => {
            onSelect(b.name);
            onClose();
          }}
          style={{
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 12,
            color: b.is_current ? "var(--accent)" : b.is_remote ? "var(--text-secondary)" : "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {b.is_current && <span>✓</span>}
          {b.is_remote && <span style={{ fontSize: 10, opacity: 0.6 }}>⌘</span>}
          <span>{b.name}</span>
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ padding: 8, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
          No branches found
        </div>
      )}
    </div>
  );
}
