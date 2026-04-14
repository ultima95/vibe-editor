import { useToastStore } from "../store/toast-store";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 3000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            background:
              toast.type === "error"
                ? "var(--error)"
                : toast.type === "success"
                  ? "var(--success)"
                  : "var(--accent)",
            color: "white",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            cursor: "pointer",
            maxWidth: 360,
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
