import { create } from "zustand";

interface SidebarStore {
  visible: boolean;
  position: "left" | "right";
  width: number;
  activePanel: "files" | "search";
  toggle: () => void;
  setPosition: (position: "left" | "right") => void;
  setWidth: (width: number) => void;
  setActivePanel: (panel: "files" | "search") => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  visible: true,
  position: "left",
  width: 240,
  activePanel: "files",
  toggle: () => set((s) => ({ visible: !s.visible })),
  setPosition: (position) => set({ position }),
  setWidth: (width) => set({ width: Math.max(180, Math.min(500, width)) }),
  setActivePanel: (activePanel) => set({ activePanel }),
}));
