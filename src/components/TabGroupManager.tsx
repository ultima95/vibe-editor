import { useTabStore } from "../store/tab-store";
import { TabGroup } from "./TabGroup";
import { SplitNode } from "../types";

function RenderNode({ node }: { node: SplitNode }) {
  if (node.type === "leaf") {
    return node.groupId ? <TabGroup groupId={node.groupId} /> : null;
  }

  const isVertical = node.direction === "vertical";
  const ratio = node.ratio ?? 0.5;
  const [first, second] = node.children ?? [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isVertical ? "row" : "column",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          [isVertical ? "width" : "height"]: `${ratio * 100}%`,
          overflow: "hidden",
        }}
      >
        {first && <RenderNode node={first} />}
      </div>
      <div
        style={{
          [isVertical ? "width" : "height"]: "1px",
          background: "var(--border)",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {second && <RenderNode node={second} />}
      </div>
    </div>
  );
}

export function TabGroupManager() {
  const layout = useTabStore((s) => s.layout);
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <RenderNode node={layout} />
    </div>
  );
}
