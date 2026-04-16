import { useAppStore } from "../store/app-store";

interface WelcomeScreenProps {
  onOpenFolder: () => void;
}

export function WelcomeScreen({ onOpenFolder }: WelcomeScreenProps) {
  const recentProjects = useAppStore((s) => s.recentProjects);

  return (
    <div style={styles.container}>
      <div
        data-tauri-drag-region
        style={styles.dragRegion}
      />
      <div style={styles.content}>
        <h1 style={styles.title}>Vibe Editor</h1>
        <p style={styles.subtitle}>Terminal-first editor for macOS</p>

        <button onClick={onOpenFolder} style={styles.openButton}>
          Open Folder
        </button>
        <span style={styles.shortcutHint}>⌘O</span>

        {recentProjects.length > 0 && (
          <div style={styles.recentSection}>
            <h3 style={styles.recentTitle}>Recent Projects</h3>
            <ul style={styles.recentList}>
              {recentProjects.map((path) => (
                <RecentItem key={path} path={path} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentItem({ path }: { path: string }) {
  const setWorkspaceRoot = useAppStore((s) => s.setWorkspaceRoot);
  const segments = path.split("/");
  const name = segments[segments.length - 1] || path;
  const dir = segments.slice(0, -1).join("/");

  return (
    <li
      style={styles.recentItem}
      onClick={() => setWorkspaceRoot(path)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span style={styles.recentName}>{name}</span>
      <span style={styles.recentPath}>{dir}</span>
    </li>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100vh",
    background: "var(--bg-primary)",
    position: "relative" as const,
  },
  dragRegion: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 38,
    // @ts-expect-error -- WebKit vendor CSS for window dragging
    WebkitAppRegion: "drag",
  },
  content: {
    textAlign: "center",
    maxWidth: 420,
    width: "100%",
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: "0 0 8px",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    margin: "0 0 32px",
  },
  openButton: {
    padding: "10px 28px",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    background: "var(--accent)",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  shortcutHint: {
    display: "inline-block",
    marginLeft: 10,
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-tertiary)",
    padding: "4px 8px",
    borderRadius: 4,
  },
  recentSection: {
    marginTop: 40,
    textAlign: "left",
  },
  recentTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    margin: "0 0 8px",
    paddingLeft: 8,
  },
  recentList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  recentItem: {
    display: "flex",
    flexDirection: "column",
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 0.1s",
    gap: 2,
  },
  recentName: {
    fontSize: 14,
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  recentPath: {
    fontSize: 11,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
