import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { useFileSystem } from "../hooks/use-file-system";
import { useTabStore } from "../store/tab-store";

interface EditorTabProps {
  tabId: string;
  groupId: string;
  filePath: string;
  isActive: boolean;
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
    default:
      return [];
  }
}

export function EditorTab({ tabId, groupId, filePath, isActive }: EditorTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { readFile, writeFile } = useFileSystem();

  useEffect(() => {
    if (!containerRef.current) return;

    let view: EditorView;

    readFile(filePath)
      .then((content) => {
        if (!containerRef.current) return;

        const state = EditorState.create({
          doc: content,
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
                useTabStore.setState((state) => ({
                  groups: {
                    ...state.groups,
                    [groupId]: {
                      ...state.groups[groupId],
                      tabs: state.groups[groupId].tabs.map((t) =>
                        t.id === tabId ? { ...t, isDirty: true } : t
                      ),
                    },
                  },
                }));
              }
            }),
          ],
        });

        view = new EditorView({ state, parent: containerRef.current });
        viewRef.current = view;
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });

    return () => { view?.destroy(); };
  }, [filePath]);

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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: isActive ? "block" : "none",
      }}
    />
  );
}
