import {
  File,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCog,
  FileSpreadsheet,
  FileType,
  Terminal,
  Database,
  Globe,
  Palette,
  Package,
  Lock,
  Key,
  Braces,
  type LucideIcon,
} from "lucide-react";

interface FileIconDef {
  icon: LucideIcon;
  color: string;
}

const EXT_MAP: Record<string, FileIconDef> = {
  // TypeScript
  ts:    { icon: FileCode, color: "#3178c6" },
  tsx:   { icon: FileCode, color: "#3178c6" },
  mts:   { icon: FileCode, color: "#3178c6" },
  cts:   { icon: FileCode, color: "#3178c6" },
  // JavaScript
  js:    { icon: FileCode, color: "#f0db4f" },
  jsx:   { icon: FileCode, color: "#61dafb" },
  mjs:   { icon: FileCode, color: "#f0db4f" },
  cjs:   { icon: FileCode, color: "#f0db4f" },
  // Web
  html:  { icon: Globe,    color: "#e44d26" },
  htm:   { icon: Globe,    color: "#e44d26" },
  css:   { icon: Palette,  color: "#563d7c" },
  scss:  { icon: Palette,  color: "#cd6799" },
  sass:  { icon: Palette,  color: "#cd6799" },
  less:  { icon: Palette,  color: "#1d365d" },
  svg:   { icon: FileImage, color: "#ffb13b" },
  vue:   { icon: FileCode, color: "#41b883" },
  svelte:{ icon: FileCode, color: "#ff3e00" },
  // Data / config
  json:  { icon: FileJson, color: "#f0db4f" },
  jsonc: { icon: FileJson, color: "#f0db4f" },
  yaml:  { icon: FileCog,  color: "#cb171e" },
  yml:   { icon: FileCog,  color: "#cb171e" },
  toml:  { icon: FileCog,  color: "#9c4221" },
  xml:   { icon: FileCode, color: "#e44d26" },
  csv:   { icon: FileSpreadsheet, color: "#217346" },
  // Markdown / text
  md:    { icon: FileText,  color: "#519aba" },
  mdx:   { icon: FileText,  color: "#519aba" },
  txt:   { icon: FileText,  color: "#6d8086" },
  rst:   { icon: FileText,  color: "#6d8086" },
  // Programming languages
  py:    { icon: FileCode, color: "#3572a5" },
  pyi:   { icon: FileCode, color: "#3572a5" },
  rs:    { icon: FileCode, color: "#dea584" },
  go:    { icon: FileCode, color: "#00add8" },
  rb:    { icon: FileCode, color: "#cc342d" },
  java:  { icon: FileCode, color: "#b07219" },
  kt:    { icon: FileCode, color: "#a97bff" },
  kts:   { icon: FileCode, color: "#a97bff" },
  swift: { icon: FileCode, color: "#f05138" },
  c:     { icon: FileCode, color: "#555555" },
  h:     { icon: FileCode, color: "#555555" },
  cpp:   { icon: FileCode, color: "#f34b7d" },
  hpp:   { icon: FileCode, color: "#f34b7d" },
  cc:    { icon: FileCode, color: "#f34b7d" },
  cs:    { icon: FileCode, color: "#178600" },
  php:   { icon: FileCode, color: "#4f5d95" },
  lua:   { icon: FileCode, color: "#000080" },
  zig:   { icon: FileCode, color: "#f7a41d" },
  dart:  { icon: FileCode, color: "#00b4ab" },
  ex:    { icon: FileCode, color: "#6e4a7e" },
  exs:   { icon: FileCode, color: "#6e4a7e" },
  erl:   { icon: FileCode, color: "#b83998" },
  hs:    { icon: FileCode, color: "#5e5086" },
  ml:    { icon: FileCode, color: "#dc6b1e" },
  r:     { icon: FileCode, color: "#198ce7" },
  scala: { icon: FileCode, color: "#c22d40" },
  clj:   { icon: FileCode, color: "#63b132" },
  // Shell / scripting
  sh:    { icon: Terminal,  color: "#89e051" },
  bash:  { icon: Terminal,  color: "#89e051" },
  zsh:   { icon: Terminal,  color: "#89e051" },
  fish:  { icon: Terminal,  color: "#89e051" },
  ps1:   { icon: Terminal,  color: "#012456" },
  bat:   { icon: Terminal,  color: "#c1f12e" },
  cmd:   { icon: Terminal,  color: "#c1f12e" },
  // Database
  sql:   { icon: Database,  color: "#e38c00" },
  db:    { icon: Database,  color: "#e38c00" },
  sqlite:{ icon: Database,  color: "#003b57" },
  // Image
  png:   { icon: FileImage, color: "#a074c4" },
  jpg:   { icon: FileImage, color: "#a074c4" },
  jpeg:  { icon: FileImage, color: "#a074c4" },
  gif:   { icon: FileImage, color: "#a074c4" },
  webp:  { icon: FileImage, color: "#a074c4" },
  ico:   { icon: FileImage, color: "#a074c4" },
  bmp:   { icon: FileImage, color: "#a074c4" },
  // Video / audio
  mp4:   { icon: FileVideo, color: "#fd4659" },
  webm:  { icon: FileVideo, color: "#fd4659" },
  mkv:   { icon: FileVideo, color: "#fd4659" },
  avi:   { icon: FileVideo, color: "#fd4659" },
  mov:   { icon: FileVideo, color: "#fd4659" },
  mp3:   { icon: FileAudio, color: "#e95a9c" },
  wav:   { icon: FileAudio, color: "#e95a9c" },
  ogg:   { icon: FileAudio, color: "#e95a9c" },
  flac:  { icon: FileAudio, color: "#e95a9c" },
  // Archives
  zip:   { icon: FileArchive, color: "#e4b94e" },
  tar:   { icon: FileArchive, color: "#e4b94e" },
  gz:    { icon: FileArchive, color: "#e4b94e" },
  bz2:   { icon: FileArchive, color: "#e4b94e" },
  xz:    { icon: FileArchive, color: "#e4b94e" },
  "7z":  { icon: FileArchive, color: "#e4b94e" },
  rar:   { icon: FileArchive, color: "#e4b94e" },
  // Package / dependency
  wasm:  { icon: Package,   color: "#654ff0" },
  // Font
  ttf:   { icon: FileType,  color: "#a074c4" },
  otf:   { icon: FileType,  color: "#a074c4" },
  woff:  { icon: FileType,  color: "#a074c4" },
  woff2: { icon: FileType,  color: "#a074c4" },
  eot:   { icon: FileType,  color: "#a074c4" },
  // Security
  pem:   { icon: Lock,      color: "#e8bd36" },
  key:   { icon: Key,       color: "#e8bd36" },
  crt:   { icon: Lock,      color: "#e8bd36" },
  cert:  { icon: Lock,      color: "#e8bd36" },
  // Misc
  graphql: { icon: Braces,  color: "#e535ab" },
  gql:     { icon: Braces,  color: "#e535ab" },
  proto:   { icon: FileCode, color: "#6d8086" },
  tf:      { icon: FileCog,  color: "#5c4ee5" },
  hcl:     { icon: FileCog,  color: "#5c4ee5" },
  nix:     { icon: FileCog,  color: "#7ebae4" },
};

const FILENAME_MAP: Record<string, FileIconDef> = {
  "Dockerfile":      { icon: Package,   color: "#2496ed" },
  "docker-compose.yml": { icon: Package, color: "#2496ed" },
  "docker-compose.yaml": { icon: Package, color: "#2496ed" },
  ".dockerignore":   { icon: Package,   color: "#2496ed" },
  "Makefile":        { icon: Terminal,   color: "#6d8086" },
  "CMakeLists.txt":  { icon: FileCog,   color: "#6d8086" },
  ".gitignore":      { icon: FileCog,   color: "#f14e32" },
  ".gitattributes":  { icon: FileCog,   color: "#f14e32" },
  ".gitmodules":     { icon: FileCog,   color: "#f14e32" },
  ".editorconfig":   { icon: FileCog,   color: "#6d8086" },
  ".prettierrc":     { icon: FileCog,   color: "#c596c7" },
  ".prettierignore": { icon: FileCog,   color: "#c596c7" },
  ".eslintrc":       { icon: FileCog,   color: "#4b32c3" },
  ".eslintrc.js":    { icon: FileCog,   color: "#4b32c3" },
  ".eslintrc.json":  { icon: FileCog,   color: "#4b32c3" },
  ".eslintrc.cjs":   { icon: FileCog,   color: "#4b32c3" },
  "eslint.config.js":  { icon: FileCog, color: "#4b32c3" },
  "eslint.config.mjs": { icon: FileCog, color: "#4b32c3" },
  "eslint.config.ts":  { icon: FileCog, color: "#4b32c3" },
  ".env":            { icon: FileCog,   color: "#ecd53f" },
  ".env.local":      { icon: FileCog,   color: "#ecd53f" },
  ".env.development":{ icon: FileCog,   color: "#ecd53f" },
  ".env.production": { icon: FileCog,   color: "#ecd53f" },
  ".env.test":       { icon: FileCog,   color: "#ecd53f" },
  "package.json":    { icon: Package,   color: "#e8363a" },
  "package-lock.json": { icon: Package, color: "#e8363a" },
  "yarn.lock":       { icon: Package,   color: "#2c8ebb" },
  "pnpm-lock.yaml":  { icon: Package,   color: "#f69220" },
  "bun.lockb":       { icon: Package,   color: "#f9f1e1" },
  "Cargo.toml":      { icon: Package,   color: "#dea584" },
  "Cargo.lock":      { icon: Package,   color: "#dea584" },
  "go.mod":          { icon: Package,   color: "#00add8" },
  "go.sum":          { icon: Package,   color: "#00add8" },
  "Gemfile":         { icon: Package,   color: "#cc342d" },
  "Gemfile.lock":    { icon: Package,   color: "#cc342d" },
  "requirements.txt":{ icon: Package,   color: "#3572a5" },
  "pyproject.toml":  { icon: Package,   color: "#3572a5" },
  "tsconfig.json":   { icon: FileCog,   color: "#3178c6" },
  "tsconfig.node.json": { icon: FileCog, color: "#3178c6" },
  "vite.config.ts":  { icon: FileCog,   color: "#646cff" },
  "vite.config.js":  { icon: FileCog,   color: "#646cff" },
  "webpack.config.js": { icon: FileCog, color: "#8dd6f9" },
  "rollup.config.js":  { icon: FileCog, color: "#ef3335" },
  "tailwind.config.js": { icon: FileCog, color: "#38bdf8" },
  "tailwind.config.ts": { icon: FileCog, color: "#38bdf8" },
  "postcss.config.js":  { icon: FileCog, color: "#dd3a0a" },
  "next.config.js":  { icon: FileCog,   color: "#ffffff" },
  "next.config.mjs": { icon: FileCog,   color: "#ffffff" },
  "next.config.ts":  { icon: FileCog,   color: "#ffffff" },
  "LICENSE":         { icon: FileText,  color: "#d4aa00" },
  "LICENSE.md":      { icon: FileText,  color: "#d4aa00" },
  "README.md":       { icon: FileText,  color: "#519aba" },
  "CHANGELOG.md":    { icon: FileText,  color: "#519aba" },
  ".npmrc":          { icon: FileCog,   color: "#cb3837" },
  ".nvmrc":          { icon: FileCog,   color: "#3c873a" },
  ".node-version":   { icon: FileCog,   color: "#3c873a" },
  ".browserslistrc": { icon: FileCog,   color: "#ffd539" },
  "jest.config.js":  { icon: FileCog,   color: "#99425b" },
  "jest.config.ts":  { icon: FileCog,   color: "#99425b" },
  "vitest.config.ts":{ icon: FileCog,   color: "#729b1b" },
  "biome.json":      { icon: FileCog,   color: "#60a5fa" },
};

const DEFAULT_DEF: FileIconDef = { icon: File, color: "var(--text-muted)" };

export function getFileIconDef(filename: string): FileIconDef {
  // Exact filename match first
  if (FILENAME_MAP[filename]) return FILENAME_MAP[filename];

  // Dotfiles starting with . that aren't in filename map — treat as config
  if (filename.startsWith(".") && !filename.includes(".", 1)) {
    return { icon: FileCog, color: "#6d8086" };
  }

  // Extension match
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx > 0) {
    const ext = filename.slice(dotIdx + 1).toLowerCase();
    if (EXT_MAP[ext]) return EXT_MAP[ext];
  }

  return DEFAULT_DEF;
}

interface FileIconProps {
  filename: string;
  size?: number;
  strokeWidth?: number;
  colorOverride?: string;
}

export function FileIcon({ filename, size = 14, strokeWidth = 1.5, colorOverride }: FileIconProps) {
  const def = getFileIconDef(filename);
  const Icon = def.icon;
  return <Icon size={size} strokeWidth={strokeWidth} style={{ color: colorOverride ?? def.color }} />;
}
