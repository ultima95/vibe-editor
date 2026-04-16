# Markdown Preview & Split Pane Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-tab markdown preview (GFM + mermaid + syntax highlighting) and improve the split pane system with resizable dividers, keyboard shortcuts, a split button, and better drop zone UX.

**Architecture:** Both features extend the existing `Tab`/`SplitNode` infrastructure. Markdown preview adds a `MarkdownPreview` component conditionally rendered inside `EditorTab` when `previewMode` is true. Split pane improvements replace the static 1px divider with a draggable `SplitDivider` and wire up keyboard shortcuts + UI buttons for splitting. No new architectural patterns — just new components and store actions.

**Tech Stack:** React 19, TypeScript, Zustand, marked, highlight.js, mermaid, DOMPurify, Tauri 2

---

## File Structure

### New Files
- `src/components/MarkdownPreview.tsx` — Renders parsed markdown with GFM, syntax highlighting, mermaid diagrams, and theme-aware CSS
- `src/components/SplitDivider.tsx` — Draggable resize handle between split panes
- `src/styles/markdown-preview.css` — Theme-aware styles for rendered markdown content

### Modified Files
- `src/types.ts` — Add `previewMode?: boolean` to `Tab` interface
- `src/store/tab-store.ts` — Add `togglePreviewMode` and `setSplitRatio` actions, add `duplicateActiveTab` helper
- `src/components/EditorTab.tsx` — Conditionally render `MarkdownPreview` when `previewMode` is true for `.md` files
- `src/components/TabBar.tsx` — Add preview toggle button + split button on the right side
- `src/components/TabGroup.tsx` — Pass `previewMode` through to `EditorTab`
- `src/components/TabGroupManager.tsx` — Replace static divider with `SplitDivider`, improve `EdgeDropZone`
- `src/components/AppShell.tsx` — Register `⌘\`, `⌘⇧\`, `⌘⇧V` keyboard shortcuts

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install markdown + sanitization libraries**

```bash
cd /Users/ultima/Workspace/vibe-editor
npm install marked marked-highlight highlight.js dompurify mermaid
```

- [ ] **Step 2: Install type definitions for DOMPurify**

DOMPurify v3.x bundles its own types. Verify by checking that `node_modules/dompurify/dist/purify.d.ts` exists:

```bash
ls node_modules/dompurify/dist/purify.d.ts
```

If it doesn't exist, install `@types/dompurify`. Otherwise, skip.

- [ ] **Step 3: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add marked, marked-highlight, highlight.js, mermaid, dompurify dependencies"
```

---

### Task 2: Add `previewMode` to Tab Type and Store Actions

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store/tab-store.ts`

- [ ] **Step 1: Add `previewMode` to `Tab` interface**

In `src/types.ts`, add `previewMode?: boolean` to the `Tab` interface after the `cwd` field:

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
  previewMode?: boolean;
}
```

Also add an `id` field to the `SplitNode` interface to enable direct node identification for resize operations:

```ts
export interface SplitNode {
  id?: string;
  type: "leaf" | "split";
  direction?: SplitDirection;
  ratio?: number;
  groupId?: string;
  children?: SplitNode[];
}
```

- [ ] **Step 2: Add `togglePreviewMode` action to the store interface**

In `src/store/tab-store.ts`, add to the `TabStore` interface:

```ts
togglePreviewMode: (groupId: string, tabId: string) => void;
```

Also add an exported `duplicateTab` helper (above the `create<TabStore>` call, after `createTerminalTab`):

```ts
export function duplicateTab(tab: Tab): Tab {
  const id = `${tab.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (tab.type === "terminal") {
    return { id, type: "terminal", title: "Terminal", cwd: tab.cwd };
  }
  return { ...tab, id, isDirty: false, previewMode: false };
}
```

- [ ] **Step 3: Implement `togglePreviewMode`**

In the `create<TabStore>` body in `src/store/tab-store.ts`, add after `setActiveGroupId`:

```ts
togglePreviewMode: (groupId, tabId) =>
  set((s) => {
    const group = s.groups[groupId];
    if (!group) return s;
    return {
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          tabs: group.tabs.map((t) =>
            t.id === tabId ? { ...t, previewMode: !t.previewMode } : t
          ),
        },
      },
    };
  }),
```

- [ ] **Step 4: Add `setSplitRatio` action to the store interface**

In `src/store/tab-store.ts`, add to the `TabStore` interface:

```ts
setSplitRatio: (nodeId: string, ratio: number) => void;
```

- [ ] **Step 5: Add `updateNodeRatio` helper function**

Add this helper function above the `create<TabStore>` call (after the existing helper functions like `findAndReplace`, `removeLeaf`, `collectGroupIds`). This uses the `SplitNode.id` field for direct matching, avoiding the nested-split ambiguity that would occur with groupId-based lookup:

```ts
function updateNodeRatio(
  node: SplitNode,
  targetNodeId: string,
  ratio: number,
): SplitNode | null {
  if (node.type === "leaf") return null;

  // Direct match on this node's id
  if (node.id === targetNodeId) {
    return { ...node, ratio };
  }

  // Recurse into children
  if (!node.children) return null;
  for (let i = 0; i < node.children.length; i++) {
    const result = updateNodeRatio(node.children[i], targetNodeId, ratio);
    if (result) {
      const newChildren = [...node.children];
      newChildren[i] = result;
      return { ...node, children: newChildren };
    }
  }
  return null;
}

let nextSplitNodeId = 1;
```

- [ ] **Step 6: Implement `setSplitRatio`**

In the `create<TabStore>` body, add after `togglePreviewMode`:

```ts
setSplitRatio: (nodeId, ratio) =>
  set((s) => {
    const newLayout = updateNodeRatio(s.layout, nodeId, ratio);
    return newLayout ? { layout: newLayout } : s;
  }),
```

- [ ] **Step 7: Update `splitGroup` to assign IDs to split nodes**

In the existing `splitGroup` action in `src/store/tab-store.ts`, update the `splitNode` construction to include an `id`:

```ts
splitGroup: (groupId, direction, newTab, insertBefore) =>
  set((s) => {
    const newGroup = createGroup(newTab);
    const originalLeaf: SplitNode = { type: "leaf", groupId };
    const newLeaf: SplitNode = { type: "leaf", groupId: newGroup.id };
    const splitNode: SplitNode = {
      id: `split-${nextSplitNodeId++}`,
      type: "split",
      direction,
      ratio: 0.5,
      children: insertBefore
        ? [newLeaf, originalLeaf]
        : [originalLeaf, newLeaf],
    };

    const newLayout = findAndReplace(s.layout, groupId, splitNode) ?? s.layout;

    return {
      groups: { ...s.groups, [newGroup.id]: newGroup },
      layout: newLayout,
      activeGroupId: newGroup.id,
    };
  }),
```

- [ ] **Step 8: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/store/tab-store.ts
git commit -m "feat: add previewMode to Tab, SplitNode ids, and store actions for preview/resize"
```

---

### Task 3: Create Markdown Preview Styles

**Files:**
- Create: `src/styles/markdown-preview.css`

- [ ] **Step 1: Create the markdown preview stylesheet**

Create `src/styles/markdown-preview.css` with theme-aware styles using the app's CSS custom properties. This file styles the rendered HTML output from `marked`:

```css
.markdown-preview {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 32px;
  color: var(--text-secondary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.7;
  overflow-y: auto;
  height: 100%;
}

.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3,
.markdown-preview h4,
.markdown-preview h5,
.markdown-preview h6 {
  color: var(--text-primary);
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 8px;
}

.markdown-preview h1 {
  font-size: 28px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.markdown-preview h2 {
  font-size: 22px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.markdown-preview h3 { font-size: 18px; }
.markdown-preview h4 { font-size: 16px; }

.markdown-preview p {
  margin: 12px 0;
}

.markdown-preview a {
  color: var(--accent);
  text-decoration: none;
}

.markdown-preview a:hover {
  text-decoration: underline;
}

.markdown-preview strong {
  color: var(--text-primary);
  font-weight: 600;
}

.markdown-preview ul,
.markdown-preview ol {
  padding-left: 24px;
  margin: 8px 0;
}

.markdown-preview li {
  margin: 4px 0;
}

.markdown-preview li input[type="checkbox"] {
  margin-right: 6px;
  accent-color: var(--accent);
}

.markdown-preview code {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-size: 13px;
  color: var(--text-primary);
}

.markdown-preview pre {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin: 16px 0;
}

.markdown-preview pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 13px;
  line-height: 1.5;
}

.markdown-preview blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--text-muted);
}

.markdown-preview table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 13px;
}

.markdown-preview th {
  text-align: left;
  padding: 8px 12px;
  color: var(--text-primary);
  font-weight: 600;
  border-bottom: 2px solid var(--border);
}

.markdown-preview td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.markdown-preview hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}

.markdown-preview img {
  max-width: 100%;
  border-radius: 6px;
}

.markdown-preview .mermaid-container {
  display: flex;
  justify-content: center;
  margin: 16px 0;
  padding: 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.markdown-preview .mermaid-error {
  color: var(--error);
  font-size: 12px;
  padding: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--error);
  border-radius: 6px;
  margin: 8px 0;
}

.markdown-preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--error);
}

.markdown-preview-error button {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.markdown-preview-error button:hover {
  background: var(--bg-tertiary);
}
```

- [ ] **Step 2: Import the stylesheet in `main.tsx`**

In `src/main.tsx`, add the import alongside the existing `globals.css` import:

```ts
import "./styles/markdown-preview.css";
```

- [ ] **Step 3: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/markdown-preview.css src/main.tsx
git commit -m "feat: add theme-aware markdown preview stylesheet"
```

---

### Task 4: Create MarkdownPreview Component

**Files:**
- Create: `src/components/MarkdownPreview.tsx`

- [ ] **Step 1: Create the `MarkdownPreview` component**

Create `src/components/MarkdownPreview.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import DOMPurify from "dompurify";
import { listen } from "@tauri-apps/api/event";
import { useFileSystem } from "../hooks/use-file-system";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return code;
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

marked.setOptions({ gfm: true, breaks: false });

interface MarkdownPreviewProps {
  filePath: string;
  isActive: boolean;
  onSwitchToSource: () => void;
}

export function MarkdownPreview({ filePath, isActive, onSwitchToSource }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { readFile } = useFileSystem();

  // Re-render when file changes on disk
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const unlisten = listen("fs-change", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => setRefreshKey((k) => k + 1), 300);
    });
    return () => {
      clearTimeout(debounceTimer);
      unlisten.then((fn) => fn());
    };
  }, []);

  // Read and parse markdown
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    readFile(filePath)
      .then(async (content) => {
        if (cancelled) return;
        try {
          const raw = await marked.parse(content);
          const clean = DOMPurify.sanitize(raw, {
            ADD_TAGS: ["svg", "path", "circle", "rect", "line", "polyline", "polygon", "text", "g", "defs", "marker", "foreignObject"],
            ADD_ATTR: ["viewBox", "d", "fill", "stroke", "stroke-width", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "text-anchor", "dominant-baseline", "font-size", "marker-end", "refX", "refY", "orient", "markerWidth", "markerHeight"],
          });
          if (!cancelled) {
            setHtml(clean);
            setLoading(false);
          }
        } catch (err) {
          if (!cancelled) {
            setError(`Markdown parse error: ${err}`);
            setLoading(false);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [filePath, refreshKey]);

  // Render mermaid diagrams after HTML is set
  useEffect(() => {
    if (!containerRef.current || !html) return;

    const mermaidBlocks = containerRef.current.querySelectorAll("code.hljs.language-mermaid");
    if (mermaidBlocks.length === 0) return;

    let cancelled = false;

    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      });

      for (let i = 0; i < mermaidBlocks.length; i++) {
        if (cancelled) return;
        const block = mermaidBlocks[i];
        const pre = block.parentElement;
        if (!pre || pre.tagName !== "PRE") continue;

        const code = block.textContent ?? "";
        try {
          const id = `mermaid-${Date.now()}-${i}`;
          const { svg } = await mermaid.render(id, code);
          const wrapper = document.createElement("div");
          wrapper.className = "mermaid-container";
          wrapper.innerHTML = DOMPurify.sanitize(svg, {
            ADD_TAGS: ["svg", "path", "circle", "rect", "line", "polyline", "polygon", "text", "g", "defs", "marker", "foreignObject", "style"],
            ADD_ATTR: ["viewBox", "d", "fill", "stroke", "stroke-width", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "text-anchor", "dominant-baseline", "font-size", "marker-end", "refX", "refY", "orient", "markerWidth", "markerHeight", "class", "id", "style"],
          });
          pre.replaceWith(wrapper);
        } catch {
          const errDiv = document.createElement("div");
          errDiv.className = "mermaid-error";
          errDiv.textContent = `Mermaid render error`;
          const codeBlock = document.createElement("pre");
          codeBlock.textContent = code;
          const wrapper = document.createElement("div");
          wrapper.append(errDiv, codeBlock);
          pre.replaceWith(wrapper);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [html]);

  if (error) {
    return (
      <div className="markdown-preview-error" style={{ display: isActive ? "flex" : "none" }}>
        <span>{error}</span>
        <button onClick={onSwitchToSource}>Switch to Source</button>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: isActive ? "block" : "none", position: "relative" }}>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", position: "absolute", inset: 0, zIndex: 1 }}>
          Loading preview...
        </div>
      )}
      <div
        ref={containerRef}
        className="markdown-preview"
        style={{ visibility: loading ? "hidden" : "visible" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors. If there are type issues with imports (e.g., highlight.js languages), check the error output and adjust imports accordingly. The highlight.js language imports use `highlight.js/lib/languages/<name>`.

- [ ] **Step 3: Commit**

```bash
git add src/components/MarkdownPreview.tsx package.json package-lock.json
git commit -m "feat: create MarkdownPreview component with GFM, syntax highlighting, and mermaid"
```

---

### Task 5: Wire Up Markdown Preview in EditorTab and TabGroup

**Files:**
- Modify: `src/components/EditorTab.tsx`
- Modify: `src/components/TabGroup.tsx`

- [ ] **Step 1: Add `previewMode` prop to `EditorTab`**

In `src/components/EditorTab.tsx`, update the `EditorTabProps` interface to include `previewMode`:

```ts
interface EditorTabProps {
  tabId: string;
  groupId: string;
  filePath: string;
  isActive: boolean;
  previewMode?: boolean;
}
```

Update the function signature:

```ts
export function EditorTab({ tabId, groupId, filePath, isActive, previewMode }: EditorTabProps) {
```

- [ ] **Step 2: Add markdown detection helper**

At the top of `EditorTab.tsx`, below the existing imports, add:

```ts
import { MarkdownPreview } from "./MarkdownPreview";
import { useTabStore } from "../store/tab-store";
```

Note: `useTabStore` is already imported — don't duplicate it. Only add the `MarkdownPreview` import.

Add a helper function below `getLanguageExtension`:

```ts
function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "markdown";
}
```

- [ ] **Step 3: Add conditional rendering for preview mode**

In the `EditorTab` component's return statement, wrap the existing content. Replace the current return (the final `return (` block starting around line 178) with:

```tsx
const showPreview = previewMode && isMarkdownFile(filePath);
const togglePreviewMode = useTabStore((s) => s.togglePreviewMode);

if (error) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--error)" }}>
      {error}
    </div>
  );
}

return (
  <div style={{ width: "100%", height: "100%", display: isActive ? "block" : "none", position: "relative" }}>
    {showPreview ? (
      <MarkdownPreview
        filePath={filePath}
        isActive={true}
        onSwitchToSource={() => togglePreviewMode(groupId, tabId)}
      />
    ) : (
      <>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", position: "absolute", inset: 0, zIndex: 1 }}>
            Loading...
          </div>
        )}
        <div
          ref={containerRef}
          style={{ width: "100%", height: "100%", visibility: loading ? "hidden" : "visible" }}
        />
      </>
    )}
  </div>
);
```

- [ ] **Step 4: Pass `previewMode` from `TabGroup` to `EditorTab`**

In `src/components/TabGroup.tsx`, update the editor tab rendering (the final `return` in the `group.tabs.map` callback) to pass `previewMode`:

```tsx
return (
  <EditorTab
    key={tab.id}
    tabId={tab.id}
    groupId={groupId}
    filePath={tab.filePath ?? ""}
    isActive={isActive}
    previewMode={tab.previewMode}
  />
);
```

- [ ] **Step 5: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/EditorTab.tsx src/components/TabGroup.tsx
git commit -m "feat: wire up markdown preview toggle in EditorTab"
```

---

### Task 6: Add Preview Toggle and Split Button to TabBar

**Files:**
- Modify: `src/components/TabBar.tsx`

- [ ] **Step 1: Add new props to `TabBarProps`**

In `src/components/TabBar.tsx`, update the `TabBarProps` interface:

```ts
interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  groupId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onDropTab: (tabId: string, fromGroupId: string) => void;
  onTogglePreview?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  showPreviewToggle?: boolean;
  isPreviewActive?: boolean;
}
```

Update the function signature to destructure the new props:

```ts
export function TabBar({
  tabs,
  activeTabId,
  groupId,
  onSelectTab,
  onCloseTab,
  onDropTab,
  onTogglePreview,
  onSplitRight,
  onSplitDown,
  showPreviewToggle,
  isPreviewActive,
}: TabBarProps) {
```

- [ ] **Step 2: Add the `BookOpen`, `Code`, `PanelRight` icons**

Update the lucide-react import at the top:

```ts
import { Terminal, FileCode, GitCompare, GitCommitHorizontal, BookOpen, Code, PanelRight } from "lucide-react";
```

- [ ] **Step 3: Add the action buttons after the tab list**

Inside the outer `<div>` of the `TabBar` return, after the `{tabs.map(...)}` block and before the closing `</div>`, add a spacer and the action buttons:

```tsx
<div style={{ flex: 1 }} />
<div style={{ display: "flex", alignItems: "center", gap: 2, paddingRight: 8 }}>
  {showPreviewToggle && (
    <button
      onClick={onTogglePreview}
      title={isPreviewActive ? "Show source (⌘⇧V)" : "Show preview (⌘⇧V)"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        border: "none",
        background: isPreviewActive ? "rgba(59, 130, 246, 0.15)" : "transparent",
        color: isPreviewActive ? "var(--accent)" : "var(--text-secondary)",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "inherit",
      }}
    >
      {isPreviewActive
        ? <><Code size={13} strokeWidth={1.75} /> Source</>
        : <><BookOpen size={13} strokeWidth={1.75} /> Preview</>
      }
    </button>
  )}
  <button
    onClick={onSplitRight}
    onContextMenu={(e) => {
      e.preventDefault();
      onSplitDown?.();
    }}
    title="Split editor right (⌘\) · Right-click: split down"
    style={{
      display: "flex",
      alignItems: "center",
      padding: "2px 6px",
      borderRadius: 4,
      border: "none",
      background: "transparent",
      color: "var(--text-secondary)",
      cursor: "pointer",
    }}
  >
    <PanelRight size={14} strokeWidth={1.5} />
  </button>
</div>
```

- [ ] **Step 4: Wire up the new TabBar props in `TabGroup.tsx`**

In `src/components/TabGroup.tsx`, update the `<TabBar>` usage to pass the new props. First, add the needed store selectors and helpers:

```tsx
const togglePreviewMode = useTabStore((s) => s.togglePreviewMode);
const splitGroup = useTabStore((s) => s.splitGroup);
```

Add a helper to determine if the active tab is a markdown file:

```tsx
const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
const isMarkdown = activeTab?.type === "editor" && /\.(md|markdown)$/i.test(activeTab.filePath ?? "");
```

Import `duplicateTab` from the store at the top of the file:

```ts
import { useTabStore, duplicateTab } from "../store/tab-store";
```

Note: `useTabStore` is already imported — just add `duplicateTab` to the existing import.

Then update the `<TabBar>` JSX:

```tsx
<TabBar
  tabs={group.tabs}
  activeTabId={group.activeTabId}
  groupId={groupId}
  onSelectTab={(tabId) => setActiveTab(groupId, tabId)}
  onCloseTab={(tabId) => removeTab(groupId, tabId)}
  onDropTab={(tabId, fromGroupId) => moveTab(fromGroupId, groupId, tabId)}
  showPreviewToggle={isMarkdown}
  isPreviewActive={activeTab?.previewMode ?? false}
  onTogglePreview={() => {
    if (activeTab) togglePreviewMode(groupId, activeTab.id);
  }}
  onSplitRight={() => {
    if (activeTab) splitGroup(groupId, "vertical", duplicateTab(activeTab));
  }}
  onSplitDown={() => {
    if (activeTab) splitGroup(groupId, "horizontal", duplicateTab(activeTab));
  }}
/>
```

- [ ] **Step 5: Add `createTerminalTab` import in TabGroup if needed**

If `createTerminalTab` from `tab-store` is needed for the duplicate helper, import it. However, the `duplicateTab` inline helper above handles terminal creation directly — no additional import needed.

- [ ] **Step 6: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/TabBar.tsx src/components/TabGroup.tsx
git commit -m "feat: add preview toggle and split button to tab bar"
```

---

### Task 7: Create SplitDivider Component

**Files:**
- Create: `src/components/SplitDivider.tsx`

- [ ] **Step 1: Create the `SplitDivider` component**

Create `src/components/SplitDivider.tsx`:

```tsx
import { useCallback, useRef, useState } from "react";

interface SplitDividerProps {
  direction: "vertical" | "horizontal";
  onResize: (ratio: number) => void;
  parentRef: React.RefObject<HTMLDivElement | null>;
}

export function SplitDivider({ direction, onResize, parentRef }: SplitDividerProps) {
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);

  const isVertical = direction === "vertical";
  const MIN_PANE_PX = 100;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const parent = parentRef.current;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const totalSize = isVertical ? rect.width : rect.height;
      const startPos = isVertical ? rect.left : rect.top;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = isVertical ? moveEvent.clientX : moveEvent.clientY;
        let ratio = (currentPos - startPos) / totalSize;

        // Clamp to enforce minimum pane size
        const minRatio = MIN_PANE_PX / totalSize;
        const maxRatio = 1 - minRatio;
        ratio = Math.max(minRatio, Math.min(maxRatio, ratio));

        onResize(ratio);
      };

      const handleMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // Re-enable pointer events on all panes
        parent.querySelectorAll<HTMLElement>(":scope > div").forEach((child) => {
          child.style.pointerEvents = "";
        });
      };

      // Disable pointer events on panes during drag
      parent.querySelectorAll<HTMLElement>(":scope > div").forEach((child) => {
        if (child !== dividerRef.current) {
          child.style.pointerEvents = "none";
        }
      });

      document.body.style.cursor = isVertical ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [isVertical, onResize, parentRef],
  );

  const handleDoubleClick = useCallback(() => {
    onResize(0.5);
  }, [onResize]);

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => !dragging && setHovering(false)}
      style={{
        [isVertical ? "width" : "height"]: "5px",
        [isVertical ? "height" : "width"]: "100%",
        cursor: isVertical ? "col-resize" : "row-resize",
        flexShrink: 0,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      {/* Visual line */}
      <div
        style={{
          position: "absolute",
          [isVertical ? "width" : "height"]: "1px",
          [isVertical ? "height" : "width"]: "100%",
          background: hovering || dragging ? "var(--accent)" : "var(--border)",
          transition: "background 0.15s",
        }}
      />
      {/* Grab indicator */}
      <div
        style={{
          [isVertical ? "width" : "height"]: "3px",
          [isVertical ? "height" : "width"]: "32px",
          background: hovering || dragging ? "var(--accent)" : "var(--text-muted)",
          borderRadius: 2,
          opacity: hovering || dragging ? 0.8 : 0,
          transition: "opacity 0.15s, background 0.15s",
          zIndex: 1,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SplitDivider.tsx
git commit -m "feat: create SplitDivider component with drag resize and double-click reset"
```

---

### Task 8: Integrate SplitDivider and Improve Drop Zones in TabGroupManager

**Files:**
- Modify: `src/components/TabGroupManager.tsx`

- [ ] **Step 1: Import `SplitDivider` and add store selector**

At the top of `src/components/TabGroupManager.tsx`, add:

```ts
import { SplitDivider } from "./SplitDivider";
```

- [ ] **Step 2: Update `EDGE_SIZE` and `EdgeDropZone` for improved drop zones**

Change the `EDGE_SIZE` constant from 30 to 60:

```ts
const EDGE_SIZE = 60;
```

Update the `EdgeDropZone` component's hover visual. Replace the `style` object in the returned `<div>` to show a half-pane overlay instead of a border:

Replace the existing return in `EdgeDropZone` (the `<div>` with the style block) with:

```tsx
const overlayStyle: React.CSSProperties =
  edge === "left"
    ? { top: 4, left: 4, bottom: 4, width: "48%", borderRadius: 6 }
    : edge === "right"
      ? { top: 4, right: 4, bottom: 4, width: "48%", borderRadius: 6 }
      : { bottom: 4, left: 4, right: 4, height: "48%", borderRadius: 6 };

const label =
  edge === "left" ? "Drop to split left" : edge === "right" ? "Drop to split right" : "Drop to split below";

return (
  <>
    {/* Invisible hit area for drag detection */}
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        zIndex: 10,
        pointerEvents: active ? "auto" : "none",
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setHovering(true);
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setHovering(false);
        try {
          const data = JSON.parse(e.dataTransfer.getData(TAB_DRAG_TYPE));
          const tab: Tab = data.tab;
          const fromGroupId: string = data.fromGroupId;
          const tabId: string = data.tabId;

          if (fromGroupId === groupId) {
            const group = useTabStore.getState().groups[groupId];
            if (group && group.tabs.length <= 1) return;
          }

          splitGroup(groupId, direction, tab, insertBefore);
          removeTab(fromGroupId, tabId);
        } catch {
          /* ignore invalid drag data */
        }
      }}
    />
    {/* Visual overlay showing where the split will appear */}
    {hovering && (
      <div
        style={{
          position: "absolute",
          ...overlayStyle,
          background: "rgba(59, 130, 246, 0.12)",
          border: "2px dashed rgba(59, 130, 246, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9,
          pointerEvents: "none",
        }}
      >
        <span style={{ color: "rgba(59, 130, 246, 0.6)", fontSize: 12, fontFamily: "system-ui" }}>
          {label}
        </span>
      </div>
    )}
  </>
);
```

- [ ] **Step 3: Replace static divider with `SplitDivider` in `RenderNode`**

Replace the entire `RenderNode` function with:

```tsx
function RenderNode({ node }: { node: SplitNode }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const setSplitRatio = useTabStore((s) => s.setSplitRatio);

  if (node.type === "leaf") {
    return node.groupId ? <DroppableLeaf groupId={node.groupId} /> : null;
  }

  const isVertical = node.direction === "vertical";
  const ratio = node.ratio ?? 0.5;
  const [first, second] = node.children ?? [];
  const nodeId = node.id;

  return (
    <div
      ref={parentRef}
      style={{
        display: "flex",
        flexDirection: isVertical ? "row" : "column",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          [isVertical ? "width" : "height"]: `${ratio * 100}%`,
          overflow: "hidden",
        }}
      >
        {first && <RenderNode node={first} />}
      </div>
      <SplitDivider
        direction={isVertical ? "vertical" : "horizontal"}
        parentRef={parentRef}
        onResize={(newRatio) => {
          if (nodeId) setSplitRatio(nodeId, newRatio);
        }}
      />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {second && <RenderNode node={second} />}
      </div>
    </div>
  );
}
```

Add the `useRef` import if not already present — update the React import at the top of the file:

```ts
import { useState, useCallback, useRef } from "react";
```

Note: The `SplitDivider` uses the `node.id` directly from the `SplitNode`, avoiding the nested-split ambiguity. No `collectGroupIds` helper is needed in this file.

- [ ] **Step 4: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/TabGroupManager.tsx
git commit -m "feat: replace static dividers with SplitDivider and improve drop zone UX"
```

---

### Task 9: Register Keyboard Shortcuts in AppShell

**Files:**
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Add keyboard shortcut handler**

In `src/components/AppShell.tsx`, add imports for the tab store actions:

```ts
import { useTabStore, duplicateTab } from "../store/tab-store";
import { Tab } from "../types";
```

- [ ] **Step 2: Add the keyboard shortcut `useEffect`**

Inside the `AppShell` component, add a new `useEffect` after the existing ones:

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const store = useTabStore.getState();
    const group = store.groups[store.activeGroupId];
    if (!group) return;
    const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
    if (!activeTab) return;

    // ⌘\ — split right
    if (e.metaKey && !e.shiftKey && e.key === "\\") {
      e.preventDefault();
      store.splitGroup(store.activeGroupId, "vertical", duplicateTab(activeTab));
      return;
    }

    // ⌘⇧\ — split down
    if (e.metaKey && e.shiftKey && e.key === "\\") {
      e.preventDefault();
      store.splitGroup(store.activeGroupId, "horizontal", duplicateTab(activeTab));
      return;
    }

    // ⌘⇧V — toggle markdown preview
    if (e.metaKey && e.shiftKey && e.key === "v") {
      if (activeTab.type === "editor" && /\.(md|markdown)$/i.test(activeTab.filePath ?? "")) {
        e.preventDefault();
        store.togglePreviewMode(store.activeGroupId, activeTab.id);
      }
      return;
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);
```

- [ ] **Step 3: Verify the project builds**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat: register ⌘\\, ⌘⇧\\, ⌘⇧V keyboard shortcuts for split and preview"
```

---

### Task 10: Final Build Verification and Manual Testing

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/ultima/Workspace/vibe-editor && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Full Vite build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual test checklist**

Run the app with `npm run tauri dev` and verify:

1. Open a `.md` file — should open in CodeMirror source view
2. Click "Preview" button in tab bar — should switch to rendered markdown
3. Press ⌘⇧V — should toggle back to source
4. Preview should render: headings with borders, code blocks with syntax highlighting, tables, task lists, links
5. If the `.md` file contains a `mermaid` code block, it should render as a diagram
6. Open a `.ts` file — "Preview" button should NOT appear
7. Press ⌘\ — should split the active tab right
8. Press ⌘⇧\ — should split the active tab down
9. Drag the divider between split panes — should resize smoothly
10. Double-click the divider — should reset to 50/50
11. Hover the divider — should show accent color and grab indicator
12. Click the split button (⊞ icon) in tab bar — should split right
13. Right-click the split button — should split down
14. Drag a tab to the right edge of a pane — should show "Drop to split right" overlay
15. Drop the tab — should create a new split pane

- [ ] **Step 4: Commit any fixes**

If any fixes were needed during testing:

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
