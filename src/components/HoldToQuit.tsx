import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const HOLD_DURATION = 1500; // ms

export function HoldToQuit() {
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);

  const cancel = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setProgress(0);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const tick = useCallback(() => {
    if (!activeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const pct = Math.min(elapsed / HOLD_DURATION, 1);
    setProgress(pct);
    if (pct >= 1) {
      invoke("quit_app").catch(console.error);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "q") {
        e.preventDefault();
        if (!activeRef.current) {
          activeRef.current = true;
          startTimeRef.current = Date.now();
          setActive(true);
          setProgress(0);
          rafRef.current = requestAnimationFrame(tick);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "Meta") {
        cancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", cancel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, cancel]);

  if (!active) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99999,
      background: "rgba(0,0,0,0.45)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
    }}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "32px 48px",
        borderRadius: 12,
        background: "var(--bg-secondary, #1e1e1e)",
        border: "1px solid var(--border, #333)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary, #fff)" }}>
          Hold ⌘Q to quit
        </span>
        <div style={{
          width: 200,
          height: 4,
          borderRadius: 2,
          background: "var(--bg-tertiary, #333)",
          overflow: "hidden",
        }}>
          <div style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 2,
            background: "var(--accent, #007aff)",
            transition: "width 50ms linear",
          }} />
        </div>
      </div>
    </div>
  );
}
