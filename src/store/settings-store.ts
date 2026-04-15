import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useSidebarStore } from "./sidebar-store";

export interface ColorTheme {
  id: string;
  name: string;
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    success: string;
    warning: string;
    error: string;
    gitAdded: string;
    gitModified: string;
    gitDeleted: string;
    gitUntracked: string;
    gitConflicted: string;
  };
}

export const themes: ColorTheme[] = [
  {
    id: "midnight",
    name: "Midnight",
    colors: {
      bgPrimary: "#0f172a",
      bgSecondary: "#1e293b",
      bgTertiary: "#0b1120",
      border: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#e2e8f0",
      textSecondary: "#94a3b8",
      textMuted: "#475569",
      accent: "#3b82f6",
      accentHover: "#2563eb",
      success: "#22c55e",
      warning: "#eab308",
      error: "#ef4444",
      gitAdded: "#4ade80",
      gitModified: "#facc15",
      gitDeleted: "#f87171",
      gitUntracked: "#94a3b8",
      gitConflicted: "#fb923c",
    },
  },
  {
    id: "abyss",
    name: "Abyss",
    colors: {
      bgPrimary: "#000c18",
      bgSecondary: "#051336",
      bgTertiary: "#00060f",
      border: "rgba(56, 120, 200, 0.15)",
      textPrimary: "#bbdbfe",
      textSecondary: "#6b93b8",
      textMuted: "#384d68",
      accent: "#6796e6",
      accentHover: "#4080d0",
      success: "#22c55e",
      warning: "#e5c07b",
      error: "#f44747",
      gitAdded: "#4ade80",
      gitModified: "#e5c07b",
      gitDeleted: "#f44747",
      gitUntracked: "#6b93b8",
      gitConflicted: "#ff9e64",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    colors: {
      bgPrimary: "#0d1117",
      bgSecondary: "#161b22",
      bgTertiary: "#010409",
      border: "rgba(240, 246, 252, 0.1)",
      textPrimary: "#e6edf3",
      textSecondary: "#8b949e",
      textMuted: "#484f58",
      accent: "#58a6ff",
      accentHover: "#388bfd",
      success: "#3fb950",
      warning: "#d29922",
      error: "#f85149",
      gitAdded: "#3fb950",
      gitModified: "#d29922",
      gitDeleted: "#f85149",
      gitUntracked: "#8b949e",
      gitConflicted: "#db6d28",
    },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    colors: {
      bgPrimary: "#191724",
      bgSecondary: "#1f1d2e",
      bgTertiary: "#13111e",
      border: "rgba(110, 106, 134, 0.2)",
      textPrimary: "#e0def4",
      textSecondary: "#908caa",
      textMuted: "#6e6a86",
      accent: "#c4a7e7",
      accentHover: "#b490d4",
      success: "#9ccfd8",
      warning: "#f6c177",
      error: "#eb6f92",
      gitAdded: "#9ccfd8",
      gitModified: "#f6c177",
      gitDeleted: "#eb6f92",
      gitUntracked: "#908caa",
      gitConflicted: "#ebbcba",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    colors: {
      bgPrimary: "#0a1a14",
      bgSecondary: "#122a20",
      bgTertiary: "#06120d",
      border: "rgba(52, 211, 153, 0.12)",
      textPrimary: "#d1fae5",
      textSecondary: "#6ee7b7",
      textMuted: "#3b7a5e",
      accent: "#34d399",
      accentHover: "#10b981",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#f87171",
      gitAdded: "#4ade80",
      gitModified: "#fbbf24",
      gitDeleted: "#f87171",
      gitUntracked: "#6ee7b7",
      gitConflicted: "#fb923c",
    },
  },
  {
    id: "light",
    name: "Light",
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f8fafc",
      bgTertiary: "#f1f5f9",
      border: "rgba(0, 0, 0, 0.08)",
      textPrimary: "#1e293b",
      textSecondary: "#64748b",
      textMuted: "#94a3b8",
      accent: "#2563eb",
      accentHover: "#1d4ed8",
      success: "#16a34a",
      warning: "#ca8a04",
      error: "#dc2626",
      gitAdded: "#16a34a",
      gitModified: "#ca8a04",
      gitDeleted: "#dc2626",
      gitUntracked: "#64748b",
      gitConflicted: "#ea580c",
    },
  },
];

export interface SettingsState {
  borderRadius: number;
  appOpacity: number;
  colorTheme: string;

  setBorderRadius: (v: number) => void;
  setAppOpacity: (v: number) => void;
  setColorTheme: (id: string) => void;
  loadFromConfig: () => Promise<void>;
  save: () => Promise<void>;
}

function applyTheme(themeId: string) {
  const theme = themes.find((t) => t.id === themeId) ?? themes[0];
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty("--bg-primary", c.bgPrimary);
  root.style.setProperty("--bg-secondary", c.bgSecondary);
  root.style.setProperty("--bg-tertiary", c.bgTertiary);
  root.style.setProperty("--border", c.border);
  root.style.setProperty("--text-primary", c.textPrimary);
  root.style.setProperty("--text-secondary", c.textSecondary);
  root.style.setProperty("--text-muted", c.textMuted);
  root.style.setProperty("--accent", c.accent);
  root.style.setProperty("--accent-hover", c.accentHover);
  root.style.setProperty("--success", c.success);
  root.style.setProperty("--warning", c.warning);
  root.style.setProperty("--error", c.error);
  root.style.setProperty("--git-added", c.gitAdded);
  root.style.setProperty("--git-modified", c.gitModified);
  root.style.setProperty("--git-deleted", c.gitDeleted);
  root.style.setProperty("--git-untracked", c.gitUntracked);
  root.style.setProperty("--git-conflicted", c.gitConflicted);
}

function applyBorderRadius(px: number) {
  const root = document.getElementById("root");
  if (root) root.style.borderRadius = `${px}px`;
}

function applyOpacity(opacity: number) {
  const root = document.getElementById("root");
  if (root) root.style.opacity = `${opacity}`;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  borderRadius: 10,
  appOpacity: 1.0,
  colorTheme: "midnight",

  setBorderRadius: (v) => {
    set({ borderRadius: v });
    applyBorderRadius(v);
  },

  setAppOpacity: (v) => {
    set({ appOpacity: v });
    applyOpacity(v);
  },

  setColorTheme: (id) => {
    set({ colorTheme: id });
    applyTheme(id);
  },

  loadFromConfig: async () => {
    try {
      const config = await invoke<{
        sidebar_position: string;
        sidebar_visible: boolean;
        border_radius: number;
        app_opacity: number;
        color_theme: string;
      }>("load_config");

      const sidebar = useSidebarStore.getState();
      sidebar.setPosition(config.sidebar_position as "left" | "right");
      if (config.sidebar_visible !== sidebar.visible) sidebar.toggle();

      set({
        borderRadius: config.border_radius,
        appOpacity: config.app_opacity,
        colorTheme: config.color_theme,
      });

      applyTheme(config.color_theme);
      applyBorderRadius(config.border_radius);
      applyOpacity(config.app_opacity);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  },

  save: async () => {
    try {
      const { borderRadius, appOpacity, colorTheme } = get();
      const sidebar = useSidebarStore.getState();
      const config = {
        sidebar_position: sidebar.position,
        sidebar_visible: sidebar.visible,
        font_size: 14,
        font_family: "SF Mono, Menlo, Monaco, monospace",
        border_radius: borderRadius,
        app_opacity: appOpacity,
        color_theme: colorTheme,
        recent_projects: [],
      };
      await invoke("save_config", { config });
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  },
}));
