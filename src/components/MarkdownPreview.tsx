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
  const readFileRef = useRef(readFile);
  readFileRef.current = readFile;

  // Re-render when this file changes on disk
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const unlisten = listen<{ paths: string[] }>("fs-change", (event) => {
      const changed = event.payload.paths ?? [];
      if (!changed.some((p) => p.endsWith(filePath) || filePath.endsWith(p))) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => setRefreshKey((k) => k + 1), 300);
    });
    return () => {
      clearTimeout(debounceTimer);
      unlisten.then((fn) => fn());
    };
  }, [filePath]);

  // Read and parse markdown
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    readFileRef.current(filePath)
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

    const blocks = Array.from(containerRef.current.querySelectorAll("code.hljs.language-mermaid"));
    if (blocks.length === 0) return;

    let cancelled = false;

    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      });

      for (let i = 0; i < blocks.length; i++) {
        if (cancelled) return;
        const block = blocks[i];
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
          if (cancelled || !pre.parentNode) return;
          pre.replaceWith(wrapper);
        } catch {
          const errDiv = document.createElement("div");
          errDiv.className = "mermaid-error";
          errDiv.textContent = `Mermaid render error`;
          const codeBlock = document.createElement("pre");
          codeBlock.textContent = code;
          const wrapper = document.createElement("div");
          wrapper.append(errDiv, codeBlock);
          if (!cancelled && pre.parentNode) pre.replaceWith(wrapper);
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
