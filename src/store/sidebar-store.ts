import { create } from "zustand";

interface SidebarStore {
  visible: boolean;
  position: "left" | "right";
  width: number;
  activePanel: "files" | "search" | "git";
  searchQuery: string;
  revealRequested: boolean;
  toggle: () => void;
  setPosition: (position: "left" | "right") => void;
  setWidth: (width: number) => void;
  setActivePanel: (panel: "files" | "search" | "git") => void;
  setSearchQuery: (query: string) => void;
  requestReveal: () => void;
  clearReveal: () => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  visible: true,
  position: "left",
  width: 240,
  activePanel: "files",
  searchQuery: "",
  revealRequested: false,
  toggle: () => set((s) => {
    const nextVisible = !s.visible;
    // Auto-request reveal when opening sidebar on files panel
    return { visible: nextVisible, revealRequested: nextVisible && s.activePanel === "files" };
  }),
  setPosition: (position) => set({ position }),
  setWidth: (width) => set({ width: Math.max(180, Math.min(500, width)) }),
  setActivePanel: (activePanel) => set({
    activePanel,
    // Request reveal when switching to files panel
    revealRequested: activePanel === "files",
  }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  requestReveal: () => set({ revealRequested: true }),
  clearReveal: () => set({ revealRequested: false }),
}));
