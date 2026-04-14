import { useTabStore } from "../store/tab-store";
import { TabBar } from "./TabBar";
import { EditorTab } from "./EditorTab";
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
  const moveTab = useTabStore((s) => s.moveTab);

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
        groupId={groupId}
        onSelectTab={(tabId) => setActiveTab(groupId, tabId)}
        onCloseTab={(tabId) => removeTab(groupId, tabId)}
        onDropTab={(tabId, fromGroupId) => moveTab(fromGroupId, groupId, tabId)}
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
          return (
            <EditorTab
              key={tab.id}
              tabId={tab.id}
              groupId={groupId}
              filePath={tab.filePath ?? ""}
              isActive={isActive}
            />
          );
        })}
      </div>
    </div>
  );
}
