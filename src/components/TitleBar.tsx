import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store/app-store";
import { Minus, Square, X, Copy } from "lucide-react";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
  }, []);

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
      }}
    >
      {/* macOS-style traffic lights — left side */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 14 }}>
        <TrafficLight color="#ff5f57" hoverColor="#e0443e" onClick={() => appWindow.close()} />
        <TrafficLight color="#febc2e" hoverColor="#d4a019" onClick={() => appWindow.minimize()} />
        <TrafficLight
          color="#28c840"
          hoverColor="#1aab29"
          onClick={async () => {
            await appWindow.toggleMaximize();
            setMaximized(await appWindow.isMaximized());
          }}
        />
      </div>

      {/* Title — centered */}
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

      {/* Windows-style controls — right side (hidden on macOS) */}
      <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
        <WindowButton onClick={() => appWindow.minimize()}>
          <Minus size={14} strokeWidth={1.5} />
        </WindowButton>
        <WindowButton
          onClick={async () => {
            await appWindow.toggleMaximize();
            setMaximized(await appWindow.isMaximized());
          }}
        >
          {maximized
            ? <Copy size={11} strokeWidth={1.5} style={{ transform: "scaleX(-1)" }} />
            : <Square size={11} strokeWidth={1.5} />
          }
        </WindowButton>
        <WindowButton onClick={() => appWindow.close()} isClose>
          <X size={15} strokeWidth={1.5} />
        </WindowButton>
      </div>
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

function WindowButton({
  onClick,
  isClose,
  children,
}: {
  onClick: () => void;
  isClose?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 46,
        height: "100%",
        background: hovered
          ? isClose
            ? "#e81123"
            : "rgba(148, 163, 184, 0.1)"
          : "transparent",
        color: hovered && isClose ? "#fff" : "var(--text-secondary)",
        border: "none",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}
