/**
 * Confirmation modal shown before deleting a proof line that has
 * dependent (referencing) lines. Lists the affected line numbers.
 *
 * @param {Object}   props
 * @param {number[]} props.affectedLineNos - 1-based line numbers that will be flagged.
 * @param {Function} props.onConfirm       - Callback to proceed with deletion.
 * @param {Function} props.onCancel        - Callback to dismiss the modal.
 */
export default function DeleteConfirmModal({ affectedLineNos, onConfirm, onCancel }) {
  const lineList = affectedLineNos.map((n) => `#${n}`).join(", ");
  const lineWord = affectedLineNos.length === 1 ? "Line" : "Lines";
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
          maxWidth: 400,
          width: "calc(100% - 40px)",
          boxSizing: "border-box",
          animation: "modalPanelIn 0.2s ease-in-out both",
        }}
      >
        <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700, color: "#000b21" }}>
          Delete this line?
        </h2>
        <p style={{ margin: "0 0 24px 0", fontSize: 14, color: "#3a5068", lineHeight: 1.6 }}>
          {lineWord} {lineList}{" "}
          {affectedLineNos.length === 1 ? "references" : "reference"} this line and will be
          flagged as invalid. Delete anyway?
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
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
          <button
            onClick={onConfirm}
            style={{
              padding: "9px 20px",
              borderRadius: 10,
              border: "none",
              background: "#ef4444",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
