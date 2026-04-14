import { Sidebar } from "./Sidebar";
import { TabGroupManager } from "./TabGroupManager";
import { useSidebarStore } from "../store/sidebar-store";

export function AppShell() {
  const { position } = useSidebarStore();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: position === "left" ? "row" : "row-reverse",
        width: "100%",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <Sidebar />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TabGroupManager />
      </div>
    </div>
  );
}
