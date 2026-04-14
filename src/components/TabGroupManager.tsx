import { useState, useCallback, useRef } from "react";
import { useTabStore } from "../store/tab-store";
import { TabGroup } from "./TabGroup";
import { SplitNode, SplitDirection, Tab } from "../types";
import { TAB_DRAG_TYPE } from "./TabBar";

type Edge = "left" | "right" | "bottom";

const EDGE_SIZE = 30;

function EdgeDropZone({
  edge,
  groupId,
  active,
}: {
  edge: Edge;
  groupId: string;
  active: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const splitGroup = useTabStore((s) => s.splitGroup);
  const removeTab = useTabStore((s) => s.removeTab);

  const direction: SplitDirection =
    edge === "left" || edge === "right" ? "vertical" : "horizontal";
  const insertBefore = edge === "left";

  const positionStyle: React.CSSProperties =
    edge === "left"
      ? { top: 0, left: 0, width: EDGE_SIZE, bottom: 0 }
      : edge === "right"
        ? { top: 0, right: 0, width: EDGE_SIZE, bottom: 0 }
        : { bottom: 0, left: 0, right: 0, height: EDGE_SIZE };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        zIndex: 10,
        pointerEvents: active ? "auto" : "none",
        background: hovering ? "rgba(100, 100, 255, 0.2)" : "transparent",
        border: hovering ? "2px dashed var(--accent)" : "2px dashed transparent",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setHovering(true);
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setHovering(false);
        try {
          const data = JSON.parse(e.dataTransfer.getData(TAB_DRAG_TYPE));
          const tab: Tab = data.tab;
          const fromGroupId: string = data.fromGroupId;
          const tabId: string = data.tabId;

          // Don't split if dragging the only tab in this group to its own edge
          if (fromGroupId === groupId) {
            const group = useTabStore.getState().groups[groupId];
            if (group && group.tabs.length <= 1) return;
          }

          splitGroup(groupId, direction, tab, insertBefore);
          removeTab(fromGroupId, tabId);
        } catch {
          /* ignore invalid drag data */
        }
      }}
    />
  );
}

function DroppableLeaf({ groupId }: { groupId: string }) {
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    dragCounter.current++;
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(() => {
    dragCounter.current = 0;
    setDragActive(false);
  }, []);

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TabGroup groupId={groupId} />
      {(["left", "right", "bottom"] as const).map((edge) => (
        <EdgeDropZone
          key={edge}
          edge={edge}
          groupId={groupId}
          active={dragActive}
        />
      ))}
    </div>
  );
}

function RenderNode({ node }: { node: SplitNode }) {
  if (node.type === "leaf") {
    return node.groupId ? <DroppableLeaf groupId={node.groupId} /> : null;
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
