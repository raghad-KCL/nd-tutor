import { getSubproofColor, getDirectItemsForScope, boxGoalReached, formatRef } from "../utils";

/**
 * Renders the proof lines in a scope-aware layout with subproof boxes,
 * reference highlighting, broken-ref indicators, and per-line remove
 * buttons.
 *
 * @param {Object}   props
 * @param {Array}    props.displayedLines   - Lines to render (premises or full proof).
 * @param {Array}    props.refsPreview      - Parsed reference numbers/ranges for highlighting.
 * @param {boolean}  props.taskLocked       - Whether the proof task is locked.
 * @param {Object}   props.ruleLabelByValue - Map from rule codes to display labels.
 * @param {Object|null} props.activeBox     - The currently open subproof box, or null.
 * @param {Function} props.onRemoveLine     - Callback invoked with 0-based line index.
 */
export default function ProofWorkspace({
  displayedLines,
  refsPreview,
  taskLocked,
  ruleLabelByValue,
  activeBox,
  onRemoveLine,
}) {
  function renderLineCard(ln) {
    const lineNo = displayedLines.indexOf(ln) + 1;
    const isHighlighted = refsPreview.some((ref) =>
      Array.isArray(ref)
        ? lineNo >= ref[0] && lineNo <= ref[1]
        : ref === lineNo
    );
    const isBroken = !!ln.brokenRef;

    return (
      <div
        key={`line-${lineNo}`}
        className="line-card"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          width: "100%",
          background: isBroken ? "#fff1f2" : isHighlighted ? "#d0eaf5" : "#f5f8fc",
          border: isBroken
            ? "1px solid #fecaca"
            : isHighlighted ? "1px solid #4ca2b5" : "1px solid #c8d8e8",
          borderRadius: 14,
          padding: "10px 14px",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        <div style={{
          color: "#4ca2b5",
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
          minWidth: 28,
          paddingTop: 2,
        }}>
          #{lineNo}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontWeight: 600,
              fontSize: 14,
              color: "#000b21",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={ln.formula}
          >
            {ln.formula}
          </div>

          {ln.kind === "premise" && (
            <div style={{ fontSize: 12, color: "#3a5068", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              premise
            </div>
          )}

          {ln.kind === "assumption" && (
            <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.02em" }}>
              assumption
            </div>
          )}

          {ln.kind === "derived" && (
            <div style={{ fontSize: 12, color: "#3a5068", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(ruleLabelByValue[ln.rule] || ln.rule)}
              {(ln.refs || []).length > 0
                ? ` (${(ln.refs || []).map(formatRef).join(", ")})`
                : ""}
            </div>
          )}

          {isBroken && (
            <div className="feedback-enter" style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {ln.brokenKind === "cascade"
                ? `Depends on invalid line #${ln.brokenRef}`
                : `References deleted line #${ln.brokenRef}`}
            </div>
          )}
        </div>

        {(() => {
          // Remove button only on the last line (bottom-to-top deletion).
          // Premises are never removable.
          const isLast = lineNo === displayedLines.length;
          const canRemove = !taskLocked ? ln.kind !== "premise" : isLast && ln.kind !== "premise";
          if (!canRemove) return null;
          return (
            <button
              onClick={() => onRemoveLine(lineNo - 1)}
              style={{
                flexShrink: 0,
                alignSelf: "flex-start",
                borderRadius: 10,
                padding: "6px 10px",
                background: "#f5f8fc",
                color: "#3a5068",
                border: "1px solid #c8d8e8",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: 12,
              }}
            >
              Remove
            </button>
          );
        })()}
      </div>
    );
  }

  function renderBox(boxLine, depth = 0) {
    const lineNo = displayedLines.indexOf(boxLine) + 1;
    const items = getDirectItemsForScope(boxLine.scopePath || [], displayedLines);
    const goalReached = boxGoalReached(boxLine, displayedLines);
    const isOpenBox = activeBox && activeBox.assumptionLineNo === lineNo;
    const color = getSubproofColor(depth);

    return (
      <div
        key={`box-${lineNo}`}
        style={{
          borderLeft: `4px solid ${color.border}`,
          borderRight: `1px solid ${color.border}55`,
          borderTop: `1px solid ${color.border}55`,
          borderBottom: `1px solid ${color.border}55`,
          borderRadius: 14,
          padding: 14,
          marginTop: 8,
          marginBottom: 8,
          background: color.bg,
          minWidth: 0,
          boxSizing: "border-box",
          boxShadow: isOpenBox
            ? `0 4px 16px ${color.border}33`
            : `0 2px 8px ${color.border}22`,
        }}
      >
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: color.label, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {boxLine.boxRule === "IMP_I" ? "→I subproof" : "subproof"}
            </div>
            {!!boxLine.boxGoal && (
              <div style={{
                display: "inline-block",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                fontWeight: 700,
                color: color.label,
                background: `${color.border}18`,
                border: `1.5px solid ${color.border}88`,
                borderRadius: 7,
                padding: "3px 10px",
                alignSelf: "flex-start",
                letterSpacing: "0.02em",
              }}>
                {boxLine.formula} → {boxLine.boxGoal}
              </div>
            )}
          </div>

          <div style={{ textAlign: "right", fontSize: 13, lineHeight: 1.4 }}>
            {!!boxLine.boxGoal && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: `${color.border}18`,
                border: `1px solid ${color.border}55`,
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 12,
              }}>
                <span style={{ color: color.label, fontWeight: 600 }}>Goal:</span>
                {" "}
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 800, color: color.label }}>
                  {boxLine.boxGoal}
                </span>
              </div>
            )}
            {!!boxLine.boxGoal && (
              <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                {goalReached ? "derived ✅" : "not derived yet"}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          {renderLineCard(boxLine)}

          {items
            .filter((item) => !(item.type === "line" && item.line === boxLine))
            .map((item) =>
              item.type === "line"
                ? renderLineCard(item.line)
                : renderBox(item.line, depth + 1)
            )}
        </div>
      </div>
    );
  }

  function renderScope(scopePath) {
    const items = getDirectItemsForScope(scopePath, displayedLines);
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) =>
          item.type === "line" ? renderLineCard(item.line) : renderBox(item.line)
        )}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", minWidth: 0 }}>
      {renderScope([])}
    </div>
  );
}
