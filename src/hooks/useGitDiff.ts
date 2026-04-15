import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/app-store";

interface DiffLine {
  type: "context" | "added" | "removed" | "hunk";
  content: string;
  lineNumber?: number;
}

export function useGitDiff(filePath: string, cached: boolean) {
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [stats, setStats] = useState({ added: 0, removed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  useEffect(() => {
    if (!workspaceRoot || !filePath) return;
    setLoading(true);
    invoke<string>("git_diff", { workspaceRoot, path: filePath, cached })
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
  }, [workspaceRoot, filePath, cached]);

  return { lines, stats, loading, error };
}
