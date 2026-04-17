import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { useTabStore } from "../store/tab-store";
import { LogEntry, CommitFile } from "../store/git-store";

function relativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const STATUS_COLORS: Record<string, string> = {
  Added: "var(--git-added, #4ade80)",
  Modified: "var(--accent, #60a5fa)",
  Deleted: "var(--git-deleted, #f87171)",
  Renamed: "var(--text-secondary, #a1a1aa)",
  Copied: "var(--text-secondary, #a1a1aa)",
};

const STATUS_LETTERS: Record<string, string> = {
  Added: "A",
  Modified: "M",
  Deleted: "D",
  Renamed: "R",
  Copied: "C",
};

function CommitFiles({ hash, isExpanded }: { hash: string; isExpanded: boolean }) {
  const [files, setFiles] = useState<CommitFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const loaded = useRef(false);

  useEffect(() => {
    if (!isExpanded || loaded.current || !workspaceRoot) return;
    loaded.current = true;
    setLoading(true);
    invoke<CommitFile[]>("git_commit_files", { workspaceRoot, hash })
      .then(setFiles)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [isExpanded, hash, workspaceRoot]);

  if (!isExpanded) return null;

  if (loading) {
    return (
      <div style={{ padding: "6px 16px 10px 36px", color: "var(--text-muted)", fontSize: 12 }}>
        Loading files...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "6px 16px 10px 36px", color: "var(--error, #f87171)", fontSize: 12 }}>
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div style={{ padding: "6px 16px 10px 36px", color: "var(--text-muted)", fontSize: 12 }}>
        No files changed
      </div>
    );
  }

  const openFile = (filePath: string) => {
    const root = workspaceRoot;
    if (!root) return;
    const fullPath = `${root}/${filePath}`;
    const { addTab, activeGroupId } = useTabStore.getState();
    addTab(activeGroupId, {
      id: `editor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "editor",
      title: filePath.split("/").pop() ?? filePath,
      filePath: fullPath,
    });
  };

  return (
    <div style={{ padding: "2px 0 8px 0", background: "rgba(0,0,0,0.1)" }}>
      {files.map((file, i) => {
        const color = STATUS_COLORS[file.status] ?? "var(--text-muted)";
        const letter = STATUS_LETTERS[file.status] ?? "?";
        const isDeleted = file.status === "Deleted";

        return (
          <div
            key={`${file.path}-${i}`}
            onClick={isDeleted ? undefined : () => openFile(file.path)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "3px 16px 3px 36px",
              gap: 8,
              fontSize: 12,
              cursor: isDeleted ? "default" : "pointer",
              color: isDeleted ? "var(--text-muted)" : "var(--text-primary)",
            }}
            onMouseEnter={(e) => {
              if (!isDeleted) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 600,
                color,
                width: 14,
                textAlign: "center",
                flexShrink: 0,
                fontSize: 11,
              }}
            >
              {letter}
            </span>
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
                textDecoration: isDeleted ? "line-through" : "none",
              }}
            >
              {file.path}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function GitLogTab({ isActive }: { isActive: boolean }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !workspaceRoot) return;
    setLoading(true);
    try {
      const newEntries = await invoke<LogEntry[]>("git_log", {
        workspaceRoot,
        skip: entries.length,
        limit: 50,
      });
      if (newEntries.length < 50) setHasMore(false);
      setEntries((prev) => [...prev, ...newEntries]);
    } catch (err) {
      console.error("Failed to load git log:", err);
      setHasMore(false);
    }
    setLoading(false);
  }, [loading, hasMore, workspaceRoot, entries.length]);

  useEffect(() => {
    if (isActive && entries.length === 0) loadMore();
  }, [isActive]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      loadMore();
    }
  };

  if (!isActive) return null;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        background: "var(--bg-primary)",
      }}
    >
      {entries.map((entry, i) => {
        const isExpanded = expandedHash === entry.hash;
        return (
          <div key={`${entry.hash}-${i}`}>
            <div
              onClick={() => setExpandedHash(isExpanded ? null : entry.hash)}
              style={{
                display: "flex",
                alignItems: "baseline",
                padding: "6px 16px",
                gap: 12,
                borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                fontSize: 13,
                cursor: "pointer",
                background: isExpanded ? "rgba(255,255,255,0.02)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
              }}
              onMouseLeave={(e) => {
                if (!isExpanded) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                  width: 12,
                  textAlign: "center",
                  transition: "transform 0.15s",
                  transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                }}
              >
                ▶
              </span>
              <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>
                {entry.short_hash}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                {entry.message}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: 12, flexShrink: 0 }}>
                {entry.author}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                {relativeTime(entry.timestamp)}
              </span>
            </div>
            <CommitFiles hash={entry.hash} isExpanded={isExpanded} />
            {isExpanded && (
              <div style={{ borderBottom: "1px solid var(--border)" }} />
            )}
          </div>
        );
      })}
      {loading && (
        <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          Loading...
        </div>
      )}
      {!hasMore && entries.length > 0 && (
        <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          End of log
        </div>
      )}
    </div>
  );
}
