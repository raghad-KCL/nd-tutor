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

/**
 * Panel for entering a proof task: premises textarea, conclusion input,
 * symbol toolbar, random-task loader, and Start / Reset buttons.
 *
 * @param {Object}   props
 * @param {string}   props.formPremisesText     - Current premises textarea value.
 * @param {string}   props.formConclusion       - Current conclusion input value.
 * @param {string}   props.randomDifficulty     - Selected difficulty filter for random tasks.
 * @param {boolean}  props.loading              - Whether a request is in flight.
 * @param {string}   props.taskError            - Validation error message to display, or "".
 * @param {boolean}  props.isNarrow             - Whether the viewport triggers narrow layout.
 * @param {Function} props.onChangePremisesText - Premises change handler.
 * @param {Function} props.onSetFormConclusion  - Conclusion change handler.
 * @param {Function} props.onSetRandomDifficulty - Difficulty selector change handler.
 * @param {Function} props.onStartProof         - Start-proof button handler.
 * @param {Function} props.onReset              - Reset button handler.
 * @param {Function} props.onLoadRandomTask     - Random-task button handler.
 * @param {Function} props.onDismissError       - Error dismissal handler.
 * @param {Function} props.onFocus              - Input focus handler (for symbol toolbar).
 * @param {Function} props.onInsertToken        - Symbol insertion handler.
 */
export default function TaskInputPanel({
  formPremisesText,
  formConclusion,
  randomDifficulty,
  loading,
  taskError,
  isNarrow,
  onChangePremisesText,
  onSetFormConclusion,
  onSetRandomDifficulty,
  onStartProof,
  onReset,
  onLoadRandomTask,
  onDismissError,
  onFocus,
  onInsertToken,
}) {
  return (
    <>
      <div
        style={{
          background: "#ffffff",
          border: "1.5px solid #c8d8e8",
          borderRadius: 14,
          padding: 20,
          boxSizing: "border-box",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <h2 style={{ margin: "0 0 14px 0", fontSize: 17, fontWeight: 700, color: "#000b21" }}>Task</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1.15fr 0.85fr",
            gap: 14,
            width: "100%",
            boxSizing: "border-box",
            alignItems: "start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#3a5068", fontWeight: 500, marginBottom: 6 }}>
              Premises (one per line)
            </div>
            <textarea
              data-field="premises"
              onFocus={(e) => onFocus(e.target)}
              value={formPremisesText}
              onChange={(e) => onChangePremisesText(e.target.value)}
              rows={4}
              className="nd-input"
              style={{
                width: "100%",
                maxWidth: "100%",
                borderRadius: 10,
                padding: 10,
                background: "#f5f8fc",
                color: "#000b21",
                border: "1px solid #c8d8e8",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#3a5068", fontWeight: 500, marginBottom: 6 }}>
              Conclusion
            </div>
            <input
              data-field="conclusion"
              onFocus={(e) => onFocus(e.target)}
              value={formConclusion}
              onChange={(e) => onSetFormConclusion(e.target.value)}
              className="nd-input"
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

            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
              Quick tips: you can type symbols or words:
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                <code style={{ color: "#000b21" }}>not / and / or</code>,{" "}
                <code style={{ color: "#000b21" }}>! ~ &amp; | -&gt;</code>,{" "}
                <code style={{ color: "#000b21" }}>¬ ∧ ∨ →</code>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                  Insert symbols (click an input first):
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["¬", "∧", "∨", "→", "(", ")"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onInsertToken(t)}
                      className="symbol-btn"
                      style={toolButtonStyle}
                    >
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
            </div>
          </div>
        </div>
      </div>

      {taskError && (
        <div className="feedback-enter" style={{
          marginTop: 14,
          padding: "12px 16px",
          borderRadius: 10,
          background: "#fff1f2",
          border: "1px solid #fecaca",
          color: "#b91c1c",
          fontSize: 14,
          lineHeight: 1.5,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <span style={{ flex: 1 }}>{taskError}</span>
          <button
            onClick={onDismissError}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0, opacity: 0.6, color: "#b91c1c" }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
        <button
          onClick={onStartProof}
          disabled={loading}
          className="nd-btn-primary"
          style={{
            borderRadius: 12,
            padding: "13px 28px",
            background: loading ? "#e8f0f8" : "#4ca2b5",
            color: loading ? "#3a5068" : "#ffffff",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {loading ? "Working..." : "Start proof →"}
        </button>
        <button
          onClick={onReset}
          disabled={loading}
          className="nd-btn-secondary"
          style={{
            borderRadius: 12,
            padding: "13px 20px",
            background: "transparent",
            color: "#3a5068",
            border: "1px solid #c8d8e8",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Reset
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6 }}>
          <select
            value={randomDifficulty}
            onChange={(e) => onSetRandomDifficulty(e.target.value)}
            disabled={loading}
            style={{
              borderRadius: 10,
              padding: "11px 12px",
              border: "1px solid #c8d8e8",
              background: "#f5f8fc",
              color: "#000b21",
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <option value="any">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <button
            onClick={onLoadRandomTask}
            disabled={loading}
            className="nd-btn-primary"
            style={{
              borderRadius: 12,
              padding: "13px 20px",
              background: loading ? "#e8f0f8" : "#003f82",
              color: loading ? "#3a5068" : "#ffffff",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Random Task
          </button>
        </div>
      </div>
    </>
  );
}
