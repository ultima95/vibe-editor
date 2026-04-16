# Markdown Preview & Split Pane Improvements — Design Spec

## Overview

Two related features for Vibe Editor: (1) a toggle-based markdown preview within editor tabs, and (2) improvements to the existing split pane system to match VS Code-level usability. Both features build on the existing `Tab`, `TabGroup`, and `SplitNode` infrastructure without introducing new architectural patterns.

## Feature 1: Markdown Preview

### Goal

When a `.md` file is open, the user can toggle between the raw CodeMirror source view and a rendered HTML preview within the same tab. The preview supports GitHub-Flavored Markdown (GFM), syntax-highlighted code blocks, and Mermaid diagrams.

### Tab Model Changes

Add an optional `previewMode` boolean to the `Tab` interface:

```ts
export interface Tab {
  id: string;
  type: "terminal" | "editor" | "diff" | "git-log";
  title: string;
  ptyId?: string;
  filePath?: string;
  isDirty?: boolean;
  diffCached?: boolean;
  cwd?: string;
  previewMode?: boolean;  // NEW — toggles markdown preview
}
```

No new tab type. The `editor` type gains conditional rendering based on `previewMode` and whether the file extension is `.md` or `.markdown`.

### Toggle Mechanism

- **Button**: A toggle button in the `TabBar` component, visible only when the active tab is an editor tab with a `.md`/`.markdown` file. Shows a book icon + "Preview" label when in source mode; switches to a code icon + "Source" label when in preview mode. Positioned on the right side of the tab bar.
- **Keyboard shortcut**: `⌘⇧V` toggles `previewMode` on the active tab.
- **State**: Toggling flips `previewMode` in the tab store. The `EditorTab` component conditionally renders either the CodeMirror editor or a new `MarkdownPreview` component.

### MarkdownPreview Component

New file: `src/components/MarkdownPreview.tsx`

Responsibilities:
- Reads file content via `useFileSystem().readFile(filePath)`
- Parses markdown with `marked` (GFM mode enabled)
- Applies syntax highlighting to fenced code blocks via `highlight.js`
- Renders Mermaid code blocks (```mermaid) as inline diagrams via the `mermaid` library
- Wraps output in a scrollable container with theme-aware CSS

### Rendering Pipeline

1. `readFile(filePath)` → raw markdown string
2. `marked.parse(markdown)` → HTML string (with GFM tables, task lists, strikethrough, autolinks)
3. Code blocks get syntax highlighting via `marked`'s `highlight` option calling `hljs.highlightAuto()`
4. **Sanitize** the HTML output with `DOMPurify.sanitize()` to strip event handlers, script tags, and other dangerous markup. This is critical in a Tauri webview where unsanitized HTML could invoke native commands via `window.__TAURI__`.
5. Post-render: query DOM for `pre > code.language-mermaid` elements, replace with `mermaid.render()` output
6. Set `innerHTML` on the preview container (using `dangerouslySetInnerHTML` for the sanitized content, mermaid handled via `useEffect`)

### Theme-Aware Styling

The preview CSS uses CSS custom properties from the app's theme system (`var(--bg-primary)`, `var(--text-primary)`, etc.):

- Headings: `var(--text-primary)`, h1/h2 get a bottom border in `var(--border)`
- Body text: `var(--text-secondary)`
- Code blocks: `var(--bg-tertiary)` background with `var(--border)` border
- Tables: `var(--border)` for cell borders, `var(--text-primary)` for header text
- Links: `var(--accent)`
- Task list checkboxes: `var(--accent)` for checked state
- Max content width: 800px, centered, with 24px horizontal padding

### Libraries

| Library | Purpose | Size |
|---------|---------|------|
| `marked` | GFM markdown → HTML | ~40KB |
| `highlight.js` | Syntax highlighting for code blocks | ~30KB (core + common languages) |
| `mermaid` | Diagram rendering (flowchart, sequence, etc.) | ~1.5MB (lazy-loaded) |

Mermaid is large. It will be dynamically imported (`import('mermaid')`) only when a markdown file contains mermaid code blocks, avoiding impact on initial bundle size.

### EditorTab Changes

`EditorTab` wraps its CodeMirror view and the new `MarkdownPreview` in a conditional:

- When `previewMode` is `true` and file is `.md`: render `MarkdownPreview`, hide the CodeMirror container (preserve state via `display: none`).
- When `previewMode` is `false`: render CodeMirror as before.
- Non-markdown files ignore `previewMode` entirely.

### File Watching

When the file changes on disk (via the existing `fs-change` event), and the tab is in preview mode, re-read and re-render. This provides live preview when editing from an external tool.

---

## Feature 2: Split Pane Improvements

### Goal

Make the split pane system intuitive and full-featured: resizable dividers, keyboard shortcuts, a split button in the tab bar, and improved visual feedback when dragging tabs to split zones.

### Resizable Dividers

New component: `src/components/SplitDivider.tsx`

Replaces the static 1px `<div>` between split panes in `TabGroupManager.tsx`.

**Visual design:**
- Hit area: 5px wide (vertical) or tall (horizontal)
- Visual: 1px line in `var(--border)`, with a small 3px × 32px grab indicator centered on hover
- Hover state: divider line changes to `var(--accent)` color, cursor changes to `col-resize` (vertical) or `row-resize` (horizontal)

**Drag behavior:**
- `onMouseDown` on the divider starts tracking. `mousemove` on `document` updates the `ratio` on the corresponding `SplitNode` in the tab store. `mouseup` ends tracking.
- Ratio is clamped to enforce a minimum pane size of 100px. The clamped range is calculated from the parent container's dimensions.
- During drag, the panes get `pointer-events: none` to prevent the editor/terminal from capturing mouse events.

**Double-click:** Resets the ratio to 0.5 (50/50 split).

### Tab Store Changes

Add a new action to `TabStore`:

```ts
togglePreviewMode: (groupId: string, tabId: string) => void;
setSplitRatio: (groupId: string, ratio: number) => void;
```

`togglePreviewMode` flips the `previewMode` boolean on the specified tab within the given group.

`setSplitRatio` finds the `SplitNode` containing the given `groupId` and updates its `ratio`. The `SplitDivider` calls this during drag.

Also add a helper to find the `SplitNode` parent of a given group:

```ts
findParentSplit: (groupId: string) => { node: SplitNode; path: number[] } | null;
```

### Keyboard Shortcuts

Registered in `AppShell.tsx` via `useEffect` keydown listener:

| Shortcut | Action | Implementation |
|----------|--------|----------------|
| `⌘\` | Split active tab right | Calls `splitGroup(activeGroupId, 'vertical', duplicateTab)` |
| `⌘⇧\` | Split active tab down | Calls `splitGroup(activeGroupId, 'horizontal', duplicateTab)` |
| `⌘⇧V` | Toggle markdown preview | Calls `togglePreviewMode(activeGroupId, activeTabId)` (only for `.md` files) |

`duplicateTab` creates a copy of the active tab:
- **Editor tab**: new tab with the same `filePath` (both panes edit the same file independently)
- **Terminal tab**: new terminal tab (fresh terminal, not a clone)
- **Diff/git-log tabs**: new tab of the same type with same parameters

### Split Button in TabBar

A small split icon button added to the right side of `TabBar`, next to the markdown preview toggle (when present):

- **Click**: Split the active tab right (vertical)
- **Right-click / context menu**: Show options — "Split Right", "Split Down"
- **Icon**: A rectangle with a vertical line through the middle (standard split icon)
- Visible for all tab types

### Improved Drop Zones

Changes to `EdgeDropZone` in `TabGroupManager.tsx`:

1. **Larger zones**: Increase from 30px to 60px edge detection area
2. **Visual overlay**: When hovering with a dragged tab, show a semi-transparent blue overlay covering the half of the pane where the new split would appear (instead of just a border on the edge zone)
3. **Label**: Show "Drop to split right" / "Drop to split left" / "Drop to split below" text in the overlay center

---

## Component Summary

| Component | File | Status |
|-----------|------|--------|
| `MarkdownPreview` | `src/components/MarkdownPreview.tsx` | New |
| `SplitDivider` | `src/components/SplitDivider.tsx` | New |
| `EditorTab` | `src/components/EditorTab.tsx` | Modified — conditional preview rendering |
| `TabBar` | `src/components/TabBar.tsx` | Modified — preview toggle + split button |
| `TabGroup` | `src/components/TabGroup.tsx` | Modified — pass previewMode to EditorTab |
| `TabGroupManager` | `src/components/TabGroupManager.tsx` | Modified — SplitDivider, improved drop zones |
| `AppShell` | `src/components/AppShell.tsx` | Modified — keyboard shortcuts |
| `tab-store` | `src/store/tab-store.ts` | Modified — setSplitRatio, previewMode toggle |
| `types` | `src/types.ts` | Modified — previewMode on Tab |

## New Dependencies

```json
{
  "marked": "^15.x",
  "highlight.js": "^11.x",
  "mermaid": "^11.x",
  "dompurify": "^3.x"
}
```

No new dependencies for split pane — purely custom implementation.

## Error Handling

- **Markdown parse failure**: Show error message inline in the preview container with a "Switch to Source" button
- **Mermaid render failure**: Show the raw mermaid code in a code block with an error annotation
- **File read failure in preview**: Same error handling as existing EditorTab
- **Split resize edge cases**: Minimum 100px per pane; if window is too small, clamp ratio but don't collapse

## Testing Strategy

- Manual testing of markdown rendering with various GFM features (tables, task lists, code blocks, mermaid)
- Manual testing of split pane resize at different window sizes
- Verify keyboard shortcuts don't conflict with existing bindings
- Verify theme switching updates preview styling in real-time
- Verify mermaid lazy loading doesn't block initial render
