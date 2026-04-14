import { useTabStore } from "../store/tab-store";
import { TabBar } from "./TabBar";
import { TerminalTab } from "./TerminalTab";

interface TabGroupProps {
  groupId: string;
}

export function TabGroup({ groupId }: TabGroupProps) {
  const group = useTabStore((s) => s.groups[groupId]);
  const activeGroupId = useTabStore((s) => s.activeGroupId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const setActiveGroupId = useTabStore((s) => s.setActiveGroupId);

  if (!group) return null;

  const isActiveGroup = activeGroupId === groupId;

  return (
    <div
      onClick={() => setActiveGroupId(groupId)}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        outline: isActiveGroup ? "1px solid var(--accent)" : "none",
        outlineOffset: -1,
      }}
    >
      <TabBar
        tabs={group.tabs}
        activeTabId={group.activeTabId}
        onSelectTab={(tabId) => setActiveTab(groupId, tabId)}
        onCloseTab={(tabId) => removeTab(groupId, tabId)}
      />
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {group.tabs.map((tab) => {
          const isActive = tab.id === group.activeTabId;
          if (tab.type === "terminal") {
            return (
              <TerminalTab
                key={tab.id}
                isActive={isActive}
              />
            );
          }
          // Editor placeholder
          return (
            <div
              key={tab.id}
              style={{
                display: isActive ? "flex" : "none",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                color: "var(--text-secondary)",
              }}
            >
              Editor: {tab.filePath ?? "untitled"}
            </div>
          );
        })}
      </div>
    </div>
  );
}
