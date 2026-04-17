import { useRef, useCallback } from "react";
import { useTabStore } from "../store/tab-store";
import { TabGroup } from "./TabGroup";
import { SplitNode } from "../types";
import { SplitDivider } from "./SplitDivider";
import { useDropZone, useTabDragActive } from "../hooks/use-tab-drag";

function DroppableLeaf({ groupId }: { groupId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const moveTab = useTabStore((s) => s.moveTab);
  const dragActive = useTabDragActive();

  const handleDrop = useCallback(
    (data: { tabId: string; fromGroupId: string }) => {
      moveTab(data.fromGroupId, groupId, data.tabId);
    },
    [groupId, moveTab],
  );

  useDropZone(groupId, ref, handleDrop);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: "100%" }}>
      <TabGroup groupId={groupId} />
      {/* Highlight overlay while dragging over this pane */}
      {dragActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 8,
            border: "2px solid transparent",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function RenderNode({ node }: { node: SplitNode }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const setSplitRatio = useTabStore((s) => s.setSplitRatio);

  if (node.type === "leaf") {
    return node.groupId ? <DroppableLeaf groupId={node.groupId} /> : null;
  }

  const isVertical = node.direction === "vertical";
  const ratio = node.ratio ?? 0.5;
  const [first, second] = node.children ?? [];
  const nodeId = node.id;

  return (
    <div
      ref={parentRef}
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
      <SplitDivider
        direction={isVertical ? "vertical" : "horizontal"}
        parentRef={parentRef}
        onResize={(newRatio) => {
          if (nodeId) setSplitRatio(nodeId, newRatio);
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
