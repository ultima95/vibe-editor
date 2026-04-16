# Code Editor Syntax Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair each UI color theme with a matching CodeMirror syntax highlighting theme so the editor colors change when the user switches themes.

**Architecture:** A new `src/editor-themes.ts` registry maps UI theme IDs to CodeMirror theme extensions. `EditorTab.tsx` uses a CodeMirror `Compartment` to hot-swap the syntax theme when the settings store changes, without destroying the editor instance.

**Tech Stack:** CodeMirror 6, `@uiw/codemirror-themes-all`, `@codemirror/state` (Compartment), Zustand

**Spec:** `docs/superpowers/specs/2026-04-15-code-editor-themes-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `@uiw/codemirror-themes-all` dependency |
| `src/editor-themes.ts` | Create | Theme registry — maps UI theme IDs to CodeMirror extensions |
| `src/components/EditorTab.tsx` | Modify | Replace hardcoded `oneDark` with compartment-based dynamic theme |

## Theme Pairings (updated from spec)

| UI Theme ID | UI Theme Name | CodeMirror Theme | Import Name |
|-------------|---------------|------------------|-------------|
| `midnight` | Midnight | One Dark | `oneDark` from `@codemirror/theme-one-dark` |
| `abyss` | Abyss | Abyss | `abyss` from `@uiw/codemirror-themes-all` |
| `github-dark` | GitHub Dark | GitHub Dark | `githubDark` from `@uiw/codemirror-themes-all` |
| `rose-pine` | Rosé Pine | Dracula | `dracula` from `@uiw/codemirror-themes-all` |
| `emerald` | Emerald | Monokai | `monokai` from `@uiw/codemirror-themes-all` |
| `light` | Light | GitHub Light | `githubLight` from `@uiw/codemirror-themes-all` |

> **Note:** The spec originally said "Ayu Dark" for Abyss, but `@uiw/codemirror-themes-all` does not include an Ayu theme. The package does include an `abyss` theme which is a better match for the Abyss UI theme.

---

### Task 1: Install dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `@uiw/codemirror-themes-all`**

```bash
cd /Users/ultima/Workspace/vibe-editor && npm install @uiw/codemirror-themes-all
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/ultima/Workspace/vibe-editor && node -e "require('@uiw/codemirror-themes-all')" 2>&1 || echo "ESM-only, check node_modules exists" && ls node_modules/@uiw/codemirror-themes-all/package.json
```

Expected: The package directory exists in `node_modules`.

- [ ] **Step 3: Commit**

```bash
cd /Users/ultima/Workspace/vibe-editor
git add package.json package-lock.json
git commit -m "chore: add @uiw/codemirror-themes-all dependency"
```

---

### Task 2: Create editor theme registry

**Files:**
- Create: `src/editor-themes.ts`

- [ ] **Step 1: Create the theme registry file**

Create `src/editor-themes.ts` with this content:

```typescript
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  abyss,
  githubDark,
  dracula,
  monokai,
  githubLight,
} from "@uiw/codemirror-themes-all";

export interface CodeTheme {
  id: string;
  name: string;
  extension: Extension;
}

const codeThemeMap: Record<string, Extension> = {
  midnight: oneDark,
  abyss: abyss,
  "github-dark": githubDark,
  "rose-pine": dracula,
  emerald: monokai,
  light: githubLight,
};

export function getCodeTheme(uiThemeId: string): Extension {
  return codeThemeMap[uiThemeId] ?? oneDark;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/ultima/Workspace/vibe-editor && npx tsc --noEmit src/editor-themes.ts 2>&1 | head -20
```

Expected: No errors (or only unrelated pre-existing errors).

- [ ] **Step 3: Commit**

```bash
cd /Users/ultima/Workspace/vibe-editor
git add src/editor-themes.ts
git commit -m "feat: add editor theme registry mapping UI themes to CodeMirror themes"
```

---

### Task 3: Wire up dynamic theme in EditorTab

**Files:**
- Modify: `src/components/EditorTab.tsx:1-14` (imports)
- Modify: `src/components/EditorTab.tsx:80-94` (editor state creation)

This task replaces the hardcoded `oneDark` with a `Compartment`-based dynamic theme and subscribes to settings store changes for live hot-swapping.

- [ ] **Step 1: Update imports in EditorTab.tsx**

Replace the existing import block (lines 1–13) with:

```typescript
import { useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { useFileSystem } from "../hooks/use-file-system";
import { useTabStore } from "../store/tab-store";
import { useSettingsStore } from "../store/settings-store";
import { getCodeTheme } from "../editor-themes";
```

Changes from original:
- **Removed:** `import { oneDark } from "@codemirror/theme-one-dark";`
- **Added:** `Compartment` to the `@codemirror/state` import
- **Added:** `import { useSettingsStore } from "../store/settings-store";`
- **Added:** `import { getCodeTheme } from "../editor-themes";`

- [ ] **Step 2: Add module-level compartment**

Add this line after the imports, before the `EditorTabProps` interface (after line 13 in the new imports):

```typescript
const themeCompartment = new Compartment();
```

- [ ] **Step 3: Replace hardcoded oneDark in editor state creation**

In the `useEffect` that creates the `EditorState` (the "Phase 2" effect), replace the extensions array. Change this block (original lines 80–111):

```typescript
    const state = EditorState.create({
      doc: fileContent,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        getLanguageExtension(filePath),
        oneDark,
        EditorView.theme({
          "&": { height: "100%", background: "var(--bg-primary)" },
          ".cm-scroller": {
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
            fontSize: "14px",
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            useTabStore.setState((s) => ({
              groups: {
                ...s.groups,
                [groupId]: {
                  ...s.groups[groupId],
                  tabs: s.groups[groupId].tabs.map((t) =>
                    t.id === tabId ? { ...t, isDirty: true } : t
                  ),
                },
              },
            }));
          }
        }),
      ],
    });
```

To this:

```typescript
    const currentThemeId = useSettingsStore.getState().colorTheme;

    const state = EditorState.create({
      doc: fileContent,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        getLanguageExtension(filePath),
        themeCompartment.of(getCodeTheme(currentThemeId)),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": {
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
            fontSize: "14px",
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            useTabStore.setState((s) => ({
              groups: {
                ...s.groups,
                [groupId]: {
                  ...s.groups[groupId],
                  tabs: s.groups[groupId].tabs.map((t) =>
                    t.id === tabId ? { ...t, isDirty: true } : t
                  ),
                },
              },
            }));
          }
        }),
      ],
    });
```

Changes:
- **Added:** `const currentThemeId = useSettingsStore.getState().colorTheme;` before `EditorState.create`
- **Replaced:** `oneDark,` → `themeCompartment.of(getCodeTheme(currentThemeId)),`
- **Removed:** `background: "var(--bg-primary)"` from the `EditorView.theme` `"&"` rule (the code theme's native background takes effect instead)

- [ ] **Step 4: Add settings store subscription for live theme switching**

Add a new `useEffect` after the existing "Phase 2" effect (after the editor mount effect's closing `}, [fileContent, filePath, groupId, tabId]);`). Insert this block:

```typescript
  // Phase 3: Subscribe to theme changes for live hot-swap
  useEffect(() => {
    const unsubscribe = useSettingsStore.subscribe(
      (state) => state.colorTheme,
      (themeId) => {
        viewRef.current?.dispatch({
          effects: themeCompartment.reconfigure(getCodeTheme(themeId)),
        });
      }
    );
    return () => unsubscribe();
  }, []);
```

This subscribes to just the `colorTheme` slice of the settings store using Zustand's `subscribe` with a selector. When the theme changes, it dispatches a reconfigure effect to hot-swap the CodeMirror theme without destroying the editor.

- [ ] **Step 5: Verify the project compiles**

```bash
cd /Users/ultima/Workspace/vibe-editor && npx tsc --noEmit 2>&1 | head -30
```

Expected: No new errors introduced.

- [ ] **Step 6: Verify the project builds**

```bash
cd /Users/ultima/Workspace/vibe-editor && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/ultima/Workspace/vibe-editor
git add src/components/EditorTab.tsx
git commit -m "feat: dynamic code editor themes paired with UI color themes

Replace hardcoded oneDark with compartment-based dynamic theme.
Each UI theme now has a matching CodeMirror syntax theme that
hot-swaps when the user changes themes in settings."
```
