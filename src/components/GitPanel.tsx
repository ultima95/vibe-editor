import { useGitStore } from "../store/git-store";

export function GitPanel() {
  const { isGitRepo, gitAvailable, isLoading, initRepo } = useGitStore();

  if (!gitAvailable) {
    return (
      <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13, textAlign: "center" }}>
        git not found. Install git to use source control.
      </div>
    );
  }

  if (!isGitRepo) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
          Not a git repository
        </p>
        <button
          onClick={initRepo}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            padding: "6px 16px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Initialize Repository
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: 8, color: "var(--text-secondary)", fontSize: 12 }}>
      Git panel — full UI coming in next task
    </div>
  );
}
