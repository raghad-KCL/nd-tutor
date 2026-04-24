const typeStyles = {
  success:  { bg: "#f0fdf4", border: "#22c55e", titleColor: "#166534", icon: "✓" },
  error:    { bg: "#fff1f2", border: "#ef4444", titleColor: "#991b1b", icon: "✕" },
  info:     { bg: "#eff6ff", border: "#3b82f6", titleColor: "#1d4ed8", icon: "ℹ" },
  complete: { bg: "#e8f0f8", border: "#4ca2b5", titleColor: "#4ca2b5", icon: "✓" },
};

/**
 * Fixed-position container that renders a stack of toast notifications
 * in the bottom-right corner. Each toast is dismissible via a close button.
 *
 * @param {Object}   props
 * @param {Array<{id: number, type: string, title: string, message: string}>} props.toasts
 *   - Active toast objects to display.
 * @param {Function} props.onDismiss - Callback invoked with the toast id to dismiss.
 */
export default function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={{
      position: "fixed",
      bottom: 28,
      right: 28,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      maxWidth: 360,
      width: "calc(100% - 56px)",
      pointerEvents: "none",
    }}>
      {toasts.map((toast) => {
        const s = typeStyles[toast.type] || typeStyles.info;
        return (
          <div key={toast.id} style={{
            background: s.bg,
            borderLeft: `4px solid ${s.border}`,
            borderRadius: 12,
            padding: "14px 16px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            pointerEvents: "all",
            animation: "toastIn 0.2s ease-out",
          }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
              <span style={{ color: s.border, fontWeight: 700, fontSize: 16, marginTop: 1, flexShrink: 0 }}>
                {s.icon}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: s.titleColor, marginBottom: 3 }}>
                  {toast.title}
                </div>
                {toast.message && (
                  <div style={{ fontSize: 13, color: "#3a5068", lineHeight: 1.5 }}>
                    {toast.message}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => onDismiss(toast.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 18, color: "#3a5068", padding: 0, lineHeight: 1, flexShrink: 0,
            }}>×</button>
          </div>
        );
      })}
    </div>
  );
}
