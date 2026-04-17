import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";

interface DiffLine {
  type: "context" | "added" | "removed" | "hunk";
  content: string;
  lineNumber?: number;
}

interface CommitDiffTabProps {
  filePath: string;
  commitHash: string;
  isActive: boolean;
}

export function CommitDiffTab({ filePath, commitHash, isActive }: CommitDiffTabProps) {
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [stats, setStats] = useState({ added: 0, removed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  useEffect(() => {
    if (!workspaceRoot || !filePath || !commitHash) return;
    setLoading(true);
    setError(null);

    invoke<string>("git_commit_diff", { workspaceRoot, hash: commitHash, path: filePath })
      .then((raw) => {
        const parsed: DiffLine[] = [];
        let added = 0;
        let removed = 0;
        let lineNum = 0;

        for (const line of raw.split("\n")) {
          if (line.startsWith("@@")) {
            const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
            if (match) lineNum = parseInt(match[1]) - 1;
            parsed.push({ type: "hunk", content: line });
          } else if (line.startsWith("+")) {
            lineNum++;
            added++;
            parsed.push({ type: "added", content: line.slice(1), lineNumber: lineNum });
          } else if (line.startsWith("-")) {
            removed++;
            parsed.push({ type: "removed", content: line.slice(1) });
          } else if (line.startsWith(" ")) {
            lineNum++;
            parsed.push({ type: "context", content: line.slice(1), lineNumber: lineNum });
          }
        }

        setLines(parsed);
        setStats({ added, removed });
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [workspaceRoot, filePath, commitHash]);

  if (!isActive) return null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
        No changes in this commit
      </div>
    );
  }

  return (
    <div style={{
      width: "100%",
      height: "100%",
      overflow: "auto",
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
      fontSize: 13,
      lineHeight: 1.6,
      background: "var(--bg-primary)",
    }}>
      <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
        {filePath} @ <span style={{ fontFamily: "monospace" }}>{commitHash.slice(0, 7)}</span>
        {" — "}
        <span style={{ color: "var(--git-added)" }}>+{stats.added}</span>{" "}
        <span style={{ color: "var(--git-deleted)" }}>−{stats.removed}</span>
      </div>
      {lines.map((line, i) => {
        if (line.type === "hunk") {
          return (
            <div
              key={i}
              style={{
                display: "flex",
                background: "rgba(148,163,184,0.06)",
                borderTop: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                margin: "4px 0",
              }}
            >
              <span style={{ width: 50, textAlign: "right", paddingRight: 8, color: "var(--accent)", userSelect: "none", flexShrink: 0 }}>⋯</span>
              <span style={{ flex: 1, padding: "0 8px", color: "var(--accent)", fontSize: 11 }}>{line.content}</span>
            </div>
          );
        }

        const bgColor = line.type === "added"
          ? "rgba(74,222,128,0.08)"
          : line.type === "removed"
            ? "rgba(248,113,113,0.08)"
            : "transparent";

        const textColor = line.type === "added"
          ? "var(--git-added)"
          : line.type === "removed"
            ? "var(--git-deleted)"
            : "var(--text-primary)";

        const prefix = line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";

        return (
          <div key={i} style={{ display: "flex", background: bgColor }}>
            <span style={{
              width: 50,
              textAlign: "right",
              paddingRight: 8,
              color: line.type === "context" ? "var(--text-muted)" : textColor,
              userSelect: "none",
              flexShrink: 0,
              fontSize: 12,
            }}>
              {line.lineNumber ?? ""}
            </span>
            <span style={{ flex: 1, padding: "0 8px", color: textColor, whiteSpace: "pre" }}>
              {prefix} {line.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
