import { useState, useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { FuzzyFinder } from "./components/FuzzyFinder";
import { useSidebarStore } from "./store/sidebar-store";
import { useTabStore, createTerminalTab } from "./store/tab-store";
import "./styles/globals.css";

function App() {
  const [fuzzyFinderOpen, setFuzzyFinderOpen] = useState(false);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+P: fuzzy file finder
      if (e.metaKey && e.key === "p") {
        e.preventDefault();
        setFuzzyFinderOpen((o) => !o);
      }
      // Cmd+Shift+F: focus search panel
      if (e.metaKey && e.shiftKey && e.key === "f") {
        e.preventDefault();
        const sidebar = useSidebarStore.getState();
        if (!sidebar.visible) sidebar.toggle();
        sidebar.setActivePanel("search");
      }
      // Cmd+B: toggle sidebar
      if (e.metaKey && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
      // Cmd+T: new terminal tab
      if (e.metaKey && e.key === "t") {
        e.preventDefault();
        const { addTab, activeGroupId } = useTabStore.getState();
        addTab(activeGroupId, createTerminalTab());
      }
      // Cmd+W: close current tab
      if (e.metaKey && e.key === "w") {
        e.preventDefault();
        const { groups, activeGroupId, removeTab } = useTabStore.getState();
        const group = groups[activeGroupId];
        if (group) removeTab(activeGroupId, group.activeTabId);
      }
      // Cmd+\: split vertical, Cmd+Shift+\: split horizontal
      if (e.metaKey && e.key === "\\") {
        e.preventDefault();
        const { activeGroupId, splitGroup } = useTabStore.getState();
        splitGroup(
          activeGroupId,
          e.shiftKey ? "horizontal" : "vertical",
          createTerminalTab()
        );
      }
      // Cmd+1-9: focus tab group by index
      if (e.metaKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const { groups, setActiveGroupId } = useTabStore.getState();
        const groupIds = Object.keys(groups);
        const index = parseInt(e.key) - 1;
        if (groupIds[index]) setActiveGroupId(groupIds[index]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <>
      <AppShell />
      <FuzzyFinder
        isOpen={fuzzyFinderOpen}
        onClose={() => setFuzzyFinderOpen(false)}
      />
    </>
  );
}

export default App;
