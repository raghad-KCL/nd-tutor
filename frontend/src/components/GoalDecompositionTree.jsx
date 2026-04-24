// GoalDecompositionTree.jsx — FR5: Forward Dynamic Goal Tree
//
// Builds entirely from `lines` state — no speculation.
// Structure:
//   • Conclusion node at top (green when proved at top level, hollow otherwise)
//   • Proof lines shown in order below, grouped by scope
//   • Each subproof = dashed bordered box containing its lines recursively
//   • Updates live as lines change

import { useMemo } from "react";
import { getDirectItemsForScope, boxGoalReached } from "../utils";

// ── Rule display names ─────────────────────────────────────────────────────

const RULE_LABELS = {
  IMP_I:   "→I",   IMP_E:  "→E",
  AND_I:   "∧I",   AND_E1: "∧E₁",  AND_E2: "∧E₂",
  OR_I1:   "∨I₁",  OR_I2:  "∨I₂",  OR_E:   "∨E",
  NEG_I:   "¬I",   NEG_E:  "¬E",
  IFF_I:   "↔I",   IFF_E:  "↔E",
  REIT:    "Reit",
  PREMISE: "premise",
  ASSUME:  "assumption",
};

// ── Colour palette ─────────────────────────────────────────────────────────

const C = {
  proved:           { dot: "#22c55e", border: "#22c55e", bg: "#f0fdf4", text: "#166534" },
  premise:          { dot: "#4ca2b5", border: "#4ca2b5", bg: "#e8f8fb", text: "#004d5e" },
  assumption:       { dot: "#c49a3c", border: "#c49a3c", bg: "#fffbeb", text: "#78530a" },
  assumptionActive: { dot: "#f59e0b", border: "#f59e0b", bg: "#fef3c7", text: "#92400e" },
  derived:          { dot: "#6ee7b7", border: "#34d399", bg: "#f9fafb", text: "#374151" },
  unproved:         { dot: null,      border: "#c8d8e8", bg: "#f5f8fc", text: "#3a5068" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Checks whether an assumption line has been discharged by an →I line.
 *
 * @param {number} lineNo - 1-based line number of the assumption.
 * @param {Array}  lines  - Current proof lines.
 * @returns {boolean}
 */
function isDischargedLineNo(lineNo, lines) {
  return lines.some((l) => (l.discharges || []).includes(lineNo));
}

// Sort items from getDirectItemsForScope by their position in lines[]
/**
 * Sorts scope items by their order of appearance in the proof lines array.
 *
 * @param {Array} items - Items returned by `getDirectItemsForScope`.
 * @param {Array} lines - Current proof lines.
 * @returns {Array} A new sorted array.
 */
function sortedItems(items, lines) {
  return [...items].sort(
    (a, b) => lines.indexOf(a.line) - lines.indexOf(b.line)
  );
}

// ── Step card — one proof line ─────────────────────────────────────────────

/**
 * Renders a single proof line as a coloured card with a status dot,
 * formula text, sublabel (rule / role), and line number.
 *
 * @param {Object}  props
 * @param {Object}  props.line       - The proof line object.
 * @param {number}  props.lineNo     - 1-based line number.
 * @param {Array}   props.lines      - Full proof lines (for discharge lookup).
 * @param {boolean} props.isGoalLine - Whether this line matches the conclusion.
 */
function StepCard({ line, lineNo, lines, isGoalLine }) {
  const { formula, kind, rule = "" } = line;
  const ruleLabel = RULE_LABELS[rule] || rule;
  const isAssumption = kind === "assumption";
  const discharged = isAssumption && isDischargedLineNo(lineNo, lines);

  let c, strikethrough, sublabel;

  if (kind === "premise") {
    c = C.premise;
    strikethrough = false;
    sublabel = "premise";
  } else if (discharged) {
    c = C.assumption;
    strikethrough = true;
    sublabel = "discharged";
  } else if (isAssumption) {
    c = C.assumptionActive;
    strikethrough = false;
    sublabel = "assumption";
  } else if (isGoalLine) {
    c = C.proved;
    strikethrough = false;
    sublabel = "goal reached ✓";
  } else {
    c = C.derived;
    strikethrough = false;
    sublabel = ruleLabel;
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: c.bg, border: `1.5px solid ${c.border}`,
      borderRadius: 8, padding: "5px 10px",
      width: "100%", boxSizing: "border-box",
      transition: "background 0.25s, border-color 0.25s",
    }}>
      {/* dot */}
      <div style={{
        width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
        background: c.dot || "transparent",
        border: `2px solid ${c.border}`,
      }} />
      {/* formula + sublabel */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
        <span style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12, fontWeight: isGoalLine ? 700 : 600,
          color: c.text,
          textDecoration: strikethrough ? "line-through" : "none",
          wordBreak: "break-word",
        }}>
          {formula}
        </span>
        <span style={{ fontSize: 9, color: c.text, opacity: 0.75, fontWeight: 500 }}>
          {sublabel}
        </span>
      </div>
      {/* line number */}
      <span style={{
        fontSize: 9, color: c.text, opacity: 0.5,
        fontWeight: 600, flexShrink: 0,
      }}>
        #{lineNo}
      </span>
    </div>
  );
}

// ── Connector (vertical line between items) ────────────────────────────────

/** Thin vertical connector line drawn between sibling items. */
function Connector() {
  return <div style={{ width: 2, height: 8, background: "#c8d8e8", margin: "0 auto" }} />;
}

// ── Subproof box colours (cycling) ─────────────────────────────────────────

const BOX_COLORS = [
  { border: "#0bc4b0", bg: "#e8faf8", label: "#0bc4b0" },
  { border: "#818cf8", bg: "#eef2ff", label: "#6366f1" },
  { border: "#f59e0b", bg: "#fffbeb", label: "#d97706" },
  { border: "#ec4899", bg: "#fdf2f8", label: "#db2777" },
  { border: "#22c55e", bg: "#f0fdf4", label: "#16a34a" },
];

// ── Recursive scope block ──────────────────────────────────────────────────
// Renders all lines at `scopePath` in proof order,
// with nested subproofs as dashed bordered boxes.

/**
 * Recursively renders all proof lines at a given scope, grouping
 * nested subproofs into dashed-bordered boxes.
 *
 * @param {Object}   props
 * @param {number[]} props.scopePath  - Scope path to render.
 * @param {Array}    props.lines      - Full proof lines.
 * @param {string}   props.conclusion - Target conclusion formula.
 * @param {number}   props.depth      - Nesting depth (for colour cycling).
 */
function ScopeBlock({ scopePath, lines, conclusion, depth }) {
  const items = sortedItems(getDirectItemsForScope(scopePath, lines), lines);

  if (items.length === 0) {
    return (
      <div style={{
        fontSize: 11, color: "#6366f1", opacity: 0.55,
        fontStyle: "italic", padding: "4px 2px",
      }}>
        no steps yet
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%" }}>
      {items.map((item, i) => {
        const lineNo = lines.indexOf(item.line) + 1; // 1-indexed

        if (item.type === "line") {
          // A regular line at this scope
          const isTopLevelGoal =
            scopePath.length === 0 &&
            (item.line.formula || "").trim() === (conclusion || "").trim() &&
            item.line.kind === "derived";

          return (
            <div key={lineNo}>
              {i > 0 && <Connector />}
              <StepCard
                line={item.line}
                lineNo={lineNo}
                lines={lines}
                isGoalLine={isTopLevelGoal}
              />
            </div>
          );
        }

        // type === "box" — assumption line that opens a subproof
        const assumLine = item.line;
        const boxScopePath = assumLine.scopePath || [];
        const boxColor = BOX_COLORS[depth % BOX_COLORS.length];
        const goalReached = boxGoalReached(assumLine, lines);
        const boxGoal = (assumLine.boxGoal || "").trim();

        return (
          <div key={lineNo}>
            {i > 0 && <Connector />}
            <div style={{
              border: `1.5px dashed ${goalReached ? "#22c55e" : boxColor.border}`,
              borderRadius: 12,
              padding: "10px 10px 10px 10px",
              background: goalReached ? "#f0fdf4" : boxColor.bg,
              width: "100%", boxSizing: "border-box",
              transition: "background 0.25s, border-color 0.25s",
            }}>
              {/* Subproof header */}
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8, gap: 8, flexWrap: "wrap",
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                  color: goalReached ? "#16a34a" : boxColor.label,
                  textTransform: "uppercase",
                }}>
                  →I subproof{goalReached ? " ✓" : ""}
                </span>
                {boxGoal && (
                  <span style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 10, fontWeight: 700,
                    color: goalReached ? "#166534" : boxColor.label,
                    background: "#ffffff",
                    border: `1px solid ${goalReached ? "#22c55e" : boxColor.border}`,
                    borderRadius: 5, padding: "1px 6px",
                  }}>
                    {assumLine.formula} → {boxGoal}
                  </span>
                )}
              </div>

              {/* Assumption row */}
              <StepCard
                line={assumLine}
                lineNo={lineNo}
                lines={lines}
                isGoalLine={false}
              />

              {/* Lines inside the box */}
              <div style={{ marginTop: 0 }}>
                <ScopeBlock
                  scopePath={boxScopePath}
                  lines={lines}
                  conclusion={conclusion}
                  depth={depth + 1}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────

const LEGEND = [
  { dot: C.proved.dot,            border: C.proved.border,           label: "proved" },
  { dot: C.premise.dot,           border: C.premise.border,          label: "premise" },
  { dot: C.assumptionActive.dot,  border: C.assumptionActive.border, label: "assumption" },
  { dot: C.assumption.dot,        border: C.assumption.border,       label: "discharged" },
  { dot: C.derived.dot,           border: C.derived.border,          label: "derived step" },
];

// ── Public component ───────────────────────────────────────────────────────

/**
 * Forward dynamic goal tree that visualises proof progress as a
 * vertical scope-based decomposition. Updates live as lines change.
 *
 * @param {Object}   props
 * @param {string}   props.conclusion - Target conclusion formula.
 * @param {Array}    props.lines      - Current proof lines.
 * @param {boolean}  props.collapsed  - Whether the panel is collapsed.
 * @param {Function} props.onToggle   - Callback to toggle collapsed state.
 * @param {boolean}  props.isMobile   - Whether the viewport is mobile-sized.
 */
export default function GoalDecompositionTree({
  conclusion,
  lines,
  collapsed,
  onToggle,
  isMobile,
}) {
  const hasConclusion = !!(conclusion && conclusion.trim());
  const safeLines = lines || [];

  const conclusionProved = useMemo(
    () =>
      safeLines.some(
        (ln) =>
          (ln.formula || "").trim() === (conclusion || "").trim() &&
          (ln.scopePath || []).length === 0
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conclusion, JSON.stringify(safeLines.map((l) => ({ f: l.formula, s: l.scopePath })))]
  );

  return (
    <div style={{
      background: "#e8f0f8", border: "none", borderRadius: 18,
      padding: collapsed ? "8px" : "20px",
      minWidth: 0, boxSizing: "border-box",
      boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
      transition: "padding 0.25s ease",
      overflow: "hidden", height: "100%",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        flexDirection: collapsed ? "column-reverse" : "row",
        justifyContent: collapsed ? "flex-start" : "space-between",
        alignItems: "center",
        gap: collapsed ? 8 : 0,
        marginBottom: collapsed ? 0 : 14,
      }}>
        <h2 style={{
          margin: 0, fontSize: 17, fontWeight: 700, color: "#000b21",
          ...(collapsed
            ? { writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }
            : {}),
        }}>
          Goal Tree
        </h2>
        <button
          onClick={onToggle}
          style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "1px solid #c8d8e8", background: "#f5f8fc",
            color: "#4ca2b5", fontSize: 18, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", lineHeight: 1, flexShrink: 0,
          }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {!collapsed && !isMobile && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "stretch",
          overflowX: "auto", overflowY: "auto",
          maxHeight: "calc(100vh - 260px)", paddingBottom: 12,
        }}>
          {!hasConclusion ? (
            <div style={{ color: "#3a5068", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
              Set a conclusion to see the goal tree.
            </div>
          ) : (
            <>
              {/* Legend */}
              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                justifyContent: "center", marginBottom: 12,
                fontSize: 10, color: "#3a5068",
              }}>
                {LEGEND.map(({ dot, border, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 9, height: 9, borderRadius: "50%",
                      background: dot || "transparent",
                      border: `2px solid ${border}`, flexShrink: 0,
                    }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              {/* Conclusion root node */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: conclusionProved ? C.proved.bg : "#e8f0f8",
                border: `2px solid ${conclusionProved ? C.proved.border : "#818cf8"}`,
                borderRadius: 14, padding: "8px 14px",
                marginBottom: 0,
                transition: "background 0.25s, border-color 0.25s",
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                  background: conclusionProved ? C.proved.dot : "transparent",
                  border: `2px solid ${conclusionProved ? C.proved.border : "#818cf8"}`,
                }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 14, fontWeight: 800,
                    color: conclusionProved ? C.proved.text : "#4338ca",
                    wordBreak: "break-word",
                  }}>
                    {conclusion.trim()}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    color: conclusionProved ? C.proved.text : "#4338ca",
                  }}>
                    {conclusionProved ? "proved ✓" : "goal"}
                  </span>
                </div>
              </div>

              {/* Proof lines */}
              {safeLines.length > 0 && (
                <>
                  <Connector />
                  <ScopeBlock
                    scopePath={[]}
                    lines={safeLines}
                    conclusion={conclusion}
                    depth={0}
                  />
                </>
              )}

              {/* Proof complete banner */}
              {conclusionProved && (
                <div style={{
                  marginTop: 12, padding: "6px 14px",
                  background: C.proved.bg, border: `1.5px solid ${C.proved.border}`,
                  borderRadius: 10, fontSize: 12, fontWeight: 700,
                  color: C.proved.text, textAlign: "center",
                }}>
                  Proof complete ✓
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
