import { useState } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore, themes } from "../store/settings-store";
import { useSidebarStore } from "../store/sidebar-store";
import { X, PanelLeft, PanelRight, Check } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    borderRadius, appOpacity, backgroundBlur, colorTheme,
    setBorderRadius, setAppOpacity, setBackgroundBlur, setColorTheme, save,
  } = useSettingsStore();
  const { position, setPosition } = useSidebarStore();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await save();
    setSaving(false);
    onClose();
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxHeight: "80vh",
          background: "var(--bg-secondary)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            Settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Sidebar Position */}
          <Section title="Sidebar Position">
            <div style={{ display: "flex", gap: 8 }}>
              <ToggleButton
                active={position === "left"}
                onClick={() => setPosition("left")}
                icon={<PanelLeft size={16} />}
                label="Left"
              />
              <ToggleButton
                active={position === "right"}
                onClick={() => setPosition("right")}
                icon={<PanelRight size={16} />}
                label="Right"
              />
            </div>
          </Section>

          {/* Border Radius */}
          <Section title="Border Radius" value={`${borderRadius}px`}>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={borderRadius}
              onChange={(e) => setBorderRadius(Number(e.target.value))}
              style={sliderStyle}
            />
          </Section>

          {/* App Opacity */}
          <Section title="Window Opacity" value={`${Math.round(appOpacity * 100)}%`}>
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.05}
              value={appOpacity}
              onChange={(e) => setAppOpacity(Number(e.target.value))}
              style={sliderStyle}
            />
          </Section>

          {/* Background Blur */}
          <Section title="Background Blur" value={`${backgroundBlur}px`}>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={backgroundBlur}
              onChange={(e) => setBackgroundBlur(Number(e.target.value))}
              style={sliderStyle}
            />
          </Section>

          {/* Color Theme */}
          <Section title="Color Theme">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {themes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  active={colorTheme === theme.id}
                  onClick={() => setColorTheme(theme.id)}
                />
              ))}
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
        }}>
          <button onClick={onClose} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById("modal-root")!
  );
}

function Section({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </span>
        {value && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
            {value}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ToggleButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "8px 12px",
        borderRadius: 6,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: active ? "rgba(59, 130, 246, 0.1)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ThemeCard({ theme, active, onClick }: {
  theme: typeof themes[0];
  active: boolean;
  onClick: () => void;
}) {
  const c = theme.colors;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: active ? "rgba(59, 130, 246, 0.08)" : "transparent",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {/* Color preview dots */}
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: c.bgPrimary, border: "1px solid rgba(128,128,128,0.3)" }} />
        <div style={{ width: 14, height: 14, borderRadius: 3, background: c.accent }} />
        <div style={{ width: 14, height: 14, borderRadius: 3, background: c.success }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: active ? 600 : 400, flex: 1, textAlign: "left" }}>
        {theme.name}
      </span>
      {active && <Check size={14} strokeWidth={2} style={{ color: "var(--accent)", flexShrink: 0 }} />}
    </button>
  );
}

const sliderStyle: React.CSSProperties = {
  width: "100%",
  height: 4,
  appearance: "none" as const,
  background: "var(--border)",
  borderRadius: 2,
  outline: "none",
  cursor: "pointer",
  accentColor: "var(--accent)",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 6,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
