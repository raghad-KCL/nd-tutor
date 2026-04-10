import { useMemo, useRef, useState } from "react";
import SavedProofsPage from "./pages/SavedProofsPage";

const RULES = [
  { value: "AND_E1", label: "∧E1  (And-Elim Left)" },
  { value: "AND_E2", label: "∧E2  (And-Elim Right)" },
  { value: "AND_I", label: "∧I   (And-Intro)" },
  { value: "OR_E", label: "∨E (Disjunction Elimination)" },
  { value: "OR_I1", label: "∨I1  (Or-Intro Left)" },
  { value: "OR_I2", label: "∨I2  (Or-Intro Right)" },
  { value: "IMP_E", label: "→E   (Modus Ponens)" },
  { value: "IMP_I", label: "→I   (Implication Introduction)" },
  { value: "IFF_E", label: "↔E   (Equivalence Elimination)" },
  { value: "IFF_I", label: "↔I   (Equivalence Introduction)" },
  { value: "NEG_E", label: "¬E   (Negation Elimination)" },
  { value: "NEG_I", label: "¬I   (Negation Introduction)" },
  { value: "REIT", label: "Reit (Reiteration)" },
];

function parseRefs(refsText) {
  if (!refsText.trim()) return [];
  return refsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const rangeMatch = s.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const i = Number(rangeMatch[1]);
        const j = Number(rangeMatch[2]);
        return i > 0 && j > 0 ? [i, j] : null;
      }
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : null;
    })
    .filter((x) => x !== null);
}

function formatRef(ref) {
  return Array.isArray(ref) ? `${ref[0]}\u2013${ref[1]}` : String(ref);
}

function sameRefs(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Array.isArray(a[i]) && Array.isArray(b[i])) {
      if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
    } else if (a[i] !== b[i]) return false;
  }
  return true;
}

function premisesFromText(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normaliseForDisplay(text) {
  return (text || "").trim();
}

function splitTopLevelImplication(formula) {
  const s = (formula || "").trim();
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "→" && depth === 0) {
      const left = s.slice(0, i).trim();
      const right = s.slice(i + 1).trim();
      if (!left || !right) return null;
      return { left, right, full: `${left} → ${right}` };
    } else if (ch === "-" && s[i + 1] === ">" && depth === 0) {
      const left = s.slice(0, i).trim();
      const right = s.slice(i + 2).trim();
      if (!left || !right) return null;
      return { left, right, full: `${left} -> ${right}` };
    }
  }

  return null;
}

function makePremiseLine(formula) {
  return {
    formula: formula.trim(),
    kind: "premise",
    rule: "PREMISE",
    refs: [],
    scopePath: [],
    discharges: [],
  };
}

function getScopeDepth(line) {
  return Array.isArray(line.scopePath) ? line.scopePath.length : 0;
}

function buildProposedScopePath(
  rule,
  refs,
  lines,
  openBoxes
) {
  if (rule === "IMP_I") {
    const firstRef = refs[0];
    // firstRef may be a range [i, j] or a plain integer
    const assumptionNo = Array.isArray(firstRef) ? firstRef[0] : firstRef;
    const assumptionLine = lines[assumptionNo - 1];

    if (!assumptionLine || assumptionLine.kind !== "assumption") {
      return [];
    }

    return assumptionLine.scopePath.slice(0, -1);
  }

  return getActiveWritingScope(openBoxes, lines);
}




function samePath(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isPrefixPath(prefix = [], full = []) {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

function getDirectItemsForScope(scopePath, lines) {
  const items = [];

  for (const line of lines) {
    const lineScope = line.scopePath || [];

    // ordinary line directly in this scope
    if (samePath(lineScope, scopePath)) {
      items.push({ type: "line", line });
      continue;
    }

    // nested box root directly inside this scope
    if (
      line.kind === "assumption" &&
      lineScope.length === scopePath.length + 1 &&
      isPrefixPath(scopePath, lineScope)
    ) {
      items.push({ type: "box", line });
    }
  }

  return items;
}

function boxGoalReached(boxLine, lines) {
  const goal = (boxLine.boxGoal || "").trim();
  if (!goal) return false;

  return lines.some(
    (ln) =>
      ln.kind === "derived" &&
      samePath(ln.scopePath || [], boxLine.scopePath || []) &&
      (ln.formula || "").trim() === goal
  );
}

function isImpBoxGoalReached(box, lines) {
  if (!box) return false;
  const goal = (box.goalFormula || "").trim();
  if (!goal) return false;

  return lines.some(
    (ln) =>
      ln.kind === "derived" &&
      samePath(ln.scopePath || [], box.scopePath || []) &&
      (ln.formula || "").trim() === goal
  );
}

function getActiveWritingScope(openBoxes, lines) {
  if (!openBoxes.length) return [];

  for (let i = openBoxes.length - 1; i >= 0; i--) {
    const box = openBoxes[i];
    const reached = isImpBoxGoalReached(box, lines);

    if (!reached) {
      return box.scopePath || [];
    }
  }

  return [];
}

function buildGoalTree(lines, openBoxes, conclusion) {
  const topLevelLines = lines.filter(
    (ln) => (ln.scopePath || []).length === 0
  );

  const isRootProved = topLevelLines.some(
    (ln) => (ln.formula || "").trim() === (conclusion || "").trim()
  );

  const children = [];

  for (const box of openBoxes) {
    const goalDerived = lines.some(
      (ln) =>
        samePath(ln.scopePath || [], box.scopePath || []) &&
        (ln.formula || "").trim() === (box.goalFormula || "").trim()
    );

    children.push({
      id: `box-${box.assumptionLineNo}`,
      label: box.goalFormula || "(subproof goal)",
      status: goalDerived ? "proved" : "open",
      children: [
        {
          id: `box-assume-${box.assumptionLineNo}`,
          label: `${box.assumptionFormula} (assumption)`,
          status: "proved",
          children: [],
        },
      ],
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.kind === "derived" && (ln.scopePath || []).length === 0) {
      children.push({
        id: `line-${i}`,
        label: ln.formula,
        status: "proved",
        children: [],
      });
    }
  }

  return {
    id: "root",
    label: conclusion || "(no conclusion)",
    status: isRootProved ? "proved" : "open",
    children,
  };
}

// ── Goal tree helper components ──────────────────────────────────────────

function buildBoxTree(lines, openBoxes) {
  // Build from all assumption lines in `lines` (covers both open and closed subproofs),
  // supplemented by openBoxes for goalFormula / assumptionFormula metadata.
  const openByLineNo = {};
  for (const box of (openBoxes || [])) {
    openByLineNo[box.assumptionLineNo] = box;
  }

  const allBoxes = (lines || [])
    .filter(ln => ln.kind === "assumption" && (ln.scopePath || []).length > 0)
    .map((ln) => {
      const lineNo = (ln.scopePath || [])[ln.scopePath.length - 1];
      const open = openByLineNo[lineNo];
      return {
        scopePath: ln.scopePath || [],
        assumptionLineNo: lineNo,
        assumptionFormula: open ? open.assumptionFormula : ln.formula,
        goalFormula: open ? open.goalFormula : (ln.boxGoal || ""),
        isOpen: !!open,
      };
    });

  const sorted = [...allBoxes].sort(
    (a, b) => (a.scopePath.length || 0) - (b.scopePath.length || 0)
  );

  const roots = [];
  const nodeMap = {};
  for (const box of sorted) {
    const node = { box, children: [] };
    const key = box.scopePath.join(",");
    nodeMap[key] = node;
    const parentPath = box.scopePath.slice(0, -1);
    const parentKey = parentPath.join(",");
    if (parentKey !== "" && nodeMap[parentKey]) {
      nodeMap[parentKey].children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function GTConnector() {
  return (
    <div style={{ width: 2, height: 20, background: "#cbd5e1", margin: "0 auto" }} />
  );
}

function GTGoalNode({ formula, proved }) {
  return (
    <div style={{
      background: "#f8fafc",
      border: `2px solid ${proved ? "#22c55e" : "#94a3b8"}`,
      borderRadius: 12,
      padding: "8px 20px",
      textAlign: "center",
      maxWidth: "100%",
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", wordBreak: "break-word" }}>
        {formula || "(no conclusion)"}
      </div>
      <div style={{ fontSize: 10, color: proved ? "#22c55e" : "#94a3b8", marginTop: 3 }}>
        {proved ? "✓ proved" : "○ not yet proved"}
      </div>
    </div>
  );
}

function GTDerivedNode({ formula, rule }) {
  return (
    <div style={{
      background: "#f8f9fb",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      padding: "5px 12px",
      textAlign: "center",
      maxWidth: "100%",
    }}>
      <div style={{ fontSize: 12, color: "#1a1a1a", wordBreak: "break-word" }}>{formula}</div>
      {rule && <div style={{ fontSize: 10, color: "#8a8f99", marginTop: 2 }}>{rule}</div>}
    </div>
  );
}

function GTSubproofRegion({ node, lines, depth = 0 }) {
  const { box, children } = node;
  const color = getSubproofColor(depth);
  const goalReached = (lines || []).some(
    ln =>
      ln.kind === "derived" &&
      samePath(ln.scopePath || [], box.scopePath || []) &&
      (ln.formula || "").trim() === (box.goalFormula || "").trim()
  );

  return (
    <div style={{
      background: color.treeBg,
      border: `1.5px dashed ${color.treeBorder}`,
      borderRadius: 14,
      padding: 12,
      width: "100%",
      boxSizing: "border-box",
    }}>
      <div style={{ fontSize: 10, color: color.label, marginBottom: 8, fontWeight: 600 }}>→I subproof</div>

      <div style={{
        background: "#fefce8",
        border: `1.5px solid ${color.border}`,
        borderRadius: 10,
        padding: "6px 14px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", wordBreak: "break-word" }}>
          {box.assumptionFormula}
        </div>
        <div style={{ fontSize: 10, color: "#b45309", marginTop: 2 }}>assumption</div>
      </div>

      {children.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 8, paddingRight: 8 }}>
          {children.map(child => (
            <div key={(child.box.scopePath || []).join(",")}>
              <GTConnector />
              <GTSubproofRegion node={child} lines={lines} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}

      <GTConnector />

      <div style={{
        background: goalReached ? "#f0fdf4" : color.treeBg,
        border: `1.5px solid ${goalReached ? "#22c55e" : color.treeBorder}`,
        borderRadius: 10,
        padding: "6px 14px",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: goalReached ? "#166534" : color.label,
          wordBreak: "break-word",
        }}>
          {goalReached ? `✓ ${box.goalFormula}` : `derive: ${box.goalFormula}`}
        </div>
      </div>
    </div>
  );
}

function GoalTree({ lines, openBoxes, conclusion }) {
  const [collapsed, setCollapsed] = useState(false);

  const hasLines = lines && lines.length > 0;

  const conclusionProved = hasLines && lines.some(
    ln => (ln.scopePath || []).length === 0 &&
          (ln.formula || "").trim() === (conclusion || "").trim()
  );

  const boxTreeRoots = buildBoxTree(lines, openBoxes);

  const topLevelDerived = hasLines
    ? lines.filter(ln => ln.kind === "derived" && (ln.scopePath || []).length === 0)
    : [];

  return (
    <div style={{
      background: "#ffffff",
      border: "none",
      borderRadius: 18,
      padding: collapsed ? "10px 16px" : "20px",
      minWidth: 0,
      boxSizing: "border-box",
      boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
      transition: "padding 0.25s ease",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: collapsed ? 0 : 14,
      }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>
          Proof Goal Tree
        </h2>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "1px solid #e8e9ec", background: "#f5f6f8",
            color: "#0bc4b0", fontSize: 18, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", lineHeight: 1, flexShrink: 0,
          }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
          {!hasLines ? (
            <div style={{ color: "#8a8f99", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
              Start the proof to see the goal tree.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4, letterSpacing: 1 }}>
                Goal
              </div>

              <GTGoalNode formula={conclusion.trim() || "(no conclusion)"} proved={conclusionProved} />

              {boxTreeRoots.map(node => (
                <div key={(node.box.scopePath || []).join(",")} style={{ width: "100%" }}>
                  <GTConnector />
                  <GTSubproofRegion node={node} lines={lines} />
                </div>
              ))}

              {topLevelDerived.map((ln, i) => (
                <div key={i} style={{ width: "100%" }}>
                  <GTConnector />
                  <GTDerivedNode formula={ln.formula} rule={ln.rule} />
                </div>
              ))}

              <>
                <GTConnector />
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: conclusionProved ? "#dcfce7" : "#f8fafc",
                  border: `2px solid ${conclusionProved ? "#22c55e" : "#cbd5e1"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, color: conclusionProved ? "#166534" : "#cbd5e1",
                  opacity: conclusionProved ? 1 : 0.25,
                }}>✓</div>
              </>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  const typeStyles = {
    success:  { bg: "#f0fdf4", border: "#22c55e", titleColor: "#166534", icon: "✓" },
    error:    { bg: "#fff1f2", border: "#ef4444", titleColor: "#991b1b", icon: "✕" },
    info:     { bg: "#eff6ff", border: "#3b82f6", titleColor: "#1d4ed8", icon: "ℹ" },
    complete: { bg: "#f0fdf4", border: "#0bc4b0", titleColor: "#0bc4b0", icon: "✓" },
  };

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
      {toasts.map(toast => {
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
                  <div style={{ fontSize: 13, color: "#555c6a", lineHeight: 1.5 }}>
                    {toast.message}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => onDismiss(toast.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 18, color: "#aaa", padding: 0, lineHeight: 1, flexShrink: 0,
            }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

const SUBPROOF_COLORS = [
  { border: "#0bc4b0", bg: "#e8faf8", treeBorder: "#0bc4b0", treeBg: "#e8faf8", label: "#0bc4b0" },
  { border: "#818cf8", bg: "#eef2ff", treeBorder: "#818cf8", treeBg: "#eef2ff", label: "#6366f1" },
  { border: "#f59e0b", bg: "#fffbeb", treeBorder: "#f59e0b", treeBg: "#fffbeb", label: "#d97706" },
  { border: "#ec4899", bg: "#fdf2f8", treeBorder: "#ec4899", treeBg: "#fdf2f8", label: "#db2777" },
  { border: "#22c55e", bg: "#f0fdf4", treeBorder: "#22c55e", treeBg: "#f0fdf4", label: "#16a34a" },
];

function getSubproofColor(depth) {
  return SUBPROOF_COLORS[depth % SUBPROOF_COLORS.length];
}

export default function App() {

  const [page, setPage] = useState("create");

  const [savingProof, setSavingProof] = useState(false);
  const [toasts, setToasts] = useState([]);

  // ----------
  const [checkingProof, setCheckingProof] = useState(false);
  const [checkedProofStatus, setCheckedProofStatus] = useState(null);

  // --- Task ---
  const [premisesText, setPremisesText] = useState("");
  const [conclusion, setConclusion] = useState("");
  const premises = useMemo(() => premisesFromText(premisesText), [premisesText]);

  // --- Proof lines ---
  const [lines, setLines] = useState([]);
  const [currentScopePath, setCurrentScopePath] = useState([]);

  // --- Pending implication-introduction box ---
  const [openBoxes, setOpenBoxes] = useState([]);  // shape:
  const activeBox = openBoxes[openBoxes.length - 1] || null;
  // {
  //   fullFormula,
  //   assumptionFormula,
  //   goalFormula,
  //   assumptionLineNo,
  //   scopePath,
  //   parentScopePath
  // }

  // --- Proposed step ---
  const [stepFormula, setStepFormula] = useState("");
  const [rule, setRule] = useState("AND_E1");
  const [refsText, setRefsText] = useState("");

  const [loading, setLoading] = useState(false);

  // Task lock flag
  const [taskLocked, setTaskLocked] = useState(false);

  const displayedLines = useMemo(() => {
    if (taskLocked) return lines;
    return premisesFromText(premisesText).map(makePremiseLine);
  }, [taskLocked, lines, premisesText]);

  const ruleLabelByValue = useMemo(() => {
    const m = {};
    for (const r of RULES) m[r.value] = r.label;
    return m;
  }, []);

  const refsPreview = useMemo(() => parseRefs(refsText), [refsText]);

  const persistentConclusionBadge = useMemo(() => {
    if (!taskLocked || !checkedProofStatus?.complete) {
      return { show: false, lineNo: null };
    }

    const goal = conclusion.trim();
    if (!goal) {
      return { show: false, lineNo: null };
    }

    const idx = lines.findIndex(
      (ln) =>
        (ln.formula || "").trim() === goal &&
        sameRefs(ln.scopePath || [], [])
    );

    if (idx === -1) {
      return { show: false, lineNo: null };
    }

    return {
      show: true,
      lineNo: idx + 1,
    };
  }, [taskLocked, checkedProofStatus, lines, conclusion]);

  const isNarrow =
    typeof window !== "undefined" && window.innerWidth < 860;

  function handleOpenSavedProof(proof) {
    setPremisesText((proof.premises || []).join("\n"));
    setConclusion(proof.conclusion || "");
    setLines(proof.lines || []);
    setTaskLocked(true);

    setCheckedProofStatus(null);
    setStepFormula("");
    setRefsText("");

    setCurrentScopePath([]);
    setOpenBoxes([]);

    setPage("workspace");
  }

  function buildDefaultProofTitle() {
    const goal = conclusion.trim();
    if (!goal) return "Untitled proof";
    return `Proof of ${goal}`;
  }

  async function saveProof() {
    if (!taskLocked) return;

    setSavingProof(true);

    try {
      const res = await fetch("http://localhost:8000/api/proofs/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          title: buildDefaultProofTitle(),
          proofState: {
            premises,
            conclusion,
            lines,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        showToast("error", "Save failed", data?.message || "Could not save proof.");
        return;
      }

      showToast("success", "Proof saved", data?.message || "Saved successfully.");
    } catch (e) {
      showToast("error", "Save failed", String(e));
    } finally {
      setSavingProof(false);
    }
  }

  //###########################33
  async function checkProof() {
    if (!taskLocked) return;

    setCheckingProof(true);

    try {
      const res = await fetch("http://localhost:8000/api/check-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proofState: {
            premises,
            conclusion,
            lines,
          },
        }),
      });

      const data = await res.json();

      if (data?.complete === true && data?.goalLine) {
        setCheckedProofStatus({ complete: true, goalLine: data.goalLine });
        showToast("complete", "Proof complete ✓", data.message || "The conclusion was derived at top level.");
      } else {
        setCheckedProofStatus(null);
        showToast("info", "Proof in progress", data.message || "Goal not yet reached.");
      }
    } catch (e) {
      setCheckedProofStatus(null);
      showToast("error", "Check failed", String(e));
    } finally {
      setCheckingProof(false);
    }
  }
  //############################33

  // ----------------------------
  // Toolkit: insert symbols into the currently focused input
  // ----------------------------
  const activeRef = useRef(null);

  function setActive(el) {
    activeRef.current = el;
  }

  function insertToken(token) {
    const el = activeRef.current;
    if (!el) return;

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;

    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const next = before + token + after;

    const field = el.getAttribute("data-field");

    if (field === "premises") onChangePremisesText(next);
    else if (field === "conclusion") setConclusion(next);
    else if (field === "step") setStepFormula(next);
    else if (field === "refs") setRefsText(next);

    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      if (el.setSelectionRange) el.setSelectionRange(pos, pos);
    });
  }

  async function startProof() {
    setLoading(true);
    setCheckedProofStatus(null);

    const payload = { proofState: { premises, conclusion } };

    try {
      const response = await fetch("http://localhost:8000/api/validate-task/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data?.ok === true) {
        const normPremises = Array.isArray(data.premises) ? data.premises : premises;
        const normConclusion =
          typeof data.conclusion === "string" ? data.conclusion : conclusion;

        setPremisesText(normPremises.join("\n"));
        setConclusion(normConclusion);

        setLines(normPremises.map(makePremiseLine));
        setCurrentScopePath([]);
        setOpenBoxes([]);
        setTaskLocked(true);
        setPage("workspace");
      } else {
        showToast(
          "error",
          "Invalid task",
          "Please check your premises and conclusion, then try again."
        );
      }
    } catch (e) {
      showToast(
        "error",
        "Invalid task",
        "We couldn't read that task. Please check the syntax and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function resetProofToPremises() {
    setTaskLocked(false);
    setPage("create");
    setLines(premises.map(makePremiseLine));
    setCurrentScopePath([]);
    setOpenBoxes([]);
    setStepFormula("");
    setRefsText("");
    setCheckedProofStatus(null);
  }

  function onChangePremisesText(next) {
    setPremisesText(next);

    if (!taskLocked) {
      const nextPremises = premisesFromText(next);
      setLines(nextPremises.map(makePremiseLine));
      setCurrentScopePath([]);
      setOpenBoxes([]);
      setCheckedProofStatus(null);
    }
  }

  function showToast(type, title, message) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  async function openImplicationBox() {
    if (!taskLocked) return;

    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/open-subproof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formula: stepFormula,
          rule: "IMP_I",
        }),
      });

      const data = await response.json();

      if (data?.ok !== true) {
        showToast("error", "Could not open subproof", data?.message || "Check the formula.");
        return;
      }

      const parentScopePath = getActiveWritingScope(openBoxes, lines);

      const newLineNo = lines.length + 1;
      const newScopePath = [...parentScopePath, newLineNo];

      const assumptionLine = {
        formula: data.assumption,
        kind: "assumption",
        rule: "ASSUME",
        refs: [],
        scopePath: newScopePath,
        discharges: [],
        boxGoal: data.goal,
        boxRule: "IMP_I",
      };

      const newBox = {
        kind: "IMP_I",
        fullFormula: data.normalised,
        assumptionFormula: data.assumption,
        goalFormula: data.goal,
        assumptionLineNo: newLineNo,
        scopePath: newScopePath,
        parentScopePath,
      };

      setLines((prev) => [...prev, assumptionLine]);
      setOpenBoxes((prev) => [...prev, newBox]);
      setCurrentScopePath(newScopePath);

      setStepFormula("");
      setRefsText("");
      showToast("success", "Subproof opened", "Assumption added. Derive the goal inside the box.");
    } catch (e) {
      showToast("error", "Could not open subproof", String(e));
    } finally {
      setLoading(false);
    }
  }

  async function validateAndAdd() {
    const newRefs = parseRefs(refsText);
    const scopePath = buildProposedScopePath(
      rule,
      newRefs,
      lines,
      openBoxes
    );

    setLoading(true);

    const payload = {
      proofState: {
        premises,
        conclusion,
        lines,
      },
      proposedStep: {
        formula: stepFormula,
        rule,
        refs: newRefs,
        scopePath,
      },
    };

    try {
      const response = await fetch("http://localhost:8000/api/validate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data?.ok === true) {
        const newFormula = (data.normalised || stepFormula).trim();

        const alreadyExists = lines.some(
          (ln) =>
            ln.kind === "derived" &&
            ln.formula === newFormula &&
            ln.rule === rule &&
            sameRefs(ln.refs || [], newRefs) &&
            sameRefs(ln.scopePath || [], scopePath)
        );

        if (alreadyExists) {
          showToast("error", "Duplicate step", "This exact step already exists in your proof.");
          return;
        }

        const newLine = {
          formula: newFormula,
          kind: "derived",
          rule,
          refs: newRefs,
          scopePath,
          discharges: [],
        };

        const nextLines = [...lines, newLine];
        setLines(nextLines);

        // Auto-close any box whose goal was just satisfied by this step.
        const remainingBoxes = openBoxes.filter(
          (box) => !isImpBoxGoalReached(box, nextLines)
        );
        setOpenBoxes(() => remainingBoxes);

        setCurrentScopePath(
          getActiveWritingScope(remainingBoxes, nextLines)
        );

        setStepFormula("");
        setRefsText("");
        showToast("success", "Step accepted", data.message || "Step valid.");
      } else {
        const msg = data?.message || "Step could not be validated.";
        if (data?.type === "SYNTAX") showToast("error", "Syntax error", msg);
        else if (data?.type === "RULE") showToast("error", "Rule error", msg);
        else showToast("error", "Invalid step", msg);
      }
    } catch (e) {
      showToast("error", "Network error", String(e));
    } finally {
      setLoading(false);
    }
  }

  function removeLine(index) {
    if (!taskLocked) {
      const current = premisesFromText(premisesText);
      const next = current.filter((_, i) => i !== index);
      setPremisesText(next.join("\n"));
      return;
    }

    const target = lines[index];
    if (!target || target.kind === "premise") return;

    const removedLineNo = index + 1; // 1-based

    // Decrement every line-number reference that was after the removed line.
    function renumberNo(n) {
      return n > removedLineNo ? n - 1 : n;
    }
    function renumberPath(path) {
      return (path || []).map(renumberNo);
    }
    function renumberRef(ref) {
      if (Array.isArray(ref)) return [renumberNo(ref[0]), renumberNo(ref[1])];
      return renumberNo(ref);
    }

    // Filter out the removed line, then fix all line-number fields in survivors.
    const nextLines = lines
      .filter((_, i) => i !== index)
      .map(ln => ({
        ...ln,
        scopePath: renumberPath(ln.scopePath),
        refs: (ln.refs || []).map(renumberRef),
        discharges: (ln.discharges || []).map(renumberNo),
      }));

    // Reconstruct openBoxes from scratch: every assumption line in nextLines
    // whose goal is not yet derived is an open box. This handles the case where
    // removing a line un-satisfies a previously auto-closed box.
    const nextOpenBoxes = nextLines
      .filter(ln => ln.kind === "assumption" && (ln.scopePath || []).length > 0 && ln.boxGoal)
      .filter(ln => {
        const goal = (ln.boxGoal || "").trim();
        return !nextLines.some(
          other =>
            other.kind === "derived" &&
            samePath(other.scopePath || [], ln.scopePath || []) &&
            (other.formula || "").trim() === goal
        );
      })
      .map(ln => {
        const assumptionLineNo = (ln.scopePath || [])[ln.scopePath.length - 1];
        const parentScopePath = (ln.scopePath || []).slice(0, -1);
        return {
          kind: ln.boxRule || "IMP_I",
          assumptionFormula: ln.formula,
          goalFormula: ln.boxGoal,
          assumptionLineNo,
          scopePath: ln.scopePath,
          parentScopePath,
        };
      });

    setLines(nextLines);
    setOpenBoxes(nextOpenBoxes);
    setCurrentScopePath(getActiveWritingScope(nextOpenBoxes, nextLines));
  }

  const toolButtonStyle = {
    borderRadius: 10,
    padding: "8px 12px",
    background: "#ffffff",
    color: "#555c6a",
    border: "1px solid #e8e9ec",
    cursor: "pointer",
    fontWeight: 500,
    minWidth: 44,
    fontSize: 14,
  };

  const pagePad = "clamp(14px, 2.5vw, 28px)";

  // ── Shared sidebar ────────────────────────────────────────────────────
  const sidebar = (
    <div
      style={{
        width: 180,
        height: "100vh",
        position: "sticky",
        top: 0,
        flexShrink: 0,
        background: "#ffffff",
        borderRight: "1px solid #edeef1",
        display: "flex",
        flexDirection: "column",
        padding: "20px 12px",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 24, color: "#1a1a1a" }}>
        ND Tutor
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { label: "New Proof", key: "create" },
          { label: "Saved Proofs", key: "savedProofs" },
        ].map(({ label, key }) => {
          const isActive =
            key === "create"
              ? page === "create" || page === "workspace"
              : page === key;
          return (
            <button
              key={key}
              onClick={() => setPage(key)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: isActive ? "#e8faf8" : "transparent",
                color: isActive ? "#0bc4b0" : "#8a8f99",
                cursor: "pointer",
                fontWeight: isActive ? 600 : 500,
                fontSize: 14,
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );

  // ── Create page ───────────────────────────────────────────────────────
  if (page === "create") {
    return (
      <div style={{ display: "flex", flexDirection: "row", height: "100vh", overflow: "hidden", background: "#f0f2f5", color: "#1a1a1a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        {sidebar}
        <div style={{ flex: 1, height: "100vh", overflowY: "auto", overflowX: "hidden", padding: pagePad, boxSizing: "border-box" }}>
          <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <h1 style={{ fontSize: 36, margin: "0 0 4px 0" }}>New Proof</h1>
            <p style={{ opacity: 0.75, marginTop: 0, marginBottom: 20, fontSize: 14 }}>
              Enter premises and a conclusion, then start the proof.
            </p>

            <div
              style={{
                background: "#ffffff",
                border: "none",
                borderRadius: 18,
                padding: 20,
                boxSizing: "border-box",
                boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              }}
            >
              <h2 style={{ margin: "0 0 14px 0", fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>Task</h2>

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
                  <div style={{ fontSize: 13, color: "#8a8f99", fontWeight: 500, marginBottom: 6 }}>
                    Premises (one per line)
                  </div>
                  <textarea
                    data-field="premises"
                    onFocus={(e) => setActive(e.target)}
                    value={premisesText}
                    onChange={(e) => onChangePremisesText(e.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      borderRadius: 10,
                      padding: 10,
                      background: "#ffffff",
                      color: "#1a1a1a",
                      border: "1px solid #e8e9ec",
                      outline: "none",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#8a8f99", fontWeight: 500, marginBottom: 6 }}>
                    Conclusion
                  </div>
                  <input
                    data-field="conclusion"
                    onFocus={(e) => setActive(e.target)}
                    value={conclusion}
                    onChange={(e) => setConclusion(e.target.value)}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      borderRadius: 10,
                      padding: 10,
                      background: "#ffffff",
                      color: "#1a1a1a",
                      border: "1px solid #e8e9ec",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />

                  <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
                    Quick tips: you can type symbols or words:
                    <div style={{ opacity: 0.8, marginTop: 6 }}>
                      <code style={{ color: "#2a2a2a" }}>not / and / or</code>,{" "}
                      <code style={{ color: "#2a2a2a" }}>! ~ &amp; | -&gt;</code>,{" "}
                      <code style={{ color: "#2a2a2a" }}>¬ ∧ ∨ →</code>
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
                            onClick={() => insertToken(t)}
                            style={toolButtonStyle}
                          >
                            {t}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => insertToken(" ")}
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

            <button
              onClick={startProof}
              disabled={loading}
              style={{
                marginTop: 16,
                borderRadius: 12,
                padding: "13px 28px",
                background: loading ? "#d8f5f2" : "#0bc4b0",
                color: loading ? "#9ad4cf" : "#ffffff",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {loading ? "Working..." : "Start proof →"}
            </button>
          </div>
        </div>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // ── Saved Proofs page ─────────────────────────────────────────────────
  if (page === "savedProofs") {
    return (
      <div style={{ display: "flex", flexDirection: "row", height: "100vh", overflow: "hidden", background: "#f0f2f5", color: "#1a1a1a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        {sidebar}
        <div style={{ flex: 1, height: "100vh", overflowY: "auto", overflowX: "hidden" }}>
          <SavedProofsPage
            onBackToWorkspace={() => setPage("workspace")}
            onOpenProof={handleOpenSavedProof}
            hideBackButton={true}
          />
        </div>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // ── Workspace page ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100vh", overflow: "hidden", background: "#f0f2f5", color: "#1a1a1a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {sidebar}
      <div style={{ flex: 1, height: "100vh", overflowY: "auto", overflowX: "hidden", padding: pagePad, boxSizing: "border-box" }}>
        <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

          {/* Task header strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
              background: "#ffffff",
              borderBottom: "1px solid #edeef1",
              borderRadius: 14,
              padding: "12px 20px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}
          >
            <button
              onClick={resetProofToPremises}
              style={{
                borderRadius: 8,
                padding: "4px 10px",
                background: "transparent",
                color: "#0bc4b0",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              ← Edit task
            </button>
            <div
              style={{
                fontSize: 14,
                color: "#1a1a1a",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              Proving:{" "}
              {premises.length > 0 ? premises.join(", ") : "(no premises)"}
              {" "}⊢{" "}
              {conclusion.trim() || "(no conclusion)"}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 14,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* Proof */}
            <div
              style={{
                background: "#ffffff",
                border: "none",
                borderRadius: 18,
                padding: 20,
                minWidth: 0,
                boxSizing: "border-box",
                boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>Proof</h2>

                <span style={{ opacity: 0.75, fontSize: 12 }}>
                  {taskLocked
                    ? `${lines.length} lines`
                    : `${displayedLines.length} lines (preview)`}
                </span>

                {taskLocked && (
                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    <span style={{ opacity: 0.9, fontSize: 12 }}>
                      Goal:{" "}
                      <span
                        style={{
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {conclusion.trim() || "(none)"}
                      </span>
                    </span>

                  {persistentConclusionBadge.show && (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        background: "#e8faf8",
                        color: "#0bc4b0",
                        border: "1px solid #0bc4b0",
                      }}
                    >
                      Conclusion derived on line {persistentConclusionBadge.lineNo} ✅
                    </span>
                  )}
                  </div>
                )}
              </div>

              {taskLocked && (
                <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
                  Current scope:{" "}
                  {currentScopePath.length
                    ? `[${currentScopePath.join(", ")}]`
                    : "top level"}
                </div>
              )}

              {(() => {
                function renderLineCard(ln) {
                  const lineNo = displayedLines.indexOf(ln) + 1;
                  const isHighlighted = refsPreview.some((ref) =>
                    Array.isArray(ref)
                      ? lineNo >= ref[0] && lineNo <= ref[1]
                      : ref === lineNo
                  );

                  return (
                    <div
                      key={`line-${lineNo}`}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        width: "100%",
                        background: isHighlighted ? "#eef4ff" : "#f8f9fb",
                        border: isHighlighted ? "1px solid #c7d2fe" : "1px solid #edeef1",
                        borderRadius: 14,
                        padding: "10px 14px",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{
                        color: "#0bc4b0",
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
                            color: "#1a1a1a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={ln.formula}
                        >
                          {ln.formula}
                        </div>

                        {ln.kind === "premise" && (
                          <div style={{ fontSize: 12, color: "#8a8f99", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            premise
                          </div>
                        )}

                        {ln.kind === "assumption" && (
                          <div style={{ fontSize: 12, color: "#0bc4b0", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            assumption
                          </div>
                        )}

                        {ln.kind === "derived" && (
                          <div style={{ fontSize: 12, color: "#8a8f99", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {(ruleLabelByValue[ln.rule] || ln.rule)}{(ln.refs || []).length > 0 ? ` (${(ln.refs || []).map(formatRef).join(", ")})` : ""}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => removeLine(lineNo - 1)}
                        disabled={taskLocked && ln.kind === "premise"}
                        style={{
                          flexShrink: 0,
                          alignSelf: "flex-start",
                          borderRadius: 10,
                          padding: "6px 10px",
                          background: "#ffffff",
                          color: taskLocked && ln.kind === "premise" ? "#8a8f99" : "#555c6a",
                          border: "1px solid #e8e9ec",
                          cursor: taskLocked && ln.kind === "premise" ? "not-allowed" : "pointer",
                          fontWeight: 500,
                          fontSize: 12,
                          opacity: taskLocked && ln.kind === "premise" ? 0.5 : 1,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                }

                function renderBox(boxLine, depth = 0) {
                  const lineNo = displayedLines.indexOf(boxLine) + 1;
                  const items = getDirectItemsForScope(boxLine.scopePath || [], displayedLines);
                  const goalReached = boxGoalReached(boxLine, displayedLines);
                  const isOpenBox =
                    activeBox &&
                    activeBox.assumptionLineNo === lineNo;
                  const color = getSubproofColor(depth);

                  return (
                    <div
                      key={`box-${lineNo}`}
                      style={{
                        border: isOpenBox ? `2px solid ${color.border}` : `1px solid ${color.border}`,
                        borderRadius: 12,
                        padding: 14,
                        marginTop: 8,
                        marginBottom: 8,
                        background: color.bg,
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          marginBottom: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontSize: 12, color: color.label, fontWeight: 600 }}>
                          {boxLine.boxRule === "IMP_I" ? "→I subproof" : "subproof"}
                        </div>

                        <div
                          style={{
                            textAlign: "right",
                            fontSize: 13,
                            lineHeight: 1.4,
                          }}
                        >
                          {!!boxLine.boxGoal && (
                            <div>
                              Goal:{" "}
                              <span
                                style={{
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                  fontWeight: 800,
                                }}
                              >
                                {boxLine.boxGoal}
                              </span>
                            </div>
                          )}

                          {!!boxLine.boxGoal && (
                            <div style={{ opacity: 0.85 }}>
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

                return renderScope([]);
              })()}

              {!taskLocked && (
                <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 10 }}>
                  Preview mode: these lines reflect your premises. Click <b>Start proof</b> to
                  lock the task and begin.
                </div>
              )}

              <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, display: "grid", gap: 4 }}>
                <div>Lines can only be added via validated steps.</div>
                {taskLocked && (
                  <div>Use <b>Check Proof</b> to see the current global status of the proof.</div>
                )}
              </div>
            </div>

            {/* Proposed Step */}
            <div
              style={{
                background: "#ffffff",
                border: "none",
                borderRadius: 18,
                padding: 20,
                minWidth: 0,
                boxSizing: "border-box",
                boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              }}
            >
              <h2 style={{ margin: "0 0 10px 0", fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>Propose Step</h2>

              <div style={{ fontSize: 13, color: "#8a8f99", fontWeight: 500, marginBottom: 6 }}>Formula</div>
              <input
                data-field="step"
                onFocus={(e) => setActive(e.target)}
                value={stepFormula}
                onChange={(e) => setStepFormula(e.target.value)}
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
                  background: "#ffffff",
                  color: "#1a1a1a",
                  border: "1px solid #e8e9ec",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              <div style={{ marginTop: 12, fontSize: 13, color: "#8a8f99", fontWeight: 500, marginBottom: 6 }}>
                Rule
              </div>
              <select
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  borderRadius: 10,
                  padding: 10,
                  background: "#ffffff",
                  color: "#1a1a1a",
                  border: "1px solid #e8e9ec",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                {RULES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              {rule === "IMP_I" && (
                <button
                  onClick={openImplicationBox}
                  disabled={loading || !taskLocked || !stepFormula.trim()}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: taskLocked && stepFormula.trim() ? "#ffffff" : "#f5f6f8",
                    color: taskLocked && stepFormula.trim() ? "#555c6a" : "#8a8f99",
                    border: "1px solid #e8e9ec",
                    cursor: taskLocked && stepFormula.trim() ? "pointer" : "not-allowed",
                    fontWeight: 500,
                  }}
                >
                  Open →I Box
                </button>
              )}

              <div style={{ marginTop: 12, fontSize: 13, color: "#8a8f99", fontWeight: 500, marginBottom: 6 }}>
                References — line numbers or ranges (e.g. <code>3-5</code>)
              </div>
              <input
                data-field="refs"
                onFocus={(e) => setActive(e.target)}
                value={refsText}
                onChange={(e) => setRefsText(e.target.value)}
                placeholder={
                  rule === "REIT"
                    ? "e.g. 3"
                    : rule === "IMP_I"
                    ? "e.g. 3-5  or  3, 5"
                    : "e.g. 1, 2  or  3-5"
                }
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  borderRadius: 10,
                  padding: 10,
                  background: "#ffffff",
                  color: "#1a1a1a",
                  border: "1px solid #e8e9ec",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              <button
                onClick={validateAndAdd}
                disabled={loading || !taskLocked}
                style={{
                  marginTop: 14,
                  width: "100%",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: taskLocked ? "#0bc4b0" : "#d8f5f2",
                  color: taskLocked ? "#ffffff" : "#9ad4cf",
                  border: "none",
                  cursor: taskLocked ? "pointer" : "not-allowed",
                  fontWeight: 700,
                  fontSize: 15,
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
                onClick={checkProof}
                disabled={checkingProof || !taskLocked}
                style={{
                  marginTop: 10,
                  width: "100%",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: taskLocked ? "#0bc4b0" : "#d8f5f2",
                  color: taskLocked ? "#ffffff" : "#9ad4cf",
                  border: "none",
                  cursor: taskLocked ? "pointer" : "not-allowed",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {checkingProof ? "Checking..." : "Check Proof"}
              </button>

              <button
                onClick={saveProof}
                disabled={savingProof || !taskLocked}
                style={{
                  marginTop: 10,
                  width: "100%",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: taskLocked ? "#0bc4b0" : "#d8f5f2",
                  color: taskLocked ? "#ffffff" : "#9ad4cf",
                  border: "none",
                  cursor: taskLocked ? "pointer" : "not-allowed",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {savingProof ? "Saving..." : "Save Proof"}
              </button>

              {!taskLocked && (
                <div style={{ marginTop: 10, color: "#8a8f99", fontSize: 12 }}>
                  Start the proof first to validate steps.
                </div>
              )}
            </div>

            {/* Goal Tree — card is rendered inside GoalTree itself */}
            <GoalTree
              lines={lines}
              openBoxes={openBoxes}
              conclusion={conclusion}
              checkedProofStatus={checkedProofStatus}
            />
          </div>

          <div style={{ opacity: 0.7, marginTop: 14, fontSize: 12 }}>
            Note: premises are inserted as initial proof lines only after you click <b>Start proof</b>.
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
