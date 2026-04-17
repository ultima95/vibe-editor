import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "./app-store";
import { useToastStore } from "./toast-store";

export interface GitFileStatus {
  path: string;
  index_status: string;
  worktree_status: string;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  timestamp: string;
}

export interface LogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: string;
}

export interface CommitFile {
  path: string;
  status: string;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

interface GitStatusResult {
  is_git_repo: boolean;
  branch: string | null;
  has_upstream: boolean;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

interface GitStore {
  isGitRepo: boolean;
  gitAvailable: boolean;
  branch: string | null;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  stagedFiles: GitFileStatus[];
  changedFiles: GitFileStatus[];
  untrackedFiles: GitFileStatus[];
  conflictedFiles: GitFileStatus[];
  mergeInProgress: boolean;
  rebaseInProgress: boolean;
  stashEntries: StashEntry[];
  isLoading: boolean;
  operationInProgress: string | null;

  refreshStatus: () => Promise<void>;
  stageFiles: (paths: string[]) => Promise<void>;
  unstageFiles: (paths: string[]) => Promise<void>;
  discardFile: (path: string) => Promise<void>;
  commit: (message: string) => Promise<void>;
  initRepo: () => Promise<void>;
  push: () => Promise<void>;
  publishBranch: () => Promise<void>;
  pull: () => Promise<void>;
  stashPush: () => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashDrop: (index: number) => Promise<void>;
  refreshStashList: () => Promise<void>;
  merge: (branch: string) => Promise<void>;
  mergeAbort: () => Promise<void>;
  rebase: (branch: string) => Promise<void>;
  rebaseAbort: () => Promise<void>;
  rebaseContinue: () => Promise<void>;
  checkoutBranch: (branch: string) => Promise<void>;
  createBranch: (branch: string) => Promise<void>;
  deleteBranch: (branch: string) => Promise<void>;
}

function getWorkspaceRoot(): string {
  return useAppStore.getState().workspaceRoot ?? "";
}

function toast(message: string, type: "info" | "success" | "error") {
  useToastStore.getState().addToast(message, type);
}

export const useGitStore = create<GitStore>((set, get) => ({
  isGitRepo: false,
  gitAvailable: true,
  branch: null,
  hasUpstream: false,
  ahead: 0,
  behind: 0,
  stagedFiles: [],
  changedFiles: [],
  untrackedFiles: [],
  conflictedFiles: [],
  mergeInProgress: false,
  rebaseInProgress: false,
  stashEntries: [],
  isLoading: false,
  operationInProgress: null,

  refreshStatus: async () => {
    const root = getWorkspaceRoot();
    if (!root) return;
    set({ isLoading: true });
    try {
      const result = await invoke<GitStatusResult>("git_status", { workspaceRoot: root });
      const staged: GitFileStatus[] = [];
      const changed: GitFileStatus[] = [];
      const untracked: GitFileStatus[] = [];
      const conflicted: GitFileStatus[] = [];

      for (const f of result.files) {
        if (f.index_status === "Conflicted" || f.worktree_status === "Conflicted") {
          conflicted.push(f);
        } else if (f.index_status === "Untracked") {
          untracked.push(f);
        } else {
          if (f.index_status !== "Unmodified") staged.push(f);
          if (f.worktree_status !== "Unmodified") changed.push(f);
        }
      }

      set({
        isGitRepo: result.is_git_repo,
        gitAvailable: true,
        branch: result.branch,
        hasUpstream: result.has_upstream,
        ahead: result.ahead,
        behind: result.behind,
        stagedFiles: staged,
        changedFiles: changed,
        untrackedFiles: untracked,
        conflictedFiles: conflicted,
        isLoading: false,
      });
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("not found")) {
        set({ gitAvailable: false, isLoading: false });
      } else if (errStr.includes("not a git repository")) {
        set({ isGitRepo: false, isLoading: false, gitAvailable: true });
      } else {
        set({ isLoading: false });
      }
    }
  },

  stageFiles: async (paths) => {
    set({ operationInProgress: "staging" });
    try {
      await invoke("git_stage", { workspaceRoot: getWorkspaceRoot(), paths });
      await get().refreshStatus();
    } catch (err) {
      toast(`Stage failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  unstageFiles: async (paths) => {
    set({ operationInProgress: "unstaging" });
    try {
      await invoke("git_unstage", { workspaceRoot: getWorkspaceRoot(), paths });
      await get().refreshStatus();
    } catch (err) {
      toast(`Unstage failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  discardFile: async (path) => {
    set({ operationInProgress: "discarding" });
    try {
      await invoke("git_discard", { workspaceRoot: getWorkspaceRoot(), path });
      await get().refreshStatus();
    } catch (err) {
      toast(`Discard failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  commit: async (message) => {
    set({ operationInProgress: "committing" });
    try {
      await invoke("git_commit", { workspaceRoot: getWorkspaceRoot(), message });
      toast("Changes committed", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Commit failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  initRepo: async () => {
    try {
      await invoke("git_init", { workspaceRoot: getWorkspaceRoot() });
      toast("Initialized git repository", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Init failed: ${err}`, "error");
    }
  },

  push: async () => {
    set({ operationInProgress: "pushing" });
    try {
      await invoke<string>("git_push", { workspaceRoot: getWorkspaceRoot() });
      toast("Pushed to remote", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Push failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  publishBranch: async () => {
    const branch = get().branch;
    if (!branch) return;
    set({ operationInProgress: "publishing" });
    try {
      await invoke<string>("git_publish_branch", { workspaceRoot: getWorkspaceRoot(), branch });
      toast("Branch published to remote", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Publish failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  pull: async () => {
    set({ operationInProgress: "pulling" });
    try {
      await invoke<string>("git_pull", { workspaceRoot: getWorkspaceRoot() });
      toast("Pulled from remote", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Pull failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  stashPush: async () => {
    set({ operationInProgress: "stashing" });
    try {
      await invoke("git_stash_push", { workspaceRoot: getWorkspaceRoot() });
      toast("Changes stashed", "success");
      await get().refreshStatus();
      await get().refreshStashList();
    } catch (err) {
      toast(`Stash failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  stashPop: async (index) => {
    set({ operationInProgress: "popping stash" });
    try {
      await invoke("git_stash_pop", { workspaceRoot: getWorkspaceRoot(), index: index ?? null });
      toast("Stash applied", "success");
      await get().refreshStatus();
      await get().refreshStashList();
    } catch (err) {
      toast(`Stash pop failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  stashDrop: async (index) => {
    try {
      await invoke("git_stash_drop", { workspaceRoot: getWorkspaceRoot(), index });
      await get().refreshStashList();
    } catch (err) {
      toast(`Stash drop failed: ${err}`, "error");
    }
  },

  refreshStashList: async () => {
    try {
      const entries = await invoke<StashEntry[]>("git_stash_list", { workspaceRoot: getWorkspaceRoot() });
      set({ stashEntries: entries });
    } catch {
      set({ stashEntries: [] });
    }
  },

  merge: async (branch) => {
    set({ operationInProgress: "merging" });
    try {
      await invoke<string>("git_merge", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Merged ${branch}`, "success");
      set({ mergeInProgress: false });
      await get().refreshStatus();
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("CONFLICT") || errStr.includes("conflict")) {
        set({ mergeInProgress: true });
        toast("Merge conflict — resolve conflicts and commit, or abort", "error");
      } else {
        toast(`Merge failed: ${err}`, "error");
      }
      await get().refreshStatus();
    }
    set({ operationInProgress: null });
  },

  mergeAbort: async () => {
    try {
      await invoke("git_merge_abort", { workspaceRoot: getWorkspaceRoot() });
      set({ mergeInProgress: false });
      toast("Merge aborted", "info");
      await get().refreshStatus();
    } catch (err) {
      toast(`Abort failed: ${err}`, "error");
    }
  },

  rebase: async (branch) => {
    set({ operationInProgress: "rebasing" });
    try {
      await invoke<string>("git_rebase", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Rebased onto ${branch}`, "success");
      set({ rebaseInProgress: false });
      await get().refreshStatus();
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("CONFLICT") || errStr.includes("conflict")) {
        set({ rebaseInProgress: true });
        toast("Rebase conflict — resolve conflicts, stage, and continue", "error");
      } else {
        toast(`Rebase failed: ${err}`, "error");
      }
      await get().refreshStatus();
    }
    set({ operationInProgress: null });
  },

  rebaseAbort: async () => {
    try {
      await invoke("git_rebase_abort", { workspaceRoot: getWorkspaceRoot() });
      set({ rebaseInProgress: false });
      toast("Rebase aborted", "info");
      await get().refreshStatus();
    } catch (err) {
      toast(`Abort failed: ${err}`, "error");
    }
  },

  rebaseContinue: async () => {
    set({ operationInProgress: "continuing rebase" });
    try {
      await invoke("git_rebase_continue", { workspaceRoot: getWorkspaceRoot() });
      set({ rebaseInProgress: false });
      toast("Rebase continued", "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Continue failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  checkoutBranch: async (branch) => {
    set({ operationInProgress: "switching branch" });
    try {
      await invoke("git_checkout_branch", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Switched to ${branch}`, "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Switch failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  createBranch: async (branch) => {
    set({ operationInProgress: "creating branch" });
    try {
      await invoke("git_create_branch", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Created branch ${branch}`, "success");
      await get().refreshStatus();
    } catch (err) {
      toast(`Create branch failed: ${err}`, "error");
    }
    set({ operationInProgress: null });
  },

  deleteBranch: async (branch) => {
    try {
      await invoke("git_delete_branch", { workspaceRoot: getWorkspaceRoot(), branch });
      toast(`Deleted branch ${branch}`, "success");
    } catch (err) {
      toast(`Delete branch failed: ${err}`, "error");
    }
  },
}));
