import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { LogEntry } from "../store/git-store";

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

export function GitLogTab({ isActive }: { isActive: boolean }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
      {entries.map((entry, i) => (
        <div
          key={`${entry.hash}-${i}`}
          style={{
            display: "flex",
            alignItems: "baseline",
            padding: "6px 16px",
            gap: 12,
            borderBottom: "1px solid var(--border)",
            fontSize: 13,
          }}
        >
          <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>
            {entry.hash}
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
      ))}
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
