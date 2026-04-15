import { useState } from "react";
import { Tab } from "../types";

export const TAB_DRAG_TYPE = "application/vibe-tab";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  groupId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onDropTab: (tabId: string, fromGroupId: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  groupId,
  onSelectTab,
  onCloseTab,
  onDropTab,
}: TabBarProps) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        try {
          const data = JSON.parse(e.dataTransfer.getData(TAB_DRAG_TYPE));
          if (data.fromGroupId !== groupId) {
            onDropTab(data.tabId, data.fromGroupId);
          }
        } catch {
          /* ignore invalid drag data */
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        background: dragOver
          ? "rgba(59, 130, 246, 0.1)"
          : "var(--bg-secondary)",
        borderBottom: dragOver
          ? "2px solid var(--accent)"
          : "1px solid var(--border)",
        height: "var(--tab-height)",
        overflow: "hidden",
        flexShrink: 0,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const icon = tab.type === "terminal" ? "›_" : tab.type === "diff" ? "±" : tab.type === "git-log" ? "⊙" : "⬡";
        return (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                TAB_DRAG_TYPE,
                JSON.stringify({ tabId: tab.id, fromGroupId: groupId, tab }),
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onSelectTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px",
              height: "100%",
              cursor: "grab",
              userSelect: "none",
              background: isActive ? "var(--bg-primary)" : "transparent",
              color: isActive
                ? "var(--text-primary)"
                : "var(--text-secondary)",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 11, opacity: 0.6 }}>{icon}</span>
            <span>{tab.title}</span>
            {tab.isDirty && (
              <span style={{ color: "var(--text-secondary)", fontSize: 16 }}>
                •
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              style={{
                opacity: 0.5,
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                marginLeft: 2,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.opacity = "0.5";
              }}
            >
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
