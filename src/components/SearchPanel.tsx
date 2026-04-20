import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { useTabStore } from "../store/tab-store";
import { Tab } from "../types";

interface TextSearchResult {
  path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
}

type GroupedResults = Map<string, TextSearchResult[]>;

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupedResults>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const { addTab, activeGroupId } = useTabStore();

  const doSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !workspaceRoot) return;

    setLoading(true);
    setError(null);
    setSearchedQuery(trimmed);

    try {
      const res = await invoke<TextSearchResult[]>("text_search", {
        query: trimmed,
        workspaceRoot,
        limit: 200,
      });

      const grouped: GroupedResults = new Map();
      for (const r of res) {
        const existing = grouped.get(r.path) ?? [];
        existing.push(r);
        grouped.set(r.path, existing);
      }
      setResults(grouped);
    } catch (err) {
      console.error("Search error:", err);
      setError(String(err));
      setResults(new Map());
    } finally {
      setLoading(false);
    }
  }, [query, workspaceRoot]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  };

  const openResult = useCallback(
    (result: TextSearchResult) => {
      const name = result.path.split("/").pop() ?? result.path;
      const absolutePath = workspaceRoot
        ? `${workspaceRoot}/${result.path}`
        : result.path;
      const tab: Tab = {
        id: `editor-${Date.now()}`,
        type: "editor",
        title: name,
        filePath: absolutePath,
        isDirty: false,
        pendingGoToLine: result.line_number,
      };
      addTab(activeGroupId, tab);
    },
    [addTab, activeGroupId, workspaceRoot],
  );

  const totalMatches = Array.from(results.values()).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search input */}
      <div style={{ padding: "8px 8px 4px" }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files…"
          autoFocus
          style={{
            width: "100%",
            padding: "4px 8px",
            fontSize: 13,
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      </div>

      {/* Status line */}
      {searchedQuery && !loading && (
        <div style={{
          padding: "2px 8px 4px",
          fontSize: 11,
          color: "var(--text-secondary)",
        }}>
          {totalMatches} result{totalMatches !== 1 ? "s" : ""} in {results.size} file{results.size !== 1 ? "s" : ""}
        </div>
      )}

      {loading && (
        <div style={{ padding: "8px", fontSize: 12, color: "var(--text-secondary)" }}>
          Searching…
        </div>
      )}

      {error && (
        <div style={{ padding: "8px", fontSize: 12, color: "var(--error, #f44)" }}>
          {error}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
        {Array.from(results.entries()).map(([filePath, matches]) => (
          <FileGroup
            key={filePath}
            filePath={filePath}
            matches={matches}
            onSelect={openResult}
          />
        ))}
      </div>
    </div>
  );
}

function FileGroup({
  filePath,
  matches,
  onSelect,
}: {
  filePath: string;
  matches: TextSearchResult[];
  onSelect: (r: TextSearchResult) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const fileName = filePath.split("/").pop() ?? filePath;
  const dir = filePath.includes("/")
    ? filePath.slice(0, filePath.lastIndexOf("/"))
    : "";

  return (
    <div style={{ marginBottom: 2 }}>
      {/* File header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          padding: "4px 6px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 10, width: 12, flexShrink: 0, textAlign: "center" }}>
          {collapsed ? "▶" : "▼"}
        </span>
        <span>{fileName}</span>
        {dir && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400 }}>
            {dir}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400, marginLeft: "auto" }}>
          {matches.length}
        </span>
      </div>

      {/* Match lines */}
      {!collapsed && matches.map((m, i) => (
        <div
          key={`${m.line_number}-${i}`}
          onClick={() => onSelect(m)}
          style={{
            padding: "2px 6px 2px 16px",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            gap: 8,
            borderRadius: 3,
            lineHeight: "18px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.05))")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ color: "var(--text-secondary)", minWidth: 28, textAlign: "right", flexShrink: 0 }}>
            {m.line_number}
          </span>
          <span style={{
            color: "var(--text-primary)",
            whiteSpace: "pre",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {m.line_content.trimStart()}
          </span>
        </div>
      ))}
    </div>
  );
}
