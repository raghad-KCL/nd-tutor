/**
 * Modal offering two options when removing a subproof closure:
 * undo the →I + conclusion only (re-opens the subproof), or
 * delete the entire subproof atomically.
 *
 * @param {Object}   props
 * @param {number}   props.lineCount     - Total lines in the subproof.
 * @param {Function} props.onUndoClosure - Callback to remove only the →I and goal lines.
 * @param {Function} props.onDeleteAll   - Callback to delete the entire subproof.
 * @param {Function} props.onCancel      - Callback to dismiss the modal.
 */
export default function DeleteSubproofModal({ lineCount, onUndoClosure, onDeleteAll, onCancel }) {
  const btnBase = {
    padding: "9px 20px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    width: "100%",
  };
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "modalBackdropIn 0.2s ease-in-out both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f5f8fc",
          borderRadius: 16,
          padding: "28px 32px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          maxWidth: 420,
          width: "calc(100% - 40px)",
          boxSizing: "border-box",
          animation: "modalPanelIn 0.2s ease-in-out both",
        }}
      >
        <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700, color: "#000b21" }}>
          Remove subproof closure?
        </h2>
        <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#3a5068", lineHeight: 1.6 }}>
          Choose how much to remove:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <button
            onClick={onUndoClosure}
            style={{
              ...btnBase,
              border: "1.5px solid #4ca2b5",
              background: "#eaf6f9",
              color: "#1a6475",
            }}
          >
            Remove →I + conclusion only
            <div style={{ fontSize: 11, fontWeight: 500, color: "#3a5068", marginTop: 2 }}>
              Reopens the scope so you can re-derive the conclusion
            </div>
          </button>
          <button
            onClick={onDeleteAll}
            style={{
              ...btnBase,
              border: "1.5px solid #ef4444",
              background: "#fef2f2",
              color: "#b91c1c",
            }}
          >
            Delete entire subproof ({lineCount} line{lineCount !== 1 ? "s" : ""})
            <div style={{ fontSize: 11, fontWeight: 500, color: "#3a5068", marginTop: 2 }}>
              Removes the assumption and everything inside
            </div>
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "9px 20px",
              borderRadius: 10,
              border: "1px solid #c8d8e8",
              background: "transparent",
              color: "#3a5068",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
