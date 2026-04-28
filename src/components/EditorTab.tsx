import { useEffect, useRef, useState } from "react";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { listen } from "@tauri-apps/api/event";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { cpp } from "@codemirror/lang-cpp";
import { invoke } from "@tauri-apps/api/core";
import { useFileSystem } from "../hooks/use-file-system";
import { useTabStore, focusExistingTab } from "../store/tab-store";
import { useAppStore } from "../store/app-store";
import { useSettingsStore } from "../store/settings-store";
import { getCodeTheme } from "../editor-themes";
import { MarkdownPreview } from "./MarkdownPreview";
import { cmdClickExtension } from "../editor/cmd-click";
import { Tab } from "../types";

const themeCompartment = new Compartment();

// ---------------------------------------------------------------------------
// Git Blame — shown only on the active cursor line (hover/focus)
// ---------------------------------------------------------------------------

interface BlameInfo {
  hash: string;
  author: string;
  date: string;
}

class BlameWidget extends WidgetType {
  constructor(private info: BlameInfo) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-blame-annotation";
    span.textContent = `  ${this.info.author}, ${this.info.date} • ${this.info.hash}`;
    span.style.cssText =
      "color: var(--text-muted, #6b7280); opacity: 0.6; font-size: 12px; font-style: italic; padding-left: 24px; pointer-events: none;";
    return span;
  }

  eq(other: BlameWidget): boolean {
    return (
      this.info.hash === other.info.hash &&
      this.info.author === other.info.author &&
      this.info.date === other.info.date
    );
  }
}

const setBlameDataEffect = StateEffect.define<BlameInfo[]>();
const clearBlameEffect = StateEffect.define<null>();

// Stores the full blame data (one entry per line) without rendering decorations
const blameDataField = StateField.define<BlameInfo[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setBlameDataEffect)) return e.value;
      if (e.is(clearBlameEffect)) return [];
    }
    if (tr.docChanged) return [];
    return value;
  },
});

// Derives a single-line decoration from blameDataField + cursor position
function blameLineDecoration(view: EditorView): DecorationSet {
  const blameData = view.state.field(blameDataField);
  if (blameData.length === 0) return Decoration.none;

  const cursor = view.state.selection.main.head;
  const lineNum = view.state.doc.lineAt(cursor).number; // 1-based
  if (lineNum > blameData.length) return Decoration.none;

  const info = blameData[lineNum - 1];
  const line = view.state.doc.line(lineNum);
  return Decoration.set([
    Decoration.widget({ widget: new BlameWidget(info), side: 1 }).range(line.to),
  ]);
}

const blameDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = blameLineDecoration(view);
    }
    update(update: ViewUpdate) {
      if (
        update.selectionSet ||
        update.docChanged ||
        update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(setBlameDataEffect) || e.is(clearBlameEffect))
        )
      ) {
        this.decorations = blameLineDecoration(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// Flash-highlight effect for search result jumps
const addFlashEffect = StateEffect.define<{ from: number; to: number }>();
const clearFlashEffect = StateEffect.define<null>();

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(addFlashEffect)) {
        const mark = Decoration.line({ class: "cm-flash-highlight" });
        return Decoration.set([mark.range(e.value.from)]);
      }
      if (e.is(clearFlashEffect)) return Decoration.none;
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

let flashTimeout: ReturnType<typeof setTimeout> | null = null;

function flashLine(view: EditorView, lineFrom: number) {
  if (flashTimeout) clearTimeout(flashTimeout);
  view.dispatch({ effects: addFlashEffect.of({ from: lineFrom, to: lineFrom }) });
  flashTimeout = setTimeout(() => {
    flashTimeout = null;
    try {
      view.dispatch({ effects: clearFlashEffect.of(null) });
    } catch {
      // View may have been destroyed
    }
  }, 1500);
}

interface EditorTabProps {
  tabId: string;
  groupId: string;
  filePath: string;
  isActive: boolean;
  previewMode?: boolean;
}

function getLanguageExtension(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "rs":
      return rust();
    case "py":
      return python();
    case "html":
      return html();
    case "css":
    case "scss":
      return css();
    case "json":
      return json();
    case "c":
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
    case "hxx":
      return cpp();
    default:
      return [];
  }
}

function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "markdown";
}

export function EditorTab({ tabId, groupId, filePath, isActive, previewMode }: EditorTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const { readFile, writeFile } = useFileSystem();

  const handleCmdClickOpenFile = useRef((clickedPath: string) => {
    let absolutePath: string;

    if (clickedPath.startsWith("/")) {
      absolutePath = clickedPath;
    } else {
      // Resolve relative to the directory of the current file
      const currentDir = filePath.substring(0, filePath.lastIndexOf("/"));
      absolutePath = `${currentDir}/${clickedPath}`;
    }

    // Normalize /../ and /./ segments
    const parts = absolutePath.split("/");
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === "..") normalized.pop();
      else if (part !== ".") normalized.push(part);
    }
    absolutePath = normalized.join("/");

    // Check if file is already open in any group
    if (focusExistingTab(absolutePath)) return;

    const fileName = absolutePath.split("/").pop() || absolutePath;
    const { addTab, activeGroupId } = useTabStore.getState();
    const tab: Tab = {
      id: `editor-${Date.now()}`,
      type: "editor",
      title: fileName,
      filePath: absolutePath,
      isDirty: false,
    };
    addTab(activeGroupId, tab);
  }).current;

  // Phase 1: Read file content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFileContent(null);

    readFile(filePath)
      .then((content) => {
        if (!cancelled) setFileContent(content);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [filePath]);

  // Phase 2: Mount CodeMirror once content and container are available
  useEffect(() => {
    if (fileContent === null || !containerRef.current) return;

    const currentThemeId = useSettingsStore.getState().colorTheme;

    const state = EditorState.create({
      doc: fileContent,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        search(),
        getLanguageExtension(filePath),
        themeCompartment.of(getCodeTheme(currentThemeId)),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": {
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
            fontSize: "14px",
          },
          ".cm-flash-highlight": {
            backgroundColor: "rgba(59, 130, 246, 0.25) !important",
            transition: "background-color 1.5s ease-out",
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
        cmdClickExtension({ onOpenFile: handleCmdClickOpenFile }),
        flashField,
        blameDataField,
        blameDecorationPlugin,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    setLoading(false);

    // Fetch and display git blame
    let viewDestroyed = false;
    const workspaceRoot = useAppStore.getState().workspaceRoot;
    if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
      const relativePath = filePath.slice(workspaceRoot.length + 1);
      invoke<Array<{ line_number: number; hash: string; author: string; date: string }>>(
        "git_blame",
        { workspaceRoot, path: relativePath }
      )
        .then((blameData) => {
          if (viewDestroyed) return;
          const blameInfos: BlameInfo[] = blameData.map((b) => ({
            hash: b.hash,
            author: b.author,
            date: b.date,
          }));
          view.dispatch({ effects: setBlameDataEffect.of(blameInfos) });
        })
        .catch(() => {
          // Silently ignore blame errors (file not tracked, etc.)
        });
    }

    // Jump to pending line from search results
    const tabState = useTabStore.getState().groups[groupId]?.tabs.find((t) => t.id === tabId);
    if (tabState?.pendingGoToLine) {
      const line = Math.min(tabState.pendingGoToLine, view.state.doc.lines);
      const lineInfo = view.state.doc.line(line);
      view.dispatch({
        selection: { anchor: lineInfo.from },
        scrollIntoView: true,
      });
      flashLine(view, lineInfo.from);
      // Clear the pending line
      useTabStore.setState((s) => ({
        groups: {
          ...s.groups,
          [groupId]: {
            ...s.groups[groupId],
            tabs: s.groups[groupId].tabs.map((t) =>
              t.id === tabId ? { ...t, pendingGoToLine: undefined } : t
            ),
          },
        },
      }));
    }

    return () => { viewDestroyed = true; view.destroy(); };
  }, [fileContent, filePath, groupId, tabId, previewMode]);

  // Watch for pendingGoToLine on already-mounted editors (e.g. search result for open file)
  useEffect(() => {
    const unsub = useTabStore.subscribe((s) => {
      const tab = s.groups[groupId]?.tabs.find((t) => t.id === tabId);
      const view = viewRef.current;
      if (!tab?.pendingGoToLine || !view) return;

      const line = Math.min(tab.pendingGoToLine, view.state.doc.lines);
      const lineInfo = view.state.doc.line(line);
      view.dispatch({
        selection: { anchor: lineInfo.from },
        scrollIntoView: true,
      });
      flashLine(view, lineInfo.from);

      useTabStore.setState((s2) => ({
        groups: {
          ...s2.groups,
          [groupId]: {
            ...s2.groups[groupId],
            tabs: s2.groups[groupId].tabs.map((t) =>
              t.id === tabId ? { ...t, pendingGoToLine: undefined } : t
            ),
          },
        },
      }));
    });
    return () => unsub();
  }, [groupId, tabId]);

  // Phase 3: Subscribe to theme changes for live hot-swap
  useEffect(() => {
    let prev = useSettingsStore.getState().colorTheme;
    const unsub = useSettingsStore.subscribe((state) => {
      if (state.colorTheme !== prev) {
        prev = state.colorTheme;
        viewRef.current?.dispatch({
          effects: themeCompartment.reconfigure(getCodeTheme(state.colorTheme)),
        });
      }
    });
    return () => unsub();
  }, []);

  // Cmd+S save handler
  useEffect(() => {
    const handleSave = async (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "s" && isActive) {
        e.preventDefault();
        const content = viewRef.current?.state.doc.toString();
        if (content !== undefined) {
          try {
            await writeFile(filePath, content);
            useTabStore.setState((state) => ({
              groups: {
                ...state.groups,
                [groupId]: {
                  ...state.groups[groupId],
                  tabs: state.groups[groupId].tabs.map((t) =>
                    t.id === tabId ? { ...t, isDirty: false } : t
                  ),
                },
              },
            }));
          } catch (err) {
            console.error("Failed to save:", err);
          }
        }
      }
    };

    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [filePath, isActive, groupId, tabId, writeFile]);

  // Refresh file content on fs-change (e.g., after git pull) if not dirty
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = listen("fs-change", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const tab = useTabStore.getState().groups[groupId]?.tabs.find((t) => t.id === tabId);
        if (tab?.isDirty) return; // Don't overwrite unsaved changes

        const view = viewRef.current;
        if (!view) return;

        try {
          const newContent = await readFile(filePath);
          const currentContent = view.state.doc.toString();
          if (newContent !== currentContent) {
            // Preserve cursor position
            const cursor = view.state.selection.main.head;
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: newContent },
              selection: { anchor: Math.min(cursor, newContent.length) },
            });
          }
        } catch {
          // File may have been deleted
        }
      }, 300);
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unlisten.then((fn) => fn());
    };
  }, [filePath, groupId, tabId, readFile]);

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
}
