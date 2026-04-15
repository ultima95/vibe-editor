import { useGitDiff } from "../hooks/useGitDiff";

interface DiffTabProps {
  filePath: string;
  cached: boolean;
  isActive: boolean;
}

export function DiffTab({ filePath, cached, isActive }: DiffTabProps) {
  const { lines, stats, loading, error } = useGitDiff(filePath, cached);

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
        No changes
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
        {filePath} — <span style={{ color: "var(--git-added)" }}>+{stats.added}</span>{" "}
        <span style={{ color: "var(--git-deleted)" }}>−{stats.removed}</span>
      </div>
      {lines.map((line, i) => {
        if (line.type === "hunk") {
          return (
            <div
              key={i}
              style={{
                display: "flex",
                background: "rgba(137,180,250,0.08)",
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
          ? "rgba(166,227,161,0.12)"
          : line.type === "removed"
            ? "rgba(243,139,168,0.12)"
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
