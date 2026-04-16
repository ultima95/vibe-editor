import { useCallback, useRef, useState } from "react";

interface SplitDividerProps {
  direction: "vertical" | "horizontal";
  onResize: (ratio: number) => void;
  parentRef: React.RefObject<HTMLDivElement | null>;
}

export function SplitDivider({ direction, onResize, parentRef }: SplitDividerProps) {
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);

  const isVertical = direction === "vertical";
  const MIN_PANE_PX = 100;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const parent = parentRef.current;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const totalSize = isVertical ? rect.width : rect.height;
      const startPos = isVertical ? rect.left : rect.top;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = isVertical ? moveEvent.clientX : moveEvent.clientY;
        let ratio = (currentPos - startPos) / totalSize;

        // Clamp to enforce minimum pane size
        const minRatio = MIN_PANE_PX / totalSize;
        const maxRatio = 1 - minRatio;
        ratio = Math.max(minRatio, Math.min(maxRatio, ratio));

        onResize(ratio);
      };

      const handleMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // Re-enable pointer events on all panes
        parent.querySelectorAll<HTMLElement>(":scope > div").forEach((child) => {
          child.style.pointerEvents = "";
        });
      };

      // Disable pointer events on panes during drag
      parent.querySelectorAll<HTMLElement>(":scope > div").forEach((child) => {
        if (child !== dividerRef.current) {
          child.style.pointerEvents = "none";
        }
      });

      document.body.style.cursor = isVertical ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [isVertical, onResize, parentRef],
  );

  const handleDoubleClick = useCallback(() => {
    onResize(0.5);
  }, [onResize]);

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => !dragging && setHovering(false)}
      style={{
        [isVertical ? "width" : "height"]: "5px",
        [isVertical ? "height" : "width"]: "100%",
        cursor: isVertical ? "col-resize" : "row-resize",
        flexShrink: 0,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      {/* Visual line */}
      <div
        style={{
          position: "absolute",
          [isVertical ? "width" : "height"]: "1px",
          [isVertical ? "height" : "width"]: "100%",
          background: hovering || dragging ? "var(--accent)" : "var(--border)",
          transition: "background 0.15s",
        }}
      />
      {/* Grab indicator */}
      <div
        style={{
          [isVertical ? "width" : "height"]: "3px",
          [isVertical ? "height" : "width"]: "32px",
          background: hovering || dragging ? "var(--accent)" : "var(--text-muted)",
          borderRadius: 2,
          opacity: hovering || dragging ? 0.8 : 0,
          transition: "opacity 0.15s, background 0.15s",
          zIndex: 1,
        }}
      />
    </div>
  );
}