import { useEffect, useMemo, useRef, useState } from "react";
import ndLogo from "./assets/ND-tutor-logo.svg";
import SavedProofsPage from "./pages/SavedProofsPage";
import RulesPage from "./pages/RulesPage";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";
import ExportButton from "./components/ExportButton";
import ProblemTypeLabel from "./components/ProblemTypeLabel";
import GoalTree from "./components/GoalTree";
import ProofWorkspace from "./components/ProofWorkspace";
import useWindowWidth from "./hooks/useWindowWidth";
import StepInputPanel from "./components/StepInputPanel";
import TaskInputPanel from "./components/TaskInputPanel";
import { useStickyBanner } from "./hooks/useStickyBanner";
import {
  RULES,
  parseRefs,
  sameRefs,
  samePath,
  isPrefixPath,
  premisesFromText,
  makePremiseLine,
  getActiveWritingScope,
  isImpBoxGoalReached,
} from "./utils";

function friendifyError(msg) {
  if (!msg) return "Formula could not be parsed. Check your syntax and try again.";
  if (/Unexpected token '?' at position 0/i.test(msg) || msg.includes("token '' at position 0"))
    return "Please enter a formula before validating.";
  if (/Unexpected token '?' at position \d+/i.test(msg) || /token '' at position \d+/.test(msg))
    return "Formula is incomplete. Make sure every operator has the right operands (e.g. ¬A, A ∧ B).";
  if (/Unexpected character/i.test(msg))
    return "Invalid symbol in formula. Use propositional variables (A–Z) and operators (¬, ∧, ∨, →, ↔).";
  if (/Unexpected token '[a-zA-Z]{2,}'/i.test(msg))
    return "Words are not allowed in formulas. Use single-letter variables (A–Z) and symbols for operators (¬, ∧, ∨, →, ↔).";
  if (msg.includes("Expected RPAREN"))
    return "Missing closing parenthesis ). Make sure every ( has a matching ).";
  if (/Unexpected token|parse|syntax/i.test(msg))
    return "Formula could not be parsed. Check your syntax and try again.";
  return msg;
}

function syntaxErrorTitle(msg) {
  if (!msg) return "Parse error";
  if (/Unexpected token '?' at position 0/i.test(msg) || msg.includes("token '' at position 0"))
    return "Empty formula";
  if (/Unexpected token '?' at position \d+/i.test(msg) || /token '' at position \d+/.test(msg))
    return "Incomplete formula";
  if (/Unexpected character/i.test(msg))
    return "Invalid symbol";
  if (/Unexpected token '[a-zA-Z]{2,}'/i.test(msg))
    return "Word in formula";
  if (msg.includes("Expected RPAREN"))
    return "Missing parenthesis";
  return "Parse error";
}

function buildProposedScopePath(rule, refs, lines, openBoxes) {
  if (rule === "IMP_I") {
    const firstRef = refs[0];
    const assumptionNo = Array.isArray(firstRef) ? firstRef[0] : firstRef;
    const assumptionLine = lines[assumptionNo - 1];
    if (!assumptionLine || assumptionLine.kind !== "assumption") {
      return [];
    }
    return assumptionLine.scopePath.slice(0, -1);
  }
  return getActiveWritingScope(openBoxes, lines);
}

// ── Modal components ───────────────────────────────────────────────────────

function DeleteConfirmModal({ affectedLineNos, onConfirm, onCancel }) {
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

function DeleteSubproofModal({ lineCount, onUndoClosure, onDeleteAll, onCancel }) {
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

function DiscardModal({ onConfirm, onCancel }) {
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
          maxWidth: 360,
          width: "calc(100% - 40px)",
          boxSizing: "border-box",
          animation: "modalPanelIn 0.2s ease-in-out both",
        }}
      >
        <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700, color: "#000b21" }}>
          Discard current proof?
        </h2>
        <p style={{ margin: "0 0 24px 0", fontSize: 14, color: "#3a5068" }}>
          This cannot be undone.
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
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  const typeStyles = {
    success:  { bg: "#f0fdf4", border: "#22c55e", titleColor: "#166534", icon: "✓" },
    error:    { bg: "#fff1f2", border: "#ef4444", titleColor: "#991b1b", icon: "✕" },
    info:     { bg: "#eff6ff", border: "#3b82f6", titleColor: "#1d4ed8", icon: "ℹ" },
    complete: { bg: "#e8f0f8", border: "#4ca2b5", titleColor: "#4ca2b5", icon: "✓" },
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

// ── Page shell ─────────────────────────────────────────────────────────────
// Wraps every page with the shared outer flex container, sidebar, modals,
// and toast stack so each page branch only renders its own content div.

function PageShell({
  isMobile,
  sidebar,
  showDiscardModal,
  confirmDiscard,
  setShowDiscardModal,
  deleteConfirmState,
  onConfirmDelete,
  onCancelDelete,
  deleteSubproofState,
  onUndoClosure,
  onConfirmDeleteSubproof,
  onCancelDeleteSubproof,
  showAuthModal,
  setShowAuthModal,
  toasts,
  dismissToast,
  children,
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      height: isMobile ? undefined : "100vh",
      minHeight: "100vh",
      overflow: isMobile ? "auto" : "hidden",
      background: "#f5f8fc",
      color: "#000b21",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {sidebar}
      {children}
      {showDiscardModal && (
        <DiscardModal
          onConfirm={confirmDiscard}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}
      {deleteConfirmState?.show && (
        <DeleteConfirmModal
          affectedLineNos={deleteConfirmState.affectedLineNos}
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
        />
      )}
      {deleteSubproofState?.show && (
        <DeleteSubproofModal
          lineCount={deleteSubproofState.lineCount}
          onUndoClosure={onUndoClosure}
          onDeleteAll={onConfirmDeleteSubproof}
          onCancel={onCancelDeleteSubproof}
        />
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ── Ordered line insertion ─────────────────────────────────────────────────
// Insert a new line at the correct position for its scope instead of always
// appending at the end. The insertion point is right after the last
// non-broken line that is inside scope P (or at scope P), so broken lines
// left over from a deletion are pushed to the end rather than interleaved
// with freshly derived content.
function insertLineInScope(lines, newLine) {
  const P = newLine.scopePath || [];

  // For →I lines, search using the discharged subproof's scope so the →I is
  // placed right after the subproof it closes, not at the end of the parent scope.
  let searchScope = P;
  if (newLine.rule === "IMP_I" && (newLine.discharges || []).length > 0) {
    const assumptionNo = newLine.discharges[0];
    const assumptionLine = lines[assumptionNo - 1];
    if (assumptionLine && assumptionLine.scopePath) {
      searchScope = assumptionLine.scopePath;
    }
  }

  let lastInnerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lsp = lines[i].scopePath || [];
    if ((isPrefixPath(searchScope, lsp) || samePath(searchScope, lsp)) && !lines[i].brokenRef) {
      lastInnerIndex = i;
    }
  }

  const insertIdx = lastInnerIndex + 1;

  if (insertIdx >= lines.length) {
    return [...lines, newLine];
  }

  // All lines at insertIdx and beyond get their 1-based line number shifted up.
  const insertedLineNo = insertIdx + 1;
  function shift(n) { return n >= insertedLineNo ? n + 1 : n; }

  const updatedTail = lines.slice(insertIdx).map((ln) => {
    const u = { ...ln };
    u.scopePath  = (ln.scopePath  || []).map(shift);
    u.refs       = (ln.refs       || []).map((r) => Array.isArray(r) ? [shift(r[0]), shift(r[1])] : shift(r));
    u.discharges = (ln.discharges || []).map(shift);
    if (u.brokenRef != null) u.brokenRef = shift(u.brokenRef);
    return u;
  });

  return [...lines.slice(0, insertIdx), newLine, ...updatedTail];
}

// ── Main component ─────────────────────────────────────────────────────────

export default function App() {

  // Rehydrate proof state from sessionStorage (survives refresh, cleared on tab close)
  const [page, setPage] = useState(() => {
    try {
      const s = sessionStorage.getItem("currentProof");
      return s && JSON.parse(s).taskLocked ? "workspace" : "create";
    } catch { return "create"; }
  });

  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal]   = useState(false);
  const [pendingSave, setPendingSave]       = useState(false);
  const [savingProof, setSavingProof]       = useState(false);
  const [savedTitle, setSavedTitle]         = useState(null);
  const [toasts, setToasts]                 = useState([]);
  const [checkingProof, setCheckingProof]   = useState(false);
  const [workspaceError, setWorkspaceError] = useState(null);

  const [checkedProofStatus, setCheckedProofStatus] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("currentProof") || "null")?.checkedProofStatus ?? null; }
    catch { return null; }
  });

  // ── Task ──────────────────────────────────────────────────────────────────
  const [premisesText, setPremisesText] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("currentProof") || "null")?.premisesText ?? ""; }
    catch { return ""; }
  });
  const [conclusion, setConclusion] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("currentProof") || "null")?.conclusion ?? ""; }
    catch { return ""; }
  });
  const premises = useMemo(() => premisesFromText(premisesText), [premisesText]);

  const [formPremisesText, setFormPremisesText] = useState("");
  const [formConclusion, setFormConclusion]     = useState("");
  const [randomDifficulty, setRandomDifficulty] = useState("any");

  // ── Proof lines ───────────────────────────────────────────────────────────
  const [lines, setLines] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("currentProof") || "null")?.lines ?? []; }
    catch { return []; }
  });
  const [currentScopePath, setCurrentScopePath] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("currentProof") || "null")?.currentScopePath ?? []; }
    catch { return []; }
  });

  // ── Open subproof boxes ───────────────────────────────────────────────────
  const [openBoxes, setOpenBoxes] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("currentProof") || "null")?.openBoxes ?? []; }
    catch { return []; }
  });
  const activeBox = openBoxes[openBoxes.length - 1] || null;

  // ── Proposed step ─────────────────────────────────────────────────────────
  const [stepFormula, setStepFormula] = useState("");
  const [rule, setRule]               = useState("AND_E1");
  const [refsText, setRefsText]       = useState("");

  const [loading, setLoading]         = useState(false);
  const [taskError, setTaskError]     = useState("");
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState({ show: false, lineIndex: null, affectedLineNos: [] });
  const [deleteSubproofState, setDeleteSubproofState] = useState({ show: false, assumptionLineIndex: null, lineCount: 0 });

  const [proofViewMode, setProofViewMode] = useState("sequential");

  const [taskLocked, setTaskLocked] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("currentProof") || "null")?.taskLocked ?? false; }
    catch { return false; }
  });

  // ── Derived / memoised ────────────────────────────────────────────────────
  const displayedLines = useMemo(() => {
    if (taskLocked) return lines;
    return premisesFromText(formPremisesText).map(makePremiseLine);
  }, [taskLocked, lines, formPremisesText]);

  const ruleLabelByValue = useMemo(() => {
    const m = {};
    for (const r of RULES) m[r.value] = r.label;
    return m;
  }, []);

  const refsPreview = useMemo(() => parseRefs(refsText), [refsText]);

  const hasBrokenRefs = useMemo(() => lines.some((ln) => !!ln.brokenRef), [lines]);

  const persistentConclusionBadge = useMemo(() => {
    if (!taskLocked) return { show: false, lineNo: null };
    const goal = conclusion.trim();
    if (!goal) return { show: false, lineNo: null };
    const idx = lines.findIndex(
      (ln) => (ln.formula || "").trim() === goal && sameRefs(ln.scopePath || [], [])
    );
    return idx === -1 ? { show: false, lineNo: null } : { show: true, lineNo: idx + 1 };
  }, [taskLocked, lines, conclusion]);

  // ── Window width (responsive layout) ─────────────────────────────────────
  const { isNarrow, isMobile } = useWindowWidth();

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    sessionStorage.setItem(
      "currentProof",
      JSON.stringify({
        premisesText,
        conclusion,
        lines,
        currentScopePath,
        openBoxes,
        checkedProofStatus,
        taskLocked,
      })
    );
  }, [premisesText, conclusion, lines, currentScopePath, openBoxes, checkedProofStatus, taskLocked]);

  // After login/signup while a save was pending, trigger the save automatically.
  useEffect(() => {
    if (user && pendingSave) {
      setPendingSave(false);
      doSaveProof();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


  // ── Symbol toolbar ────────────────────────────────────────────────────────
  const activeRef = useRef(null);

  function setActive(el) {
    activeRef.current = el;
  }

  function insertToken(token) {
    const el = activeRef.current;
    if (!el) return;

    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const next  = el.value.slice(0, start) + token + el.value.slice(end);

    const field = el.getAttribute("data-field");
    if      (field === "premises")   onChangePremisesText(next);
    else if (field === "conclusion") setFormConclusion(next);
    else if (field === "step")       setStepFormula(next);
    else if (field === "refs")       setRefsText(next);

    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      if (el.setSelectionRange) el.setSelectionRange(pos, pos);
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function showToast(type, title, message) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function handleOpenSavedProof(proof) {
    const loadedLines = proof.lines || [];
    const restoredBoxes = computeOpenBoxes(loadedLines);
    setPremisesText((proof.premises || []).join("\n"));
    setConclusion(proof.conclusion || "");
    setLines(loadedLines);
    setTaskLocked(true);
    setCheckedProofStatus(null);
    setWorkspaceError(null);
    setStepFormula("");
    setRefsText("");
    setOpenBoxes(restoredBoxes);
    setCurrentScopePath(getActiveWritingScope(restoredBoxes, loadedLines));
    setPage("workspace");
  }

  function buildDefaultProofTitle() {
    const goal = conclusion.trim();
    return goal ? `Proof of ${goal}` : "Untitled proof";
  }

  async function doSaveProof() {
    if (!taskLocked) return;
    setSavingProof(true);
    try {
      const res = await fetch("http://localhost:8000/api/proofs/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: buildDefaultProofTitle(),
          proofState: { premises, conclusion, lines },
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok !== true) {
        setWorkspaceError({ type: "error", title: "Save failed", message: data?.message || "Could not save proof." });
        return;
      }
      if (data.title) setSavedTitle(data.title);
      showToast("success", "Proof saved", data?.message || "Saved successfully.");
    } catch (e) {
      setWorkspaceError({ type: "error", title: "Save failed", message: String(e) });
    } finally {
      setSavingProof(false);
    }
  }

  function saveProof() {
    if (!taskLocked) return;
    if (!user) {
      setPendingSave(true);
      setShowAuthModal(true);
      return;
    }
    doSaveProof();
  }

  async function checkProof(linesToCheck) {
    if (!taskLocked) return;
    setWorkspaceError(null);
    // Accept an explicit lines array (auto-check from validateAndAdd) or fall back to state.
    // Guard against a MouseEvent accidentally passed via button onClick.
    const effectiveLines = Array.isArray(linesToCheck) ? linesToCheck : lines;
    const isAutoCheck = Array.isArray(linesToCheck);
    if (!isAutoCheck && hasBrokenRefs) {
      setWorkspaceError({ type: "error", title: "Can't check proof", message: "Fix or remove the flagged lines before checking the proof." });
      return;
    }
    setCheckingProof(true);
    try {
      const res = await fetch("http://localhost:8000/api/check-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofState: { premises, conclusion, lines: effectiveLines } }),
      });
      const data = await res.json();
      if (data?.complete === true && data?.goalLine) {
        setCheckedProofStatus({ complete: true, goalLine: data.goalLine });
        setWorkspaceError({ type: "complete", title: "Proof complete ✓", message: data.message || "The conclusion was derived at top level." });
      } else {
        setCheckedProofStatus(null);
        setWorkspaceError({ type: "info", title: "Proof in progress", message: data.message || "Goal not yet reached." });
      }
    } catch {
      setCheckedProofStatus(null);
      setWorkspaceError({ type: "info", title: "Proof in progress", message: "Keep going — the goal hasn't been reached yet." });
    } finally {
      setCheckingProof(false);
    }
  }

  async function loadRandomTask() {
    setLoading(true);
    setTaskError("");
    try {
      const url = randomDifficulty === "any"
        ? "http://localhost:8000/api/random-task/"
        : `http://localhost:8000/api/random-task/?difficulty=${randomDifficulty}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data?.ok) {
        setFormPremisesText(data.premises.join("\n"));
        setFormConclusion(data.conclusion);
      } else {
        setTaskError(data?.message || "Could not load a random task.");
      }
    } catch {
      setTaskError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function startProof() {
    setLoading(true);
    setTaskError("");
    setCheckedProofStatus(null);

    const formPremises = premisesFromText(formPremisesText);
    const payload = { proofState: { premises: formPremises, conclusion: formConclusion } };

    try {
      const response = await fetch("http://localhost:8000/api/validate-task/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (data?.ok === true) {
        const normPremises   = Array.isArray(data.premises)          ? data.premises   : formPremises;
        const normConclusion = typeof data.conclusion === "string"   ? data.conclusion : formConclusion;

        setPremisesText(normPremises.join("\n"));
        setConclusion(normConclusion);
        setLines(normPremises.map(makePremiseLine));
        setCurrentScopePath([]);
        setOpenBoxes([]);
        setTaskLocked(true);
        setWorkspaceError(null);
        setPage("workspace");
      } else {
        setTaskError(friendifyError(data?.message) || "Please check your premises and conclusion, then try again.");
      }
    } catch {
      setTaskError("We couldn't reach the server. Please check the syntax and try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetProofToPremises() {
    setFormPremisesText(premisesText);
    setFormConclusion(conclusion);
    setTaskLocked(false);
    setPage("create");
    setLines(premises.map(makePremiseLine));
    setCurrentScopePath([]);
    setOpenBoxes([]);
    setStepFormula("");
    setRefsText("");
    setCheckedProofStatus(null);
    setWorkspaceError(null);
  }

  function discardProof() {
    setShowDiscardModal(true);
  }

  function confirmDiscard() {
    setShowDiscardModal(false);
    setPremisesText("");
    setConclusion("");
    setLines([]);
    setCurrentScopePath([]);
    setOpenBoxes([]);
    setCheckedProofStatus(null);
    setWorkspaceError(null);
    setTaskLocked(false);
    sessionStorage.removeItem("currentProof");
    setPage("create");
  }

  function onChangePremisesText(next) {
    setFormPremisesText(next);
    if (!taskLocked) {
      setLines(premisesFromText(next).map(makePremiseLine));
      setCurrentScopePath([]);
      setOpenBoxes([]);
      setCheckedProofStatus(null);
    }
  }

  async function openImplicationBox() {
    if (!taskLocked) return;
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/open-subproof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formula: stepFormula, rule: "IMP_I" }),
      });
      const data = await response.json();

      if (data?.ok !== true) {
        setWorkspaceError({ type: "error", title: "Could not open subproof", message: data?.message || "Check the formula." });
        return;
      }

      const parentScopePath = getActiveWritingScope(openBoxes, lines);
      const newLineNo       = lines.length + 1;
      const newScopePath    = [...parentScopePath, newLineNo];

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
      setWorkspaceError({ type: "error", title: "Could not open subproof", message: String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function validateAndAdd() {
    setWorkspaceError(null);
    if (rule === "IMP_I" && !refsText.trim()) {
      await openImplicationBox();
      return;
    }

    const newRefs   = parseRefs(refsText);
    const scopePath = buildProposedScopePath(rule, newRefs, lines, openBoxes);

    setLoading(true);

    const payload = {
      proofState:   { premises, conclusion, lines },
      proposedStep: { formula: stepFormula, rule, refs: newRefs, scopePath },
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
            !ln.brokenRef &&
            ln.formula === newFormula &&
            ln.rule === rule &&
            sameRefs(ln.refs || [], newRefs) &&
            sameRefs(ln.scopePath || [], scopePath)
        );

        if (alreadyExists) {
          setWorkspaceError({ type: "error", title: "Duplicate step", message: "This exact step already exists in your proof." });
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

        // Accumulate lines and open boxes, auto-inserting →I for each box whose
        // goal is now reached (cascade: an inserted →I line may close an outer box).
        // insertLineInScope places each line at its correct scope position so that
        // broken outer-scope lines left over from a deletion don't appear between
        // freshly derived inner-scope content.
        let accLines = insertLineInScope([...lines], newLine);
        let accBoxes = [...openBoxes];

        let keepClosing = true;
        while (keepClosing) {
          const justClosed = accBoxes.filter((box) => isImpBoxGoalReached(box, accLines));
          if (justClosed.length === 0) { keepClosing = false; break; }

          for (const closedBox of justClosed) {
            // Find the line that matched the box goal (last non-broken match wins for determinism)
            const finalLineIdx = accLines.reduce(
              (found, ln, i) =>
                ln.kind === "derived" &&
                !ln.brokenRef &&
                samePath(ln.scopePath || [], closedBox.scopePath || []) &&
                (ln.formula || "").trim() === (closedBox.goalFormula || "").trim()
                  ? i
                  : found,
              -1,
            );
            const assumptionLineIdx = closedBox.assumptionLineNo - 1; // 0-based

            accBoxes = accBoxes.filter((b) => b !== closedBox);

            if (finalLineIdx === -1) continue;

            try {
              const closeResp = await fetch("http://localhost:8000/api/close-subproof", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  proofState: { premises, conclusion, lines: accLines },
                  assumptionLineIndex: assumptionLineIdx,
                  finalLineIndex: finalLineIdx,
                }),
              });
              const closeData = await closeResp.json();

              if (closeData?.ok === true) {
                const impILine = {
                  formula: closeData.formula,
                  kind: "derived",
                  rule: "IMP_I",
                  refs: closeData.refs,
                  scopePath: closeData.scopePath,
                  discharges: [closedBox.assumptionLineNo],
                };
                accLines = insertLineInScope(accLines, impILine);
              } else {
                setWorkspaceError({ type: "error", title: "Could not auto-close subproof", message: closeData?.message || "Auto-insertion of →I failed." });
                keepClosing = false;
                break;
              }
            } catch (e) {
              setWorkspaceError({ type: "error", title: "Network error", message: String(e) });
              keepClosing = false;
              break;
            }
          }
        }

        setLines(accLines);
        const remainingBoxes = accBoxes.filter((box) => !isImpBoxGoalReached(box, accLines));
        setOpenBoxes(remainingBoxes);
        setCurrentScopePath(getActiveWritingScope(remainingBoxes, accLines));

        setStepFormula("");
        setRefsText("");
        showToast("success", "Step correctly added", data.message || "Step valid.");

        // If the conclusion is now derived at top level, auto-trigger the proof check
        // using the freshly built accLines (bypasses any stale-closure issue with state).
        const conclusionDerived = accLines.some(
          (ln) => (ln.formula || "").trim() === conclusion.trim() && sameRefs(ln.scopePath || [], [])
        );
        if (conclusionDerived) {
          checkProof(accLines);
        }
      } else {
        const rawMsg = data?.message || "";
        const msg = data?.type === "SYNTAX" ? friendifyError(rawMsg) : (rawMsg || "Step could not be validated.");
        if      (data?.type === "SYNTAX") setWorkspaceError({ type: "error", title: syntaxErrorTitle(rawMsg), message: msg });
        else if (data?.type === "RULE")   setWorkspaceError({ type: "error", title: "Rule error", message: msg });
        else                              setWorkspaceError({ type: "error", title: "Invalid step", message: msg });
      }
    } catch (e) {
      setWorkspaceError({ type: "error", title: "Network error", message: String(e) });
    } finally {
      setLoading(false);
    }
  }

  function computeOpenBoxes(nextLines) {
    return nextLines
      .filter((ln) => ln.kind === "assumption" && (ln.scopePath || []).length > 0 && ln.boxGoal)
      .filter((ln) => {
        const assumptionLineNo = (ln.scopePath || [])[ln.scopePath.length - 1];
        // A box is closed only when a non-broken →I line discharges this assumption.
        // Checking for the →I line (rather than just the goal formula) ensures the box
        // reopens whenever the →I was auto-removed during deletion, even if the goal
        // line itself is still present and valid.
        const hasClosingImpI = nextLines.some(
          (other) =>
            other.rule === "IMP_I" &&
            !other.brokenRef &&
            (other.discharges || []).includes(assumptionLineNo)
        );
        return !hasClosingImpI;
      })
      .map((ln) => {
        const assumptionLineNo = (ln.scopePath || [])[ln.scopePath.length - 1];
        const parentScopePath  = (ln.scopePath || []).slice(0, -1);
        return {
          kind: ln.boxRule || "IMP_I",
          assumptionFormula: ln.formula,
          goalFormula: ln.boxGoal,
          assumptionLineNo,
          scopePath: ln.scopePath,
          parentScopePath,
        };
      });
  }

  function doDeleteLine(index) {
    setDeleteConfirmState({ show: false, lineIndex: null, affectedLineNos: [] });
    setWorkspaceError(null);

    // Only the last derived line can be deleted (simple pop, no cascade).
    const updatedLines = lines.slice(0, index).concat(lines.slice(index + 1));
    const nextOpenBoxes = computeOpenBoxes(updatedLines);
    setLines(updatedLines);
    setOpenBoxes(nextOpenBoxes);
    setCurrentScopePath(getActiveWritingScope(nextOpenBoxes, updatedLines));
    setCheckedProofStatus(null);
  }

  function doUndoClosure(impILineIndex) {
    setDeleteSubproofState({ show: false, assumptionLineIndex: null, impILineIndex: null, lineCount: 0 });
    setWorkspaceError(null);

    // Remove the →I line and the goal line right before it (the last line inside the scope).
    const impILine = lines[impILineIndex];
    if (!impILine) return;

    const assumptionNo = (impILine.discharges || [])[0];
    const assumptionLine = lines[assumptionNo - 1];
    const scopePath = assumptionLine?.scopePath || [];

    // Find the goal line: the last derived line inside the subproof scope (before the →I).
    let goalIdx = -1;
    for (let i = impILineIndex - 1; i >= 0; i--) {
      const lsp = lines[i].scopePath || [];
      const inScope = lsp.length >= scopePath.length &&
        JSON.stringify(lsp.slice(0, scopePath.length)) === JSON.stringify(scopePath);
      if (inScope && lines[i].kind === "derived") {
        goalIdx = i;
        break;
      }
    }

    // Remove both lines (→I first since it's after the goal)
    const toRemove = new Set([impILineIndex]);
    if (goalIdx !== -1) toRemove.add(goalIdx);

    const updatedLines = lines.filter((_, i) => !toRemove.has(i));
    const nextOpenBoxes = computeOpenBoxes(updatedLines);
    setLines(updatedLines);
    setOpenBoxes(nextOpenBoxes);
    setCurrentScopePath(getActiveWritingScope(nextOpenBoxes, updatedLines));
    setCheckedProofStatus(null);
  }

  async function doDeleteSubproof(assumptionIdx) {
    setDeleteSubproofState({ show: false, assumptionLineIndex: null, lineCount: 0 });
    setWorkspaceError(null);
    try {
      const res = await fetch("http://localhost:8000/api/delete-subproof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofState: { lines }, assumptionLineIndex: assumptionIdx }),
      });
      const data = await res.json();
      if (!data.ok) {
        setWorkspaceError({ type: "error", title: "Could not delete subproof", message: data.message || "Deletion failed." });
        return;
      }
      const updatedLines = data.updatedLines;
      const nextOpenBoxes = computeOpenBoxes(updatedLines);
      setLines(updatedLines);
      setOpenBoxes(nextOpenBoxes);
      setCurrentScopePath(getActiveWritingScope(nextOpenBoxes, updatedLines));
      setCheckedProofStatus(null);
    } catch (e) {
      setWorkspaceError({ type: "error", title: "Network error", message: String(e) });
    }
  }

  function removeLine(index) {
    if (!taskLocked) {
      const current = premisesFromText(formPremisesText);
      const next    = current.filter((_, i) => i !== index);
      setFormPremisesText(next.join("\n"));
      return;
    }

    // Only the last line can be removed (bottom-to-top).
    if (index !== lines.length - 1) return;

    const target = lines[index];
    if (!target || target.kind === "premise") return;

    // If the last line is a →I that closes a subproof, delete the whole subproof
    if (target.rule === "IMP_I" && (target.discharges || []).length > 0) {
      const assumptionLineNo = target.discharges[0];
      const assumptionIdx = assumptionLineNo - 1;
      const assumptionLine = lines[assumptionIdx];
      const scopePath = assumptionLine?.scopePath || [];
      const lineCount = lines.filter((ln) => {
        const lsp = ln.scopePath || [];
        const inScope = lsp.length >= scopePath.length &&
          JSON.stringify(lsp.slice(0, scopePath.length)) === JSON.stringify(scopePath);
        const isImpi = ln.rule === "IMP_I" && (ln.discharges || []).includes(assumptionLineNo);
        return inScope || isImpi;
      }).length;
      setDeleteSubproofState({ show: true, assumptionLineIndex: assumptionIdx, impILineIndex: index, lineCount });
      return;
    }

    // Otherwise just remove the last line
    doDeleteLine(index);
  }

  // ── Sticky banner (New Proof page) ───────────────────────────────────────
  const { compact: createCompact, wrapperRef: createWrapperRef } = useStickyBanner();

  // ── Layout constants ──────────────────────────────────────────────────────
  const pagePad = "clamp(14px, 2.5vw, 28px)";

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebar = (
    <div
      style={{
        width: isMobile ? "100%" : 180,
        height: isMobile ? "auto" : "100vh",
        position: isMobile ? "relative" : "sticky",
        top: 0,
        flexShrink: 0,
        background: "#f5f8fc",
        borderRight: isMobile ? "none" : "1px solid #c8d8e8",
        borderBottom: isMobile ? "1px solid #c8d8e8" : "none",
        display: "flex",
        flexDirection: isMobile ? "row" : "column",
        alignItems: isMobile ? "center" : "stretch",
        padding: isMobile ? "8px 12px" : "20px 12px",
        boxSizing: "border-box",
        overflowY: isMobile ? "hidden" : "auto",
        overflowX: isMobile ? "auto" : "hidden",
        gap: isMobile ? 8 : 0,
        zIndex: 10,
      }}
    >
      <div style={{ marginBottom: isMobile ? 0 : 24, flexShrink: 0 }}>
        <img
          src={ndLogo}
          alt="Natural Deduction Tutor"
          style={{ width: isMobile ? 36 : "100%", height: "auto", display: "block" }}
        />
      </div>
      <nav style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 4, flex: isMobile ? 1 : undefined }}>
        <button
          onClick={() => setPage("create")}
          style={{
            textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
            background: page === "create" ? "#e8f0f8" : "transparent",
            color: page === "create" ? "#4ca2b5" : "#3a5068",
            cursor: "pointer", fontWeight: page === "create" ? 600 : 500, fontSize: 14,
            transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
          }}
        >
          New Proof
        </button>

        {taskLocked && (
          <button
            className="current-proof-tab"
            onClick={() => setPage("workspace")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
              background: page === "workspace" ? "#e8f0f8" : "transparent",
              color: page === "workspace" ? "#4ca2b5" : "#3a5068",
              cursor: "pointer", fontWeight: page === "workspace" ? 600 : 500, fontSize: 14,
              transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
            }}
          >
            Current Proof
            <span
              className="discard-btn"
              title="Discard proof"
              onClick={(e) => { e.stopPropagation(); discardProof(); }}
            >
              ×
            </span>
          </button>
        )}

        <button
          onClick={() => setPage("savedProofs")}
          style={{
            textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
            background: page === "savedProofs" ? "#e8f0f8" : "transparent",
            color: page === "savedProofs" ? "#4ca2b5" : "#3a5068",
            cursor: "pointer", fontWeight: page === "savedProofs" ? 600 : 500, fontSize: 14,
            transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
          }}
        >
          Saved Proofs
        </button>

        <button
          onClick={() => setPage("rules")}
          style={{
            textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
            background: page === "rules" ? "#e8f0f8" : "transparent",
            color: page === "rules" ? "#4ca2b5" : "#3a5068",
            cursor: "pointer", fontWeight: page === "rules" ? 600 : 500, fontSize: 14,
            transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
          }}
        >
          Rules
        </button>
      </nav>

      <div style={{
        marginTop: isMobile ? 0 : "auto",
        paddingTop: isMobile ? 0 : 16,
        borderTop: isMobile ? "none" : "1px solid #c8d8e8",
        marginLeft: isMobile ? "auto" : 0,
        flexShrink: 0,
      }}>
        {user ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#3a5068", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user}
            </span>
            <button
              onClick={logout}
              style={{
                textAlign: "left", padding: "7px 10px", borderRadius: 8,
                border: "1px solid #c8d8e8", background: "transparent",
                color: "#3a5068", cursor: "pointer", fontWeight: 500, fontSize: 13,
              }}
            >
              Log out
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            style={{
              width: "100%", textAlign: "center", padding: "8px 10px", borderRadius: 8,
              border: "none", background: "#4ca2b5", color: "#ffffff",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}
          >
            Log in / Sign up
          </button>
        )}
      </div>
    </div>
  );

  // Props shared by every PageShell call
  const shellProps = {
    isMobile,
    sidebar,
    showDiscardModal,
    confirmDiscard,
    setShowDiscardModal,
    deleteConfirmState,
    onConfirmDelete: () => doDeleteLine(deleteConfirmState.lineIndex),
    onCancelDelete: () => setDeleteConfirmState({ show: false, lineIndex: null, affectedLineNos: [] }),
    deleteSubproofState,
    onUndoClosure: () => doUndoClosure(deleteSubproofState.impILineIndex),
    onConfirmDeleteSubproof: () => doDeleteSubproof(deleteSubproofState.assumptionLineIndex),
    onCancelDeleteSubproof: () => setDeleteSubproofState({ show: false, assumptionLineIndex: null, impILineIndex: null, lineCount: 0 }),
    showAuthModal,
    setShowAuthModal,
    toasts,
    dismissToast,
  };

  // ── Create page ───────────────────────────────────────────────────────────
  if (page === "create") {
    return (
      <PageShell {...shellProps}>
        <div className="page-content-enter" style={{ flex: 1, height: isMobile ? "auto" : "100vh", overflowY: "auto", overflowX: "hidden", overflowAnchor: "none", padding: 0, boxSizing: "border-box" }}>
          {/* Banner is a direct child of the scroll container so position:sticky is reliable */}
          <div className={`rules-banner${createCompact ? " compact" : ""}`}>
            <div style={{ maxWidth: 980, margin: "0 auto" }}>
              <div className="rules-banner-eyebrow">Natural Deduction</div>
              <h1 className="rules-banner-title">New Proof</h1>
              <p className="rules-banner-subtitle">Enter premises and a conclusion, then start the proof.</p>
            </div>
          </div>
          {/* Wrapper carries the ref so the scroll hook can find the scroll container
              via parentElement. minHeight ensures the page is always tall enough to scroll. */}
          <div ref={createWrapperRef} style={{ minHeight: "100vh", boxSizing: "border-box" }}>
            <div style={{ padding: pagePad, boxSizing: "border-box" }}>
              <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
                <TaskInputPanel
                  formPremisesText={formPremisesText}
                  formConclusion={formConclusion}
                  randomDifficulty={randomDifficulty}
                  loading={loading}
                  taskError={taskError}
                  isNarrow={isNarrow}
                  onChangePremisesText={onChangePremisesText}
                  onSetFormConclusion={setFormConclusion}
                  onSetRandomDifficulty={setRandomDifficulty}
                  onStartProof={startProof}
                  onReset={() => { onChangePremisesText(""); setFormConclusion(""); }}
                  onLoadRandomTask={loadRandomTask}
                  onDismissError={() => setTaskError("")}
                  onFocus={setActive}
                  onInsertToken={insertToken}
                />
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Rules page ────────────────────────────────────────────────────────────
  if (page === "rules") {
    return (
      <PageShell {...shellProps}>
        <div className="page-content-enter" style={{ flex: 1, height: isMobile ? "auto" : "100vh", overflowY: "auto", overflowX: "hidden", overflowAnchor: "none" }}>
          <RulesPage />
        </div>
      </PageShell>
    );
  }

  // ── Saved Proofs page ─────────────────────────────────────────────────────
  if (page === "savedProofs") {
    return (
      <PageShell {...shellProps}>
        <div className="page-content-enter" style={{ flex: 1, height: isMobile ? "auto" : "100vh", overflowY: "auto", overflowX: "hidden", overflowAnchor: "none" }}>
          <SavedProofsPage
            onBackToWorkspace={() => setPage("workspace")}
            onOpenProof={handleOpenSavedProof}
            hideBackButton={true}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onShowToast={showToast}
          />
        </div>
      </PageShell>
    );
  }

  // ── Workspace page ────────────────────────────────────────────────────────
  return (
    <PageShell {...shellProps}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: isMobile ? "auto" : "100vh", overflow: "hidden" }}>

        {/* Task header strip — always visible, never scrolls */}
        <div style={{ padding: `${pagePad} ${pagePad} 0`, boxSizing: "border-box", flexShrink: 0 }}>
          <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap",
            background: "#e8f0f8", borderBottom: "1px solid #c8d8e8",
            borderRadius: 14, padding: "12px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <button
              onClick={resetProofToPremises}
              style={{ borderRadius: 8, padding: "4px 10px", background: "transparent", color: "#4ca2b5", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              ← Edit task
            </button>
            <div style={{ fontSize: 14, color: "#000b21", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", flex: 1 }}>
              Proving:{" "}
              {premises.length > 0 ? premises.join(", ") : "(no premises)"}
              {" "}⊢{" "}
              {conclusion.trim() || "(no conclusion)"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <ProblemTypeLabel premises={premises} />
              {taskLocked && (
                <ExportButton
                  proofData={{
                    title: savedTitle,
                    premises: premisesFromText(premisesText),
                    conclusion,
                    lines,
                    is_complete: checkedProofStatus?.complete ?? false,
                  }}
                  goalTreeElementId="proof-goal-tree"
                  size={18}
                  onExport={() => showToast("success", "Proof exported", "Proof opened for printing/download.")}
                />
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Workspace error zone — shown below Edit Task bar, cleared on next action */}
        {workspaceError && (
          <div style={{ padding: `0 ${pagePad}`, flexShrink: 0, boxSizing: "border-box" }}>
            <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 12 }}>
              <div style={{
                padding: "10px 16px",
                borderRadius: 10,
                borderLeft: `4px solid ${
                  workspaceError.type === "error"    ? "#ef4444"
                  : workspaceError.type === "warning"  ? "#f59e0b"
                  : workspaceError.type === "complete" ? "#22c55e"
                  : "#3b82f6"
                }`,
                background:
                  workspaceError.type === "error"    ? "#fff1f2"
                  : workspaceError.type === "warning"  ? "#fffbeb"
                  : workspaceError.type === "complete" ? "#f0fdf4"
                  : "#eff6ff",
                color:
                  workspaceError.type === "error"    ? "#991b1b"
                  : workspaceError.type === "warning"  ? "#92400e"
                  : workspaceError.type === "complete" ? "#166534"
                  : "#1d4ed8",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{workspaceError.title}</div>
                  {workspaceError.message && (
                    <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>{workspaceError.message}</div>
                  )}
                </div>
                <button
                  onClick={() => setWorkspaceError(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0, opacity: 0.6 }}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable panels area */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: `16px ${pagePad} ${pagePad}`, boxSizing: "border-box" }}>
          <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

          <div style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: 14,
            width: "100%",
            boxSizing: "border-box",
            alignItems: "start",
          }}>

            {/* ── Left panel: Proof Display ── */}
            <div style={{ background: "#ffffff", border: "1.5px solid #c8d8e8", borderRadius: 14, padding: 20, minWidth: 0, boxSizing: "border-box", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", order: isNarrow ? 2 : 1 }}>

              {/* Panel header with view toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#000b21" }}>Proof</h2>
                <span style={{ opacity: 0.75, fontSize: 12 }}>
                  {taskLocked ? `${lines.length} lines` : `${displayedLines.length} lines (preview)`}
                </span>

                {/* Sequential / Tree toggle */}
                <div style={{ marginLeft: "auto", display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #c8d8e8", flexShrink: 0 }}>
                  {["sequential", "tree"].map((mode) => (
                    <button
                      key={mode}
                      className="view-toggle-btn"
                      onClick={() => setProofViewMode(mode)}
                      style={{
                        padding: "4px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                        background: proofViewMode === mode ? "#4ca2b5" : "transparent",
                        color: proofViewMode === mode ? "#ffffff" : "#3a5068",
                      }}
                    >
                      {mode === "sequential" ? "Sequential" : "Tree"}
                    </button>
                  ))}
                </div>

                {taskLocked && proofViewMode === "sequential" && (
                  <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ opacity: 0.9, fontSize: 12 }}>
                      Goal:{" "}
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {conclusion.trim() || "(none)"}
                      </span>
                    </span>
                    {persistentConclusionBadge.show && (
                      <span style={{
                        display: "inline-block", padding: "4px 10px", borderRadius: 999,
                        fontSize: 12, fontWeight: 800, background: "#dcfce7",
                        color: "#166534", border: "1px solid #22c55e",
                      }}>
                        Conclusion derived on line {persistentConclusionBadge.lineNo} ✅
                      </span>
                    )}
                  </div>
                )}
              </div>

              {taskLocked && proofViewMode === "sequential" && (
                <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
                  Current scope:{" "}
                  {currentScopePath.length ? `[${currentScopePath.join(", ")}]` : "top level"}
                </div>
              )}

              {proofViewMode === "sequential" ? (
                <>
                  <ProofWorkspace
                    displayedLines={displayedLines}
                    refsPreview={refsPreview}
                    taskLocked={taskLocked}
                    ruleLabelByValue={ruleLabelByValue}
                    activeBox={activeBox}
                    onRemoveLine={removeLine}
                  />
                  {!taskLocked && (
                    <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 10 }}>
                      Preview mode: these lines reflect your premises. Click <b>Start proof</b> to lock the task and begin.
                    </div>
                  )}
                  <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, display: "grid", gap: 4 }}>
                    <div>Lines can only be added via validated steps.</div>
                    {taskLocked && <div>Use <b>Check Proof</b> to see the current global status of the proof.</div>}
                  </div>
                </>
              ) : (
                <div id="proof-goal-tree">
                  <GoalTree
                    lines={lines}
                    openBoxes={openBoxes}
                    conclusion={conclusion}
                  />
                </div>
              )}
            </div>

            {/* ── Right panel: Input / Controls ── */}
            <div style={{
              display: "flex", flexDirection: "column", gap: 14, minWidth: 0, boxSizing: "border-box",
              order: isNarrow ? 1 : 2,
              ...(isNarrow ? {} : {
                position: "sticky",
                top: 0,
                maxHeight: "100vh",
                overflowY: "auto",
              }),
            }}>

              {/* Propose Step */}
              <div style={{ background: "#ffffff", border: "1.5px solid #c8d8e8", borderRadius: 14, padding: 20, minWidth: 0, boxSizing: "border-box", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <h2 style={{ margin: "0 0 10px 0", fontSize: 17, fontWeight: 700, color: "#000b21" }}>Propose Step</h2>
                <StepInputPanel
                  stepFormula={stepFormula}
                  rule={rule}
                  refsText={refsText}
                  loading={loading}
                  taskLocked={taskLocked}
                  checkingProof={checkingProof}
                  savingProof={savingProof}
                  hasBrokenRefs={hasBrokenRefs}
                  onSetStepFormula={setStepFormula}
                  onSetRule={setRule}
                  onSetRefsText={setRefsText}
                  onFocus={setActive}
                  onInsertToken={insertToken}
                  onValidateAndAdd={validateAndAdd}
                  onCheckProof={checkProof}
                  onSaveProof={saveProof}
                />
              </div>

            </div>

          </div>
        </div>
      </div>

      </div>
    </PageShell>
  );
}
