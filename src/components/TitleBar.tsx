import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store/app-store";

const appWindow = getCurrentWindow();

export function TitleBar() {
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
        background: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border)",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 14 }}>
        <TrafficLight color="#ff5f57" hoverColor="#e0443e" onClick={() => appWindow.close()} />
        <TrafficLight color="#febc2e" hoverColor="#d4a019" onClick={() => appWindow.minimize()} />
        <TrafficLight
          color="#28c840"
          hoverColor="#1aab29"
          onClick={async () => {
            await appWindow.toggleMaximize();
          }}
        />
      </div>

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
    </div>
  );
}

function TrafficLight({
  color,
  hoverColor,
  onClick,
}: {
  color: string;
  hoverColor: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: hovered ? hoverColor : color,
        border: "none",
        padding: 0,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    />
  );
}
