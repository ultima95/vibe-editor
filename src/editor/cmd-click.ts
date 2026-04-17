import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { openUrl } from "@tauri-apps/plugin-opener";

// Matches http:// and https:// URLs
const URL_RE = /https?:\/\/[^\s"'`)<>\]},;]+/g;

// Matches file-like paths: ./foo, ../foo, /absolute, or bare relative like src/foo.ts
// Must contain at least one slash and a file extension or end with a known dir-like segment
const FILE_PATH_RE = /(?:\.\.?\/|\/)[^\s"'`)<>\]},;:]+/g;

interface CmdClickCallbacks {
  onOpenFile: (path: string) => void;
}

const setMetaHeld = StateEffect.define<boolean>();

const metaHeldField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setMetaHeld)) return e.value;
    }
    return value;
  },
});

function linkDecorations(view: EditorView): DecorationSet {
  const metaHeld = view.state.field(metaHeldField);
  if (!metaHeld) return Decoration.none;

  const builder: { from: number; to: number; deco: Decoration }[] = [];
  const linkMark = Decoration.mark({
    class: "cm-cmd-link",
  });

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const re of [URL_RE, FILE_PATH_RE]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        builder.push({
          from: from + match.index,
          to: from + match.index + match[0].length,
          deco: linkMark,
        });
      }
    }
  }

  builder.sort((a, b) => a.from - b.from);
  return Decoration.set(builder.map((b) => b.deco.range(b.from, b.to)));
}

const linkDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = linkDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(setMetaHeld)))
      ) {
        this.decorations = linkDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

function getTokenAtPos(doc: string, offset: number, re: RegExp): string | null {
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(doc)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) {
      return match[0];
    }
  }
  return null;
}

export function cmdClickExtension(callbacks: CmdClickCallbacks) {
  const theme = EditorView.baseTheme({
    ".cm-cmd-link": {
      textDecoration: "underline",
      cursor: "pointer",
      textUnderlineOffset: "3px",
    },
  });

  const clickHandler = EditorView.domEventHandlers({
    mousedown(event: MouseEvent, view: EditorView) {
      if (!event.metaKey) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      const offsetInLine = pos - line.from;

      // Check URL first
      URL_RE.lastIndex = 0;
      const url = getTokenAtPos(lineText, offsetInLine, URL_RE);
      if (url) {
        event.preventDefault();
        openUrl(url).catch((err) => console.error("Failed to open URL:", err));
        return true;
      }

      // Check file path
      FILE_PATH_RE.lastIndex = 0;
      const filePath = getTokenAtPos(lineText, offsetInLine, FILE_PATH_RE);
      if (filePath) {
        event.preventDefault();
        callbacks.onOpenFile(filePath);
        return true;
      }

      return false;
    },

    keydown(event: KeyboardEvent, view: EditorView) {
      if (event.key === "Meta") {
        view.dispatch({ effects: setMetaHeld.of(true) });
      }
      return false;
    },

    keyup(event: KeyboardEvent, view: EditorView) {
      if (event.key === "Meta") {
        view.dispatch({ effects: setMetaHeld.of(false) });
      }
      return false;
    },

    blur(_event: FocusEvent, view: EditorView) {
      if (view.state.field(metaHeldField)) {
        view.dispatch({ effects: setMetaHeld.of(false) });
      }
      return false;
    },
  });

  return [metaHeldField, linkDecorationsPlugin, clickHandler, theme];
}
