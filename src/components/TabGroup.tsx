import { useTabStore, duplicateTab } from "../store/tab-store";
import { TabBar } from "./TabBar";
import { EditorTab } from "./EditorTab";
import { TerminalTab } from "./TerminalTab";
import { DiffTab } from "./DiffTab";
import { GitLogTab } from "./GitLogTab";

interface TabGroupProps {
  groupId: string;
}

export function TabGroup({ groupId }: TabGroupProps) {
  const group = useTabStore((s) => s.groups[groupId]);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const setActiveGroupId = useTabStore((s) => s.setActiveGroupId);
  const moveTab = useTabStore((s) => s.moveTab);
  const togglePreviewMode = useTabStore((s) => s.togglePreviewMode);
  const splitGroup = useTabStore((s) => s.splitGroup);

  if (!group) return null;

  const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
  const isMarkdown = activeTab?.type === "editor" && /\.(md|markdown)$/i.test(activeTab.filePath ?? "");

  return (
    <div
      onClick={() => setActiveGroupId(groupId)}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
      <TabBar
        tabs={group.tabs}
        activeTabId={group.activeTabId}
        groupId={groupId}
        onSelectTab={(tabId) => setActiveTab(groupId, tabId)}
        onCloseTab={(tabId) => removeTab(groupId, tabId)}
        onDropTab={(tabId, fromGroupId) => moveTab(fromGroupId, groupId, tabId)}
        showPreviewToggle={isMarkdown}
        isPreviewActive={activeTab?.previewMode ?? false}
        onTogglePreview={() => {
          if (activeTab) togglePreviewMode(groupId, activeTab.id);
        }}
        onSplitRight={() => {
          if (activeTab) splitGroup(groupId, "vertical", duplicateTab(activeTab));
        }}
        onSplitDown={() => {
          if (activeTab) splitGroup(groupId, "horizontal", duplicateTab(activeTab));
        }}
      />
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {group.tabs.map((tab) => {
          const isActive = tab.id === group.activeTabId;
          if (tab.type === "terminal") {
            return (
              <TerminalTab
                key={tab.id}
                cwd={tab.cwd}
                isActive={isActive}
              />
            );
          }
          if (tab.type === "diff") {
            return (
              <DiffTab
                key={tab.id}
                filePath={tab.filePath ?? ""}
                cached={tab.diffCached ?? false}
                isActive={isActive}
              />
            );
          }
          if (tab.type === "git-log") {
            return <GitLogTab key={tab.id} isActive={isActive} />;
          }
          return (
            <EditorTab
              key={tab.id}
              tabId={tab.id}
              groupId={groupId}
              filePath={tab.filePath ?? ""}
              isActive={isActive}
              previewMode={tab.previewMode}
            />
          );
        })}
      </div>
    </div>
  );
}
