import { create } from "zustand";

interface AppStore {
  workspaceRoot: string | null;
  recentProjects: string[];
  setWorkspaceRoot: (path: string) => void;
  setRecentProjects: (projects: string[]) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  workspaceRoot: null,
  recentProjects: [],
  setWorkspaceRoot: (workspaceRoot) => set({ workspaceRoot }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),
}));
