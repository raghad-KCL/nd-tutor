import { useState } from "react";

/**
 * Manages a list of ephemeral toast notifications.
 *
 * Each toast auto-dismisses after 5 seconds.
 *
 * @returns {{ toasts: Array<{id: number, type: string, title: string, message: string}>,
 *             showToast: (type: string, title: string, message: string) => void,
 *             dismissToast: (id: number) => void }}
 */
export default function useToasts() {
  const [toasts, setToasts] = useState([]);

  /**
   * Displays a new toast notification.
   *
   * @param {string} type    - Toast category (e.g. "success", "error").
   * @param {string} title   - Short heading shown in the toast.
   * @param {string} message - Descriptive body text.
   */
  function showToast(type, title, message) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  /**
   * Immediately removes a toast by its id.
   *
   * @param {number} id - The toast id to dismiss.
   */
  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, showToast, dismissToast };
}
