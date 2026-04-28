import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type: Toast["type"]) => void;
  removeToast: (id: string) => void;
}

const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type) => {
    const id = `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    const timer = setTimeout(() => {
      toastTimers.delete(id);
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
    toastTimers.set(id, timer);
  },
  removeToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
