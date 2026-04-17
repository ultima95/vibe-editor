import { useState, useCallback, useRef } from "react";
import { useTabStore } from "../store/tab-store";
import { TabGroup } from "./TabGroup";
import { SplitNode, SplitDirection, Tab } from "../types";
import { TAB_DRAG_TYPE, getDragData } from "./TabBar";
import { SplitDivider } from "./SplitDivider";

type Edge = "left" | "right" | "bottom";

const EDGE_SIZE = 60;

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

  const overlayStyle: React.CSSProperties =
    edge === "left"
      ? { top: 4, left: 4, bottom: 4, width: "48%", borderRadius: 6 }
      : edge === "right"
        ? { top: 4, right: 4, bottom: 4, width: "48%", borderRadius: 6 }
        : { bottom: 4, left: 4, right: 4, height: "48%", borderRadius: 6 };

  const label =
    edge === "left" ? "Drop to split left" : edge === "right" ? "Drop to split right" : "Drop to split below";

  return (
    <>
      {/* Invisible hit area for drag detection */}
      <div
        style={{
          position: "absolute",
          ...positionStyle,
          zIndex: 10,
          pointerEvents: active ? "auto" : "none",
        }}
        onDragOver={(e) => {
          if (!getDragData() && !e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
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
          const data = getDragData() ?? (() => {
            try { return JSON.parse(e.dataTransfer.getData(TAB_DRAG_TYPE)); } catch { return null; }
          })();
          if (!data) return;

          const tab: Tab = data.tab;
          const fromGroupId: string = data.fromGroupId;
          const tabId: string = data.tabId;

          if (fromGroupId === groupId) {
            const group = useTabStore.getState().groups[groupId];
            if (group && group.tabs.length <= 1) return;
          }

          splitGroup(groupId, direction, tab, insertBefore);
          removeTab(fromGroupId, tabId);
        }}
      />
      {/* Visual overlay showing where the split will appear */}
      {hovering && (
        <div
          style={{
            position: "absolute",
            ...overlayStyle,
            background: "rgba(59, 130, 246, 0.12)",
            border: "2px dashed rgba(59, 130, 246, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9,
            pointerEvents: "none",
          }}
        >
          <span style={{ color: "rgba(59, 130, 246, 0.6)", fontSize: 12, fontFamily: "system-ui" }}>
            {label}
          </span>
        </div>
      )}
    </>
  );
}

function DroppableLeaf({ groupId }: { groupId: string }) {
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!getDragData() && !e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
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
