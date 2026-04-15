import { useState, useRef, useEffect } from "react";
import { useGitStore, GitFileStatus } from "../store/git-store";
import { useTabStore } from "../store/tab-store";
import { BranchPicker } from "./BranchPicker";
import { GitBranch, RotateCcw, Plus, Minus, MoreHorizontal } from "lucide-react";

function statusColor(status: string): string {
  switch (status) {
    case "Added": case "Renamed": case "Copied": return "var(--git-added)";
    case "Modified": return "var(--git-modified)";
    case "Deleted": return "var(--git-deleted)";
    case "Untracked": return "var(--git-untracked)";
    case "Conflicted": return "var(--git-conflicted)";
    default: return "var(--text-primary)";
  }
}

function statusLetter(status: string): string {
  switch (status) {
    case "Added": return "A";
    case "Modified": return "M";
    case "Deleted": return "D";
    case "Renamed": return "R";
    case "Copied": return "C";
    case "Untracked": return "?";
    case "Conflicted": return "C";
    default: return "";
  }
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirName(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
}

function FileRow({
  file,
  statusField,
  onStage,
  onUnstage,
  onDiscard,
  onOpenDiff,
}: {
  file: GitFileStatus;
  statusField: "index_status" | "worktree_status";
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onOpenDiff: () => void;
}) {
  const status = file[statusField];
  const color = statusColor(status);
  const letter = statusLetter(status);
  const isDeleted = status === "Deleted";

  return (
    <div
      onClick={onOpenDiff}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "3px 4px",
        borderRadius: 3,
        gap: 6,
        cursor: "pointer",
        fontSize: 12,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color, fontSize: 10, fontWeight: "bold", width: 14, flexShrink: 0, fontFamily: "monospace" }}>
        {letter}
      </span>
      <span
        style={{
          color,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: isDeleted ? "line-through" : "none",
        }}
      >
        {fileName(file.path)}
      </span>
      <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
        {dirName(file.path)}
      </span>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {onDiscard && (
          <button onClick={onDiscard} title="Discard changes" style={actionBtnStyle}><RotateCcw size={12} strokeWidth={1.75} /></button>
        )}
        {onStage && (
          <button onClick={onStage} title="Stage" style={actionBtnStyle}><Plus size={13} strokeWidth={2} /></button>
        )}
        {onUnstage && (
          <button onClick={onUnstage} title="Unstage" style={actionBtnStyle}><Minus size={13} strokeWidth={2} /></button>
        )}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: 14,
  padding: "0 3px",
  lineHeight: 1,
};

export function GitPanel() {
  const git = useGitStore();
  const [commitMsg, setCommitMsg] = useState("");
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [mergeBranchPicker, setMergeBranchPicker] = useState<"merge" | "rebase" | null>(null);
  const [showStashList, setShowStashList] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const branchSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => {
      setShowOverflow(false);
      setShowBranchPicker(false);
      setMergeBranchPicker(null);
      setShowStashList(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!git.gitAvailable) {
    return (
      <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13, textAlign: "center" }}>
        git not found. Install git to use source control.
      </div>
    );
  }

  if (!git.isGitRepo) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
          Not a git repository
        </p>
        <button
          onClick={git.initRepo}
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

  const openDiff = (path: string, cached: boolean) => {
    const { addTab, activeGroupId } = useTabStore.getState();
    const id = `diff-${cached ? "staged" : "unstaged"}-${path}-${Date.now()}`;
    addTab(activeGroupId, {
      id,
      type: "diff",
      title: `Δ ${fileName(path)}`,
      filePath: path,
      diffCached: cached,
    });
  };

  const handleCommit = () => {
    if (!commitMsg.trim()) return;
    git.commit(commitMsg.trim());
    setCommitMsg("");
  };

  const disabled = !!git.operationInProgress;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }}>
      {git.mergeInProgress && (
        <div style={{ padding: "6px 12px", background: "rgba(239,68,68,0.1)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--git-deleted)", fontSize: 11, flex: 1 }}>Merge in progress</span>
          <button onClick={git.mergeAbort} style={{ ...actionBtnStyle, color: "var(--git-deleted)" }}>Abort</button>
        </div>
      )}
      {git.rebaseInProgress && (
        <div style={{ padding: "6px 12px", background: "rgba(239,68,68,0.1)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--git-deleted)", fontSize: 11, flex: 1 }}>Rebase in progress</span>
          <button onClick={git.rebaseContinue} disabled={disabled} style={{ ...actionBtnStyle, color: "var(--git-added)" }}>Continue</button>
          <button onClick={git.rebaseAbort} style={{ ...actionBtnStyle, color: "var(--git-deleted)" }}>Abort</button>
        </div>
      )}

      <div
        ref={branchSelectorRef}
        style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6, position: "relative", cursor: "pointer" }}
        onMouseDown={(e) => { e.stopPropagation(); setShowBranchPicker(!showBranchPicker); }}
      >
        <GitBranch size={13} strokeWidth={1.75} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {git.branch ?? "HEAD"}
        </span>
        {(git.ahead > 0 || git.behind > 0) && (
          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
            ↑{git.ahead} ↓{git.behind}
          </span>
        )}
        {showBranchPicker && (
          <BranchPicker
            onSelect={(b) => git.checkoutBranch(b)}
            onClose={() => setShowBranchPicker(false)}
          />
        )}
      </div>

      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <input
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleCommit(); }}
          placeholder="Commit message..."
          style={{
            width: "100%",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "6px 8px",
            color: "var(--text-primary)",
            fontSize: 11,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            onClick={handleCommit}
            disabled={disabled || !commitMsg.trim() || git.stagedFiles.length === 0}
            style={{
              flex: 1,
              background: disabled || !commitMsg.trim() || git.stagedFiles.length === 0
                ? "var(--border)" : "var(--accent)",
              color: "white",
              border: "none",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {git.operationInProgress === "committing" ? "Committing..." : "Commit"}
          </button>
          <div ref={overflowRef} style={{ position: "relative" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowOverflow(!showOverflow); if (!showOverflow) git.refreshStashList(); }}
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              <MoreHorizontal size={14} strokeWidth={1.75} />
            </button>
            {showOverflow && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  zIndex: 100,
                  minWidth: 140,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                {[
                  { label: "Pull", action: () => git.pull(), disabled: disabled },
                  { label: "Push", action: () => git.push(), disabled: disabled },
                  { label: "Stash Changes", action: () => git.stashPush(), disabled: disabled || (git.changedFiles.length === 0 && git.untrackedFiles.length === 0) },
                  { label: "Pop Stash", action: () => git.stashPop(), disabled: disabled || git.stashEntries.length === 0 },
                  { label: "Stash List", action: () => setShowStashList(!showStashList), disabled: git.stashEntries.length === 0 },
                  { label: "Merge...", action: () => setMergeBranchPicker("merge"), disabled: disabled },
                  { label: "Rebase...", action: () => setMergeBranchPicker("rebase"), disabled: disabled },
                  {
                    label: "View Log",
                    action: () => {
                      const { addTab, activeGroupId } = useTabStore.getState();
                      addTab(activeGroupId, { id: `git-log-${Date.now()}`, type: "git-log", title: "Git Log" });
                      setShowOverflow(false);
                    },
                    disabled: false,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    onClick={() => { if (!item.disabled) { item.action(); setShowOverflow(false); } }}
                    style={{
                      padding: "6px 12px",
                      cursor: item.disabled ? "not-allowed" : "pointer",
                      color: item.disabled ? "var(--text-muted)" : "var(--text-primary)",
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "rgba(148,163,184,0.08)"; }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {mergeBranchPicker && (
          <div style={{ position: "relative", marginTop: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
              Select branch to {mergeBranchPicker}:
            </div>
            <BranchPicker
              excludeCurrent
              onSelect={(b) => {
                if (mergeBranchPicker === "merge") git.merge(b);
                else git.rebase(b);
                setMergeBranchPicker(null);
              }}
              onClose={() => setMergeBranchPicker(null)}
            />
          </div>
        )}
        {showStashList && git.stashEntries.length > 0 && (
          <div style={{
            position: "relative",
            marginTop: 6,
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            maxHeight: 180,
            overflow: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}>
            <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Stash List
            </div>
            {git.stashEntries.map((entry) => (
              <div
                key={entry.index}
                style={{ display: "flex", alignItems: "center", padding: "4px 8px", gap: 8, fontSize: 12 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 11, flexShrink: 0 }}>
                  {entry.index}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.message}
                </span>
                <button
                  onClick={() => { git.stashPop(entry.index); setShowStashList(false); }}
                  title="Pop"
                  style={{ ...actionBtnStyle, fontSize: 11 }}
                >
                  Pop
                </button>
                <button
                  onClick={() => git.stashDrop(entry.index)}
                  title="Drop"
                  style={{ ...actionBtnStyle, color: "var(--git-deleted)", fontSize: 11 }}
                >
                  Drop
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {git.conflictedFiles.length > 0 && (
          <FileSection
            title="Conflicts"
            count={git.conflictedFiles.length}
            files={git.conflictedFiles}
            statusField="worktree_status"
            onOpenDiff={(f) => openDiff(f.path, false)}
            onStageFile={(f) => git.stageFiles([f.path])}
          />
        )}

        {git.stagedFiles.length > 0 && (
          <FileSection
            title="Staged Changes"
            count={git.stagedFiles.length}
            files={git.stagedFiles}
            statusField="index_status"
            onOpenDiff={(f) => openDiff(f.path, true)}
            onUnstageFile={(f) => git.unstageFiles([f.path])}
            onUnstageAll={() => git.unstageFiles(git.stagedFiles.map((f) => f.path))}
          />
        )}

        {git.changedFiles.length > 0 && (
          <FileSection
            title="Changes"
            count={git.changedFiles.length}
            files={git.changedFiles}
            statusField="worktree_status"
            onOpenDiff={(f) => openDiff(f.path, false)}
            onStageFile={(f) => git.stageFiles([f.path])}
            onStageAll={() => git.stageFiles(git.changedFiles.map((f) => f.path))}
            onDiscardFile={(f) => git.discardFile(f.path)}
          />
        )}

        {git.untrackedFiles.length > 0 && (
          <FileSection
            title="Untracked"
            count={git.untrackedFiles.length}
            files={git.untrackedFiles}
            statusField="worktree_status"
            onOpenDiff={(f) => openDiff(f.path, false)}
            onStageFile={(f) => git.stageFiles([f.path])}
            onStageAll={() => git.stageFiles(git.untrackedFiles.map((f) => f.path))}
          />
        )}

        {git.stagedFiles.length === 0 && git.changedFiles.length === 0 && git.untrackedFiles.length === 0 && git.conflictedFiles.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>
            No changes
          </div>
        )}
      </div>
    </div>
  );
}

function FileSection({
  title,
  count,
  files,
  statusField,
  onOpenDiff,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
}: {
  title: string;
  count: number;
  files: GitFileStatus[];
  statusField: "index_status" | "worktree_status";
  onOpenDiff: (f: GitFileStatus) => void;
  onStageFile?: (f: GitFileStatus) => void;
  onUnstageFile?: (f: GitFileStatus) => void;
  onDiscardFile?: (f: GitFileStatus) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
}) {
  return (
    <>
      <div style={{ padding: "10px 12px 2px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontFamily: "system-ui", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title} <span style={{ color: "var(--text-muted)" }}>({count})</span>
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {onStageAll && (
            <button onClick={onStageAll} title="Stage all" style={actionBtnStyle}>+</button>
          )}
          {onUnstageAll && (
            <button onClick={onUnstageAll} title="Unstage all" style={actionBtnStyle}>−</button>
          )}
        </div>
      </div>
      <div style={{ padding: "2px 12px" }}>
        {files.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            statusField={statusField}
            onOpenDiff={() => onOpenDiff(f)}
            onStage={onStageFile ? () => onStageFile(f) : undefined}
            onUnstage={onUnstageFile ? () => onUnstageFile(f) : undefined}
            onDiscard={onDiscardFile ? () => onDiscardFile(f) : undefined}
          />
        ))}
      </div>
    </>
  );
}
