import { Tab } from "../types";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: TabBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
        height: "var(--tab-height)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const icon = tab.type === "terminal" ? "⬛" : "📄";
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px",
              height: "100%",
              cursor: "pointer",
              userSelect: "none",
              background: isActive ? "var(--bg-primary)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            <span>{icon}</span>
            <span>{tab.title}</span>
            {tab.isDirty && (
              <span style={{ color: "var(--text-secondary)", fontSize: 16 }}>•</span>
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
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
            >
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
