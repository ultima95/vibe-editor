import { useEffect, useRef, useSyncExternalStore } from "react";
import { Tab } from "../types";

export interface TabDragData {
  tabId: string;
  fromGroupId: string;
  tab: Tab;
}

type DropHandler = (data: TabDragData) => void;

interface DragState {
  active: boolean;
  data: TabDragData | null;
  ghost: HTMLDivElement | null;
  startX: number;
  startY: number;
  started: boolean;
  dropZones: Map<string, { rect: () => DOMRect; onDrop: DropHandler }>;
  listeners: Set<() => void>;
  snapshot: boolean;
}

function getState(): DragState {
  const w = window as any;
  if (!w.__tabDrag) {
    w.__tabDrag = {
      active: false,
      data: null,
      ghost: null,
      startX: 0,
      startY: 0,
      started: false,
      dropZones: new Map(),
      listeners: new Set(),
      snapshot: false,
    } as DragState;
  }
  return w.__tabDrag;
}

function notify() {
  const s = getState();
  s.snapshot = s.active;
  s.listeners.forEach((fn) => fn());
}

/** React hook: returns true while a tab drag is in progress */
export function useTabDragActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const s = getState();
      s.listeners.add(cb);
      return () => { s.listeners.delete(cb); };
    },
    () => getState().snapshot,
  );
}

/** Register a drop zone for a pane */
export function useDropZone(
  groupId: string,
  ref: React.RefObject<HTMLDivElement | null>,
  onDrop: DropHandler,
) {
  const handlerRef = useRef(onDrop);
  handlerRef.current = onDrop;

  useEffect(() => {
    const s = getState();
    s.dropZones.set(groupId, {
      rect: () => ref.current?.getBoundingClientRect() ?? new DOMRect(),
      onDrop: (data) => handlerRef.current(data),
    });
    return () => { s.dropZones.delete(groupId); };
  }, [groupId, ref]);
}

const DRAG_THRESHOLD = 5;

/** Call from onMouseDown on a tab to begin tracking a potential drag */
export function startTabDrag(
  e: React.MouseEvent,
  data: TabDragData,
  label: string,
) {
  e.preventDefault();
  const s = getState();
  s.data = data;
  s.startX = e.clientX;
  s.startY = e.clientY;
  s.started = false;
  s.active = false;

  const onMouseMove = (ev: MouseEvent) => {
    const dx = ev.clientX - s.startX;
    const dy = ev.clientY - s.startY;

    if (!s.started) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      s.started = true;
      s.active = true;

      const ghost = document.createElement("div");
      ghost.textContent = label;
      Object.assign(ghost.style, {
        position: "fixed",
        top: "0",
        left: "0",
        padding: "4px 12px",
        background: "var(--bg-secondary)",
        border: "1px solid var(--accent)",
        borderRadius: "6px",
        color: "var(--text-primary)",
        fontSize: "12px",
        pointerEvents: "none",
        zIndex: "99999",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        whiteSpace: "nowrap",
        opacity: "0.9",
      });
      document.body.appendChild(ghost);
      s.ghost = ghost;
      notify();
    }

    if (s.ghost) {
      s.ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY - 14}px)`;
    }
  };

  const onMouseUp = (ev: MouseEvent) => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "";

    if (s.ghost) {
      document.body.removeChild(s.ghost);
      s.ghost = null;
    }

    if (s.started && s.data) {
      for (const [zoneGroupId, zone] of s.dropZones) {
        if (zoneGroupId === s.data.fromGroupId) continue;
        const rect = zone.rect();
        if (
          ev.clientX >= rect.left &&
          ev.clientX <= rect.right &&
          ev.clientY >= rect.top &&
          ev.clientY <= rect.bottom
        ) {
          zone.onDrop(s.data);
          break;
        }
      }
    }

    s.active = false;
    s.data = null;
    s.started = false;
    notify();
  };

  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
