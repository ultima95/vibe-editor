import { useAppStore } from "../store/app-store";
import { Settings } from "lucide-react";

export function TitleBar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  const projectName = workspaceRoot
    ? workspaceRoot.split("/").pop() || workspaceRoot
    : "Vibe Editor";

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border)",
        userSelect: "none",
        flexShrink: 0,
        /* Leave space for native macOS traffic lights */
        paddingLeft: 78,
      }}
    >
      <span
        data-tauri-drag-region
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          letterSpacing: 0.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {projectName}
      </span>

      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px 14px 4px 4px",
            display: "flex",
            alignItems: "center",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <Settings size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
