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
import { cpp } from "@codemirror/lang-cpp";
import { useFileSystem } from "../hooks/use-file-system";
import { useTabStore } from "../store/tab-store";
import { useSettingsStore } from "../store/settings-store";
import { getCodeTheme } from "../editor-themes";
import { MarkdownPreview } from "./MarkdownPreview";

const themeCompartment = new Compartment();

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

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    setLoading(false);

    return () => { view.destroy(); };
  }, [fileContent, filePath, groupId, tabId]);

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
