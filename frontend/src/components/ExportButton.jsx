import { useProofExport } from "../hooks/useProofExport";

export default function ExportButton({ proofData, goalTreeElementId, size = 18, iconColor = "#3a5068", borderColor = "#c8d8e8", onExport }) {
  const { exportProof } = useProofExport();

  function handleClick(e) {
    e.stopPropagation();
    exportProof(proofData, goalTreeElementId);
    onExport?.();
  }

  return (
    <button
      onClick={handleClick}
      title="Export proof to PDF"
      style={{
        background: "none",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        cursor: "pointer",
        padding: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: iconColor,
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Arrow pointing down */}
        <line x1="12" y1="3" x2="12" y2="15" />
        <polyline points="8 11 12 15 16 11" />
        {/* Tray/inbox base */}
        <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
      </svg>
    </button>
  );
}
