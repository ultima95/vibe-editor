import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { abyss } from "@uiw/codemirror-theme-abyss";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { monokai } from "@uiw/codemirror-theme-monokai";

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
