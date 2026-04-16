export interface Tab {
  id: string;
  type: "terminal" | "editor" | "diff" | "git-log";
  title: string;
  ptyId?: string;
  filePath?: string;
  isDirty?: boolean;
  diffCached?: boolean;
  cwd?: string;
}

export interface TabGroup {
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

export type SplitDirection = "horizontal" | "vertical";

export interface SplitNode {
  type: "leaf" | "split";
  direction?: SplitDirection;
  ratio?: number;
  groupId?: string;
  children?: SplitNode[];
}

export interface SidebarState {
  visible: boolean;
  position: "left" | "right";
  width: number;
  activePanel: "files" | "search";
}
