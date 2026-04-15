# Code Editor Syntax Themes

## Problem

The vibe-editor has a UI color theme system with 6 themes (Midnight, Abyss, GitHub Dark, Rosé Pine, Emerald, Light) that controls app chrome colors. However, the CodeMirror code editor is hardcoded to use the `oneDark` theme regardless of which UI theme is selected. This creates a visual disconnect — switching to the Light UI theme leaves the editor dark.

## Solution

Pair each UI color theme with a matching CodeMirror syntax highlighting theme. When the user changes the app color theme, the code editor syntax colors change with it. One setting controls both — no separate code theme picker.

## Dependency

Add `@uiw/codemirror-themes-all` — a package providing pre-built CodeMirror 6 themes including One Dark, Monokai, Ayu, Dracula, Solarized, and GitHub variants.

## Theme Pairings

| UI Theme     | Code Editor Theme |
|--------------|-------------------|
| Midnight     | One Dark          |
| Abyss        | Ayu Dark          |
| GitHub Dark  | GitHub Dark       |
| Rosé Pine    | Dracula           |
| Emerald      | Monokai           |
| Light        | GitHub Light      |

## Architecture

### New File: `src/editor-themes.ts`

A theme registry that maps UI theme IDs to CodeMirror extensions:

- Imports the 6 needed themes from `@uiw/codemirror-themes-all`
- Exports a `codeThemeMap: Record<string, Extension>` mapping UI theme IDs (e.g., `"midnight"`) to their paired CodeMirror theme extension
- Exports a `getCodeTheme(uiThemeId: string): Extension` helper that looks up the map and defaults to One Dark

### Modified File: `src/components/EditorTab.tsx`

Replace the hardcoded `oneDark` import with a dynamic compartment-based approach:

1. **Compartment**: Create a `themeCompartment = new Compartment()` outside the component (module-level) for the syntax highlighting theme
2. **Initial mount**: When creating the `EditorState`, wrap the code theme in `themeCompartment.of(getCodeTheme(currentThemeId))` instead of using `oneDark` directly
3. **Live updates**: Subscribe to `useSettingsStore` — when `colorTheme` changes, dispatch a reconfigure effect: `view.dispatch({ effects: themeCompartment.reconfigure(getCodeTheme(newThemeId)) })`

This approach hot-swaps themes without destroying the editor instance, preserving cursor position, scroll position, and undo history.

### Unchanged Files

- **`src/store/settings-store.ts`** — No changes. The existing `colorTheme` field and `setColorTheme` action already handle persistence and CSS variable updates. The code theme is derived from the same ID.
- **`src/components/SettingsModal.tsx`** — No changes. The existing Color Theme picker grid continues to work as-is.
- **Tauri config** — No changes. The `color_theme` config field already persists the theme ID that now drives both UI and editor themes.

## Data Flow

```
User clicks theme in Settings
  → setColorTheme("rose-pine")
    → settings-store applies CSS variables (existing behavior)
    → EditorTab subscription fires
      → getCodeTheme("rose-pine") returns Dracula extension
      → themeCompartment.reconfigure(draculaExtension)
        → CodeMirror updates syntax colors instantly
```

## Scope Boundaries

**In scope:**
- Pairing each UI theme with a code editor theme
- Hot-swapping code themes via CodeMirror compartments
- Installing `@uiw/codemirror-themes-all`

**Out of scope:**
- Independent code theme picker
- Custom/user-defined themes
- Theme preview in settings
- Per-file theme overrides
