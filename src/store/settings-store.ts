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
    id: "one-dark",
    name: "One Dark",
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
    id: "dracula",
    name: "Dracula",
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
    id: "monokai",
    name: "Monokai",
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
    id: "github-light",
    name: "GitHub Light",
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
  backgroundBlur: number;
  colorTheme: string;

  setBorderRadius: (v: number) => void;
  setAppOpacity: (v: number) => void;
  setBackgroundBlur: (v: number) => void;
  setColorTheme: (id: string) => void;
  loadFromConfig: () => Promise<void>;
  save: () => Promise<void>;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyTheme(themeId: string) {
  const theme = themes.find((t) => t.id === themeId) ?? themes[0];
  const root = document.documentElement;
  const c = theme.colors;
  const opacity = useSettingsStore?.getState?.()?.appOpacity ?? 1;
  root.style.setProperty("--bg-primary-raw", c.bgPrimary);
  root.style.setProperty("--bg-secondary-raw", c.bgSecondary);
  root.style.setProperty("--bg-tertiary-raw", c.bgTertiary);
  root.style.setProperty("--bg-primary", hexToRgba(c.bgPrimary, opacity));
  root.style.setProperty("--bg-secondary", hexToRgba(c.bgSecondary, opacity));
  root.style.setProperty("--bg-tertiary", hexToRgba(c.bgTertiary, opacity));
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
  const root = document.documentElement;
  const rootEl = document.getElementById("root");
  if (rootEl) rootEl.style.opacity = "";
  const primary = root.style.getPropertyValue("--bg-primary-raw").trim() || "#0f172a";
  const secondary = root.style.getPropertyValue("--bg-secondary-raw").trim() || "#1e293b";
  const tertiary = root.style.getPropertyValue("--bg-tertiary-raw").trim() || "#0b1120";
  root.style.setProperty("--bg-primary", hexToRgba(primary, opacity));
  root.style.setProperty("--bg-secondary", hexToRgba(secondary, opacity));
  root.style.setProperty("--bg-tertiary", hexToRgba(tertiary, opacity));
  root.classList.toggle("transparent-mode", opacity < 1);
  invoke("set_vibrancy", { enabled: opacity < 1 }).catch(() => {});
}

function applyBlur(blur: number) {
  document.documentElement.style.setProperty("--background-blur", `${blur}px`);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  borderRadius: 10,
  appOpacity: 1.0,
  backgroundBlur: 0,
  colorTheme: "one-dark",

  setBorderRadius: (v) => {
    set({ borderRadius: v });
    applyBorderRadius(v);
  },

  setAppOpacity: (v) => {
    set({ appOpacity: v });
    applyOpacity(v);
  },

  setBackgroundBlur: (v) => {
    set({ backgroundBlur: v });
    applyBlur(v);
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
        background_blur: number;
        color_theme: string;
      }>("load_config");

      const sidebar = useSidebarStore.getState();
      sidebar.setPosition(config.sidebar_position as "left" | "right");
      if (config.sidebar_visible !== sidebar.visible) sidebar.toggle();

      set({
        borderRadius: config.border_radius,
        appOpacity: config.app_opacity,
        backgroundBlur: config.background_blur ?? 0,
        colorTheme: config.color_theme,
      });

      applyTheme(config.color_theme);
      applyBorderRadius(config.border_radius);
      applyOpacity(config.app_opacity);
      applyBlur(config.background_blur ?? 0);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  },

  save: async () => {
    try {
      const { borderRadius, appOpacity, backgroundBlur, colorTheme } = get();
      const sidebar = useSidebarStore.getState();
      const config = {
        sidebar_position: sidebar.position,
        sidebar_visible: sidebar.visible,
        font_size: 14,
        font_family: "SF Mono, Menlo, Monaco, monospace",
        border_radius: borderRadius,
        app_opacity: appOpacity,
        background_blur: backgroundBlur,
        color_theme: colorTheme,
        recent_projects: [],
      };
      await invoke("save_config", { config });
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  },
}));
