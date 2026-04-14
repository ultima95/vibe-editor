import { create } from "zustand";

interface AppStore {
  workspaceRoot: string | null;
  setWorkspaceRoot: (path: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  workspaceRoot: null,
  setWorkspaceRoot: (workspaceRoot) => set({ workspaceRoot }),
}));
