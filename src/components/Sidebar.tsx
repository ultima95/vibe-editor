import { useRef, useCallback } from "react";
import { useSidebarStore } from "../store/sidebar-store";
import { FileTree } from "./FileTree";
import { SearchPanel } from "./SearchPanel";

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
          {(["files", "search"] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 1,
                background: "none",
                border: "none",
                borderBottom: activePanel === panel ? "2px solid var(--accent)" : "2px solid transparent",
                color: activePanel === panel ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {panel === "files" ? "Files" : "Search"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
          {activePanel === "files" ? <FileTree /> : <SearchPanel />}
        </div>
      </div>
      {resizeHandle}
    </div>
  );
}
