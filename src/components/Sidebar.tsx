import { useRef, useCallback } from "react";
import { useSidebarStore } from "../store/sidebar-store";
import { useGitStore } from "../store/git-store";
import { FileTree } from "./FileTree";
import { SearchPanel } from "./SearchPanel";
import { GitPanel } from "./GitPanel";
import { Files, Search, GitBranch } from "lucide-react";

const panelIcons = {
  files: Files,
  search: Search,
  git: GitBranch,
} as const;

export function Sidebar() {
  const { visible, position, width, setWidth, activePanel, setActivePanel } = useSidebarStore();
  const gitChangeCount = useGitStore((s) => s.stagedFiles.length + s.changedFiles.length + s.untrackedFiles.length);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      resizing.current = true;
      startX.current = e.clientX;
      startWidth.current = width;

      const onMouseMove = (e: MouseEvent) => {
        if (!resizing.current) return;
        const delta = position === "left"
          ? e.clientX - startX.current
          : startX.current - e.clientX;
        setWidth(startWidth.current + delta);
      };

      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, position, setWidth]
  );

  if (!visible) return null;

  const resizeHandle = (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 4,
        cursor: "col-resize",
        background: "transparent",
        flexShrink: 0,
        borderRight: position === "left" ? "1px solid var(--border)" : "none",
        borderLeft: position === "right" ? "1px solid var(--border)" : "none",
      }}
      onMouseEnter={(e) => {
        const el = e.target as HTMLElement;
        el.style.background = "var(--accent)";
        el.style.borderColor = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        const el = e.target as HTMLElement;
        el.style.background = "transparent";
        el.style.borderColor = "var(--border)";
      }}
    />
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: position === "left" ? "row" : "row-reverse",
        width,
        flexShrink: 0,
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{
          display: "flex",
          userSelect: "none",
          borderBottom: "1px solid var(--border)",
        }}>
          {(["files", "search", "git"] as const).map((panel) => {
            const Icon = panelIcons[panel];
            const isActive = activePanel === panel;
            return (
              <button
                key={panel}
                onClick={() => setActivePanel(panel)}
                title={panel.charAt(0).toUpperCase() + panel.slice(1)}
                style={{
                  position: "relative",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "8px 0",
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = "var(--text-secondary)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <Icon size={16} strokeWidth={1.75} />
                {panel === "git" && gitChangeCount > 0 && (
                  <span style={{
                    position: "absolute",
                    top: 4,
                    right: "calc(50% - 14px)",
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: "var(--accent)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: "16px",
                    textAlign: "center",
                    padding: "0 4px",
                    pointerEvents: "none",
                  }}>
                    {gitChangeCount > 99 ? "99+" : gitChangeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
          {activePanel === "files" ? <FileTree /> : activePanel === "search" ? <SearchPanel /> : <GitPanel />}
        </div>
      </div>
      {resizeHandle}
    </div>
  );
}
