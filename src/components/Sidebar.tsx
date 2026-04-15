import { useRef, useCallback } from "react";
import { useSidebarStore } from "../store/sidebar-store";
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
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "var(--accent)")}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "transparent")}
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
        borderRight: position === "left" ? "1px solid var(--border)" : "none",
        borderLeft: position === "right" ? "1px solid var(--border)" : "none",
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
