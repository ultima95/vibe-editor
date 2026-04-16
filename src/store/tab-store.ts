import { create } from "zustand";
import { Tab, TabGroup, SplitNode, SplitDirection } from "../types";

let nextGroupNum = 1;

export function createTerminalTab(cwd?: string): Tab {
  const id = `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, type: "terminal", title: "Terminal", cwd };
}

export function duplicateTab(tab: Tab): Tab {
  const id = `${tab.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (tab.type === "terminal") {
    return { id, type: "terminal", title: "Terminal", cwd: tab.cwd };
  }
  return { ...tab, id, isDirty: false, previewMode: false };
}

function createGroup(tab: Tab): TabGroup {
  return {
    id: `group-${nextGroupNum++}`,
    tabs: [tab],
    activeTabId: tab.id,
  };
}

function findAndReplace(
  node: SplitNode,
  targetGroupId: string,
  replacement: SplitNode,
): SplitNode | null {
  if (node.type === "leaf") {
    return node.groupId === targetGroupId ? replacement : null;
  }
  if (!node.children) return null;
  const newChildren = node.children.map((child) => {
    const result = findAndReplace(child, targetGroupId, replacement);
    return result ?? child;
  });
  const changed = newChildren.some((c, i) => c !== node.children![i]);
  return changed ? { ...node, children: newChildren } : null;
}

function removeLeaf(node: SplitNode, targetGroupId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.groupId === targetGroupId ? undefined as unknown as SplitNode : null;
  }
  if (!node.children || node.children.length !== 2) return null;

  const [left, right] = node.children;

  if (left.type === "leaf" && left.groupId === targetGroupId) return right;
  if (right.type === "leaf" && right.groupId === targetGroupId) return left;

  // Recurse into children
  for (let i = 0; i < node.children.length; i++) {
    const result = removeLeaf(node.children[i], targetGroupId);
    if (result !== null) {
      const newChildren = [...node.children];
      newChildren[i] = result;
      return { ...node, children: newChildren };
    }
  }
  return null;
}

function collectGroupIds(node: SplitNode): string[] {
  if (node.type === "leaf") return node.groupId ? [node.groupId] : [];
  if (!node.children) return [];
  return node.children.flatMap(collectGroupIds);
}

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

interface TabStore {
  groups: Record<string, TabGroup>;
  layout: SplitNode;
  activeGroupId: string;

  addTab: (groupId: string, tab: Tab) => void;
  removeTab: (groupId: string, tabId: string) => void;
  setActiveTab: (groupId: string, tabId: string) => void;
  moveTab: (fromGroupId: string, toGroupId: string, tabId: string) => void;

  splitGroup: (groupId: string, direction: SplitDirection, newTab: Tab, insertBefore?: boolean) => void;
  removeGroup: (groupId: string) => void;
  createGroup: (tab: Tab) => void;

  getActiveGroup: () => TabGroup | undefined;
  setActiveGroupId: (id: string) => void;
  togglePreviewMode: (groupId: string, tabId: string) => void;
  setSplitRatio: (nodeId: string, ratio: number) => void;
}

const initialTab = createTerminalTab();
const initialGroup = createGroup(initialTab);

export const useTabStore = create<TabStore>((set, get) => ({
  groups: { [initialGroup.id]: initialGroup },
  layout: { type: "leaf", groupId: initialGroup.id },
  activeGroupId: initialGroup.id,

  addTab: (groupId, tab) =>
    set((s) => {
      const group = s.groups[groupId];
      if (!group) return s;
      return {
        groups: {
          ...s.groups,
          [groupId]: {
            ...group,
            tabs: [...group.tabs, tab],
            activeTabId: tab.id,
          },
        },
        activeGroupId: groupId,
      };
    }),

  removeTab: (groupId, tabId) =>
    set((s) => {
      const group = s.groups[groupId];
      if (!group) return s;

      const newTabs = group.tabs.filter((t) => t.id !== tabId);
      if (newTabs.length === 0) {
        // Remove the entire group
        get().removeGroup(groupId);
        return {};
      }

      const removedIdx = group.tabs.findIndex((t) => t.id === tabId);
      let newActiveId = group.activeTabId;
      if (newActiveId === tabId) {
        const pickIdx = Math.min(removedIdx, newTabs.length - 1);
        newActiveId = newTabs[Math.max(0, pickIdx - (removedIdx >= newTabs.length ? 0 : 0))].id;
        // Pick the tab before the removed one, or the first remaining tab
        const prevIdx = Math.max(0, Math.min(removedIdx - 1, newTabs.length - 1));
        newActiveId = newTabs[prevIdx].id;
      }

      return {
        groups: {
          ...s.groups,
          [groupId]: { ...group, tabs: newTabs, activeTabId: newActiveId },
        },
      };
    }),

  setActiveTab: (groupId, tabId) =>
    set((s) => {
      const group = s.groups[groupId];
      if (!group) return s;
      return {
        groups: {
          ...s.groups,
          [groupId]: { ...group, activeTabId: tabId },
        },
        activeGroupId: groupId,
      };
    }),

  moveTab: (fromGroupId, toGroupId, tabId) =>
    set((s) => {
      const fromGroup = s.groups[fromGroupId];
      const toGroup = s.groups[toGroupId];
      if (!fromGroup || !toGroup) return s;

      const tab = fromGroup.tabs.find((t) => t.id === tabId);
      if (!tab) return s;

      const newFromTabs = fromGroup.tabs.filter((t) => t.id !== tabId);
      const newGroups = { ...s.groups };

      if (newFromTabs.length === 0) {
        // Source group will be empty — remove it after
        delete newGroups[fromGroupId];
        newGroups[toGroupId] = {
          ...toGroup,
          tabs: [...toGroup.tabs, tab],
          activeTabId: tab.id,
        };

        const collapsed = removeLeaf(s.layout, fromGroupId);
        return {
          groups: newGroups,
          layout: collapsed ?? s.layout,
          activeGroupId: toGroupId,
        };
      }

      const fromActiveId =
        fromGroup.activeTabId === tabId
          ? newFromTabs[Math.max(0, newFromTabs.length - 1)].id
          : fromGroup.activeTabId;

      newGroups[fromGroupId] = { ...fromGroup, tabs: newFromTabs, activeTabId: fromActiveId };
      newGroups[toGroupId] = {
        ...toGroup,
        tabs: [...toGroup.tabs, tab],
        activeTabId: tab.id,
      };

      return { groups: newGroups, activeGroupId: toGroupId };
    }),

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

  removeGroup: (groupId) =>
    set((s) => {
      const newGroups = { ...s.groups };
      delete newGroups[groupId];

      const collapsed = removeLeaf(s.layout, groupId);
      const newLayout = collapsed ?? s.layout;

      let newActiveGroupId = s.activeGroupId;
      if (newActiveGroupId === groupId) {
        const remaining = collectGroupIds(newLayout);
        newActiveGroupId = remaining[0] ?? "";
      }

      return {
        groups: newGroups,
        layout: newLayout,
        activeGroupId: newActiveGroupId,
      };
    }),

  createGroup: (tab) =>
    set(() => {
      const newGroup = createGroup(tab);
      return {
        groups: { [newGroup.id]: newGroup },
        layout: { type: "leaf", groupId: newGroup.id },
        activeGroupId: newGroup.id,
      };
    }),

  getActiveGroup: () => {
    const s = get();
    return s.groups[s.activeGroupId];
  },

  setActiveGroupId: (id) => set({ activeGroupId: id }),

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

  setSplitRatio: (nodeId, ratio) =>
    set((s) => {
      const newLayout = updateNodeRatio(s.layout, nodeId, ratio);
      return newLayout ? { layout: newLayout } : s;
    }),
}));
