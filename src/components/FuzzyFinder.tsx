import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";
import { useTabStore } from "../store/tab-store";
import { Tab } from "../types";

interface SearchResult {
  path: string;
  name: string;
  score: number;
}

interface FuzzyFinderProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FuzzyFinder({ isOpen, onClose }: FuzzyFinderProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const { addTab, activeGroupId } = useTabStore();

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !workspaceRoot) return;
    const timer = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult[]>("fuzzy_search", {
          query,
          workspaceRoot,
          limit: 20,
        });
        setResults(res);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [query, isOpen, workspaceRoot]);

  const openFile = useCallback(
    (result: SearchResult) => {
      const tab: Tab = {
        id: `editor-${Date.now()}`,
        type: "editor",
        title: result.name,
        filePath: result.path,
        isDirty: false,
      };
      addTab(activeGroupId, tab);
      onClose();
    },
    [addTab, activeGroupId, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) openFile(results[selectedIndex]);
        break;
      case "Escape":
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxHeight: 400,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files..."
          style={{
            width: "100%",
            padding: "12px 16px",
            border: "none",
            borderBottom: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            fontFamily: "'SF Mono', monospace",
          }}
        />
        <div style={{ maxHeight: 340, overflow: "auto" }}>
          {results.map((result, i) => (
            <div
              key={result.path}
              onClick={() => openFile(result)}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                background:
                  i === selectedIndex
                    ? "rgba(59, 130, 246, 0.15)"
                    : "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ color: "var(--text-primary)", fontSize: 13 }}>
                {result.name}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {result.path}
              </span>
            </div>
          ))}
          {results.length === 0 && query && (
            <div
              style={{
                padding: 16,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              No files found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
