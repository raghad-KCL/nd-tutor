import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { RULES } from "../utils";

function RuleSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState(null); // { rule, top, left }
  const ref = useRef(null);

  useEffect(() => {
    function onOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  const selected = RULES.find((r) => r.value === value) || RULES[0];

  function handleRowMouseEnter(e, r) {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ rule: r, top: rect.top, left: rect.left });
  }

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          borderRadius: 10,
          padding: "10px 12px",
          background: "#f5f8fc",
          color: "#000b21",
          border: "1px solid #c8d8e8",
          outline: "none",
          boxSizing: "border-box",
          textAlign: "left",
          cursor: "pointer",
          fontSize: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          transition: "border-color 0.18s ease-in-out, box-shadow 0.18s ease-in-out",
          ...(open ? { borderColor: "#4ca2b5", boxShadow: "0 0 0 2px rgba(76,162,181,0.15)" } : {}),
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected.label}
        </span>
        <span style={{
          fontSize: 10, color: "#3a5068", flexShrink: 0,
          display: "inline-block",
          transition: "transform 0.18s ease-in-out",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}>▼</span>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #c8d8e8",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 200,
            maxHeight: 272,
            overflowY: "auto",
            transformOrigin: "top center",
            animation: "dropdownIn 0.18s ease-in-out both",
          }}
        >
          {RULES.map((r) => (
            <div
              key={r.value}
              onMouseEnter={(e) => handleRowMouseEnter(e, r)}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => { onChange(r.value); setOpen(false); setTooltip(null); }}
              style={{
                padding: "9px 12px",
                cursor: "pointer",
                background: r.value === value ? "#e4f0f8" : tooltip?.rule?.value === r.value ? "#f0f6fa" : "#fff",
                color: "#000b21",
                fontSize: 14,
                borderBottom: "1px solid #f0f4f8",
                transition: "background-color 0.15s ease-in-out",
              }}
            >
              {r.label}
            </div>
          ))}
        </div>
      )}

      {/* Tooltip — portalled into document.body, position: fixed, escapes all overflow clipping */}
      {tooltip && createPortal(
        <div
          style={{
            position: "fixed",
            top: tooltip.top,
            left: tooltip.left - 10,
            transform: "translateX(-100%)",
            background: "#000b21",
            color: "#e8f0f8",
            borderRadius: 8,
            padding: "10px 14px",
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            whiteSpace: "nowrap",
            animation: "tooltipIn 0.15s ease-in-out both",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 7, color: "#ffffff" }}>
            {tooltip.rule.name}
          </div>
          <pre
            style={{
              margin: 0,
              fontFamily: "'Courier New', monospace",
              fontSize: 12,
              color: "#c8dff0",
              whiteSpace: "pre",
              lineHeight: 1.65,
            }}
          >
            {tooltip.rule.schema}
          </pre>
        </div>,
        document.body
      )}
    </div>
  );
}

const toolButtonStyle = {
  borderRadius: 10,
  padding: "8px 12px",
  background: "#f5f8fc",
  color: "#3a5068",
  border: "1px solid #c8d8e8",
  cursor: "pointer",
  fontWeight: 500,
  minWidth: 44,
  fontSize: 14,
};

export default function StepInputPanel({
  stepFormula,
  rule,
  refsText,
  loading,
  taskLocked,
  checkingProof,
  savingProof,
  onSetStepFormula,
  onSetRule,
  onSetRefsText,
  onFocus,
  onInsertToken,
  onValidateAndAdd,
  onCheckProof,
  onSaveProof,
}) {
  return (
    <>
      <div style={{ fontSize: 13, color: "#3a5068", fontWeight: 500, marginBottom: 6 }}>Formula</div>
      <input
        data-field="step"
        onFocus={(e) => onFocus(e.target)}
        value={stepFormula}
        onChange={(e) => onSetStepFormula(e.target.value)}
        className="nd-input"
        placeholder={
          rule === "IMP_I"
            ? "e.g. C -> D"
            : "Enter the formula for the new derived line"
        }
        style={{
          width: "100%",
          maxWidth: "100%",
          borderRadius: 10,
          padding: 10,
          background: "#f5f8fc",
          color: "#000b21",
          border: "1px solid #c8d8e8",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: 12, fontSize: 13, color: "#3a5068", fontWeight: 500, marginBottom: 6 }}>
        Rule
      </div>
      <RuleSelect value={rule} onChange={onSetRule} />

      {rule !== "IMP_I" && (
        <div className="refs-field-enter">
          <div style={{ marginTop: 12, fontSize: 13, color: "#3a5068", fontWeight: 500, marginBottom: 6 }}>
            References — line numbers or ranges (e.g. <code>3-5</code>)
          </div>
          <input
            data-field="refs"
            onFocus={(e) => onFocus(e.target)}
            value={refsText}
            onChange={(e) => onSetRefsText(e.target.value)}
            className="nd-input"
            placeholder={rule === "REIT" ? "e.g. 3" : "e.g. 1, 2  or  3-5"}
            style={{
              width: "100%",
              maxWidth: "100%",
              borderRadius: 10,
              padding: 10,
              background: "#f5f8fc",
              color: "#000b21",
              border: "1px solid #c8d8e8",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
          Insert symbols (click an input first):
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["¬", "∧", "∨", "→", "↔", "(", ")"].map((t) => (
            <button key={t} type="button" onClick={() => onInsertToken(t)} className="symbol-btn" style={toolButtonStyle}>
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onInsertToken(" ")}
            className="symbol-btn"
            style={{ ...toolButtonStyle, minWidth: 72, fontWeight: 700 }}
          >
            space
          </button>
        </div>
      </div>

      <button
        onClick={onValidateAndAdd}
        disabled={loading || !taskLocked}
        className="nd-btn-primary"
        style={{
          marginTop: 14,
          width: "100%",
          borderRadius: 12,
          padding: "12px 14px",
          background: taskLocked ? "#4ca2b5" : "#e8f0f8",
          color: taskLocked ? "#ffffff" : "#3a5068",
          border: "none",
          cursor: taskLocked ? "pointer" : "not-allowed",
          fontWeight: 700,
          fontSize: 15,
          transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out, opacity 0.18s ease-in-out",
          opacity: loading ? 0.7 : 1,
        }}
        title={
          taskLocked
            ? "Validate the proposed step and add it to the proof."
            : "Start the proof first."
        }
      >
        {loading ? "Working..." : "Validate & Add"}
      </button>

      <button
        onClick={onCheckProof}
        disabled={checkingProof || !taskLocked}
        className="nd-btn-primary"
        style={{
          marginTop: 10,
          width: "100%",
          borderRadius: 12,
          padding: "12px 14px",
          background: taskLocked ? "#4ca2b5" : "#e8f0f8",
          color: taskLocked ? "#ffffff" : "#3a5068",
          border: "none",
          cursor: taskLocked ? "pointer" : "not-allowed",
          fontWeight: 700,
          fontSize: 15,
          transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out, opacity 0.18s ease-in-out",
          opacity: checkingProof ? 0.7 : 1,
        }}
      >
        {checkingProof ? "Checking..." : "Check Proof"}
      </button>

      <button
        onClick={onSaveProof}
        disabled={savingProof || !taskLocked}
        className="nd-btn-primary"
        style={{
          marginTop: 10,
          width: "100%",
          borderRadius: 12,
          padding: "12px 14px",
          background: taskLocked ? "#4ca2b5" : "#e8f0f8",
          color: taskLocked ? "#ffffff" : "#3a5068",
          border: "none",
          cursor: taskLocked ? "pointer" : "not-allowed",
          fontWeight: 700,
          fontSize: 15,
          transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out, opacity 0.18s ease-in-out",
          opacity: savingProof ? 0.7 : 1,
        }}
      >
        {savingProof ? "Saving..." : "Save Proof"}
      </button>

      {!taskLocked && (
        <div style={{ marginTop: 10, color: "#3a5068", fontSize: 12 }}>
          Start the proof first to validate steps.
        </div>
      )}
    </>
  );
}
