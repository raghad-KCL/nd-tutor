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
];

function parseRefs(refsText) {
  if (!refsText.trim()) return [];
  return refsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function sameRefs(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
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
  currentScopePath,
  openBoxes
) {
  if (rule === "IMP_I") {
    const assumptionNo = refs[0];
    const assumptionLine = lines[assumptionNo - 1];

    if (!assumptionLine || assumptionLine.kind !== "assumption") {
      return [];
    }

    return assumptionLine.scopePath.slice(0, -1);
  }

  return getActiveWritingScope(openBoxes, currentScopePath, lines);
}


function lineIsInsideScope(line, scopePath) {
  if (!scopePath || scopePath.length === 0) return false;
  if (!line?.scopePath) return false;
  if (line.scopePath.length < scopePath.length) return false;

  for (let i = 0; i < scopePath.length; i++) {
    if (line.scopePath[i] !== scopePath[i]) return false;
  }

  return true;
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
      sameRefs(ln.scopePath || [], box.scopePath || []) &&
      (ln.formula || "").trim() === goal
  );
}

function getActiveWritingScope(openBoxes, currentScopePath, lines) {
  if (!openBoxes.length) return currentScopePath;

  for (let i = openBoxes.length - 1; i >= 0; i--) {
    const box = openBoxes[i];
    const reached = isImpBoxGoalReached(box, lines);

    if (!reached) {
      return box.scopePath || [];
    }
  }

  return [];
}

export default function App() {

  const [page, setPage] = useState("workspace");

  const [savingProof, setSavingProof] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // ----------
  const [globalFeedback, setGlobalFeedback] = useState(null);
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

  // --- Validation response ---
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

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

    setResult(null);
    setGlobalFeedback(null);
    setSaveFeedback(null);
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
    setSaveFeedback(null);

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
        setSaveFeedback({
          ok: false,
          message: data?.message || "Failed to save proof.",
        });
        return;
      }

      setSaveFeedback({
        ok: true,
        message: data?.message || "Proof saved successfully.",
        proofId: data?.proof?.id ?? null,
      });
    } catch (e) {
      setSaveFeedback({
        ok: false,
        message: `Save failed: ${String(e)}`,
      });
    } finally {
      setSavingProof(false);
    }
  }
  
  //###########################33
  async function checkProof() {
    if (!taskLocked) return;

    setResult(null);
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
      setGlobalFeedback(data);

      if (data?.complete === true && data?.goalLine) {
        setCheckedProofStatus({
          complete: true,
          goalLine: data.goalLine,
        });
      } else {
        setCheckedProofStatus(null);
      }
    } catch (e) {
      setGlobalFeedback({
        ok: false,
        message: `Check Proof failed: ${String(e)}`,
        progress: [],
        hints: [],
      });
      setCheckedProofStatus(null);
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
    setResult(null);
    setCheckedProofStatus(null);

    const payload = { proofState: { premises, conclusion } };

    try {
      const res = await fetch("http://localhost:8000/api/validate-task/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data?.ok === true) {
        const normPremises = Array.isArray(data.premises) ? data.premises : premises;
        const normConclusion =
          typeof data.conclusion === "string" ? data.conclusion : conclusion;

        setSaveFeedback(null);
        setGlobalFeedback(null);
        setPremisesText(normPremises.join("\n"));
        setConclusion(normConclusion);

        setLines(normPremises.map(makePremiseLine));
        setCurrentScopePath([]);
        setOpenBoxes([]);
        setTaskLocked(true);

        setResult({
          status: res.status,
          data: { ok: true, message: "Task valid. Proof started." },
        });
      } else {
        setResult({ status: res.status, data });
      }
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  function resetProofToPremises() {
    setGlobalFeedback(null);
    setTaskLocked(false);
    setLines(premises.map(makePremiseLine));
    setCurrentScopePath([]);
    setOpenBoxes([]);
    setStepFormula("");
    setRefsText("");
    setResult(null);
    setCheckedProofStatus(null);
    setSaveFeedback(null);
  }

  function onChangePremisesText(next) {
    setPremisesText(next);

    if (!taskLocked) {
      const nextPremises = premisesFromText(next);
      setGlobalFeedback(null);
      setLines(nextPremises.map(makePremiseLine));
      setCurrentScopePath([]);
      setOpenBoxes([]);
      setCheckedProofStatus(null);
      setSaveFeedback(null);
    }
  }

  async function openImplicationBox() {
    if (!taskLocked) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("http://localhost:8000/api/open-subproof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formula: stepFormula,
          rule: "IMP_I",
        }),
      });

      const data = await res.json();
      setResult({ status: res.status, data });

      if (data?.ok !== true) {
        return;
      }

      const parentScopePath = getActiveWritingScope(openBoxes, currentScopePath, lines);

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

      setSaveFeedback(null);
      setGlobalFeedback(null);
      setStepFormula("");
      setRefsText("");
    } catch (e) {
      setResult({ error: String(e) });
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
      currentScopePath,
      openBoxes
    );

    setLoading(true);
    setResult(null);

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
      const res = await fetch("http://localhost:8000/api/validate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setResult({ status: res.status, data });

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
          setResult({
            status: res.status,
            data: {
              ok: false,
              type: "RULE",
              message: "This exact step already exists in your proof.",
            },
          });
          return;
        }

        const newLine = {
          formula: newFormula,
          kind: "derived",
          rule,
          refs: newRefs,
          scopePath,
          discharges: rule === "IMP_I" ? [newRefs[0]] : [],
        };

        const nextLines = [...lines, newLine];
        setLines(nextLines);

        if (rule === "IMP_I") {
          const assumptionNo = newRefs[0];
          setOpenBoxes((prev) =>
            prev.filter((box) => box.assumptionLineNo !== assumptionNo)
          );
        }

        const remainingBoxes =
          rule === "IMP_I"
            ? openBoxes.filter((box) => box.assumptionLineNo !== newRefs[0])
            : openBoxes;

        setCurrentScopePath(
          getActiveWritingScope(remainingBoxes, scopePath, nextLines)
        );

        setSaveFeedback(null);
        setGlobalFeedback(null);
        setStepFormula("");
        setRefsText("");
      }
    } catch (e) {
      setResult({ error: String(e) });
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

    setLines((prev) => {
      const target = prev[index];
      if (!target || target.kind === "premise") return prev;

      const next = prev.filter((_, i) => i !== index);

      let nextOpenBoxes = openBoxes;

      if (target.kind === "assumption") {
        const removedLineNo = index + 1;

        nextOpenBoxes = openBoxes.filter(
          (box) =>
            box.assumptionLineNo !== removedLineNo &&
            !isPrefixPath(target.scopePath || [], box.scopePath || [])
        );

        setOpenBoxes(nextOpenBoxes);
      }

      setCurrentScopePath(
        getActiveWritingScope(nextOpenBoxes, [], next)
      );

      setSaveFeedback(null);
      setGlobalFeedback(null);
      return next;
    });
  }
    

  const ok = result?.data?.ok === true;
  const errType = result?.data?.type;

  const pill = (text, bg) => (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: bg,
        color: "#111",
        marginRight: 8,
      }}
    >
      {text}
    </span>
  );

  const typeBadge = (type) => {
    if (!type) return null;
    return (
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          marginRight: 8,
          background: type === "SYNTAX" ? "#fff3cd" : "#e7f1ff",
          color: "#111",
          border: "1px solid #ddd",
        }}
      >
        {type}
      </span>
    );
  };

  const toolButtonStyle = {
    borderRadius: 10,
    padding: "8px 12px",
    background: "#1f1f1f",
    color: "#eee",
    border: "1px solid #333",
    cursor: "pointer",
    fontWeight: 800,
    minWidth: 44,
  };

  const pagePad = "clamp(14px, 2.5vw, 28px)";


  if (page === "savedProofs") {
    return (
      <SavedProofsPage
        onBackToWorkspace={() => setPage("workspace")}
        onOpenProof={handleOpenSavedProof}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#121212",
        color: "#eee",
        fontFamily: "system-ui",
        padding: pagePad,
        boxSizing: "border-box",
        overflowX: "hidden",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ fontSize: 42, margin: 0 }}>ND Tutor</h1>
        <p style={{ opacity: 0.85, marginTop: 8 }}>
          Proof workspace demo (React UI → Django proof engine)
        </p>

        {/* Navigation */}
        <div style={{ display: "flex", gap: 10, marginTop: 16, marginBottom: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setPage("workspace")}
            style={{
              borderRadius: 10,
              padding: "10px 14px",
              background: page === "workspace" ? "#2b2b2b" : "#1b1b1b",
              color: "#eee",
              border: "1px solid #3a3a3a",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Proof Workspace
          </button>

          <button
            onClick={() => setPage("savedProofs")}
            style={{
              borderRadius: 10,
              padding: "10px 14px",
              background: page === "savedProofs" ? "#2b2b2b" : "#1b1b1b",
              color: "#eee",
              border: "1px solid #3a3a3a",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Saved Proofs
          </button>
        </div>

        {/* Task panel */}
        <div
          style={{
            marginTop: 18,
            background: "#1b1b1b",
            border: "1px solid #2a2a2a",
            borderRadius: 14,
            padding: 16,
            boxSizing: "border-box",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Task</h2>

            {taskLocked && (
              <span style={{ opacity: 0.75, fontSize: 13 }}>
                Task is locked (reset proof to edit).
              </span>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={startProof}
                disabled={loading || taskLocked}
                style={{
                  borderRadius: 10,
                  padding: "10px 14px",
                  background: taskLocked ? "#151515" : "#2b2b2b",
                  color: taskLocked ? "#777" : "#eee",
                  border: "1px solid #3a3a3a",
                  cursor: taskLocked ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
              >
                Start proof
              </button>

              <button
                onClick={resetProofToPremises}
                style={{
                  borderRadius: 10,
                  padding: "10px 14px",
                  background: "#2b2b2b",
                  color: "#eee",
                  border: "1px solid #3a3a3a",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Reset proof
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "1.15fr 0.85fr",
              gap: 14,
              marginTop: 14,
              width: "100%",
              boxSizing: "border-box",
              alignItems: "start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
                Premises (one per line)
              </div>
              <textarea
                data-field="premises"
                onFocus={(e) => setActive(e.target)}
                value={premisesText}
                onChange={(e) => onChangePremisesText(e.target.value)}
                rows={4}
                disabled={taskLocked}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  borderRadius: 10,
                  padding: 10,
                  background: taskLocked ? "#141414" : "#101010",
                  color: "#eee",
                  border: "1px solid #2a2a2a",
                  outline: "none",
                  resize: "vertical",
                  opacity: taskLocked ? 0.75 : 1,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
                Conclusion
              </div>
              <input
                data-field="conclusion"
                onFocus={(e) => setActive(e.target)}
                value={conclusion}
                onChange={(e) => setConclusion(e.target.value)}
                disabled={taskLocked}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  borderRadius: 10,
                  padding: 10,
                  background: taskLocked ? "#141414" : "#101010",
                  color: "#eee",
                  border: "1px solid #2a2a2a",
                  outline: "none",
                  opacity: taskLocked ? 0.75 : 1,
                  boxSizing: "border-box",
                }}
              />

              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
                Quick tips: you can type symbols or words:
                <div style={{ opacity: 0.8, marginTop: 6 }}>
                  <code style={{ color: "#ddd" }}>not / and / or</code>,{" "}
                  <code style={{ color: "#ddd" }}>! ~ &amp; | -&gt;</code>,{" "}
                  <code style={{ color: "#ddd" }}>¬ ∧ ∨ →</code>
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

                {!taskLocked && (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                    When you're ready, click <b>Start proof</b> to syntax-check + normalise
                    the task.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 14,
            marginTop: 14,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {/* Proof */}
          <div
            style={{
              background: "#1b1b1b",
              border: "1px solid #2a2a2a",
              borderRadius: 14,
              padding: 16,
              minWidth: 0,
              boxSizing: "border-box",
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
              <h2 style={{ margin: 0, fontSize: 18 }}>Proof</h2>

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
                      background: "#102418",
                      color: "#d1fae5",
                      border: "1px solid #224d32",
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
                const isHighlighted = refsPreview.includes(lineNo);

                return (
                  <div
                    key={`line-${lineNo}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "54px 1fr 100px",
                      alignItems: "center",
                      gap: 10,
                      background: isHighlighted ? "#171717" : "#141414",
                      border: isHighlighted ? "1px solid #5a5a5a" : "1px solid #2a2a2a",
                      borderRadius: 12,
                      padding: "10px 12px",
                      minWidth: 0,
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ opacity: 0.8 }}>#{lineNo}</div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {ln.formula}
                      </div>

                      {ln.kind === "premise" && (
                        <div style={{ opacity: 0.65, fontSize: 12, marginTop: 4 }}>
                          premise
                        </div>
                      )}

                      {ln.kind === "assumption" && (
                        <div
                          style={{
                            opacity: 0.85,
                            fontSize: 12,
                            marginTop: 4,
                            fontWeight: 700,
                          }}
                        >
                          assumption
                        </div>
                      )}

                      {ln.kind === "derived" && (
                        <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
                          {(ruleLabelByValue[ln.rule] || ln.rule)} ({(ln.refs || []).join(", ")})
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => removeLine(lineNo - 1)}
                      disabled={taskLocked && ln.kind === "premise"}
                      style={{
                        borderRadius: 10,
                        padding: "8px 10px",
                        background:
                          taskLocked && ln.kind === "premise" ? "#151515" : "#1f1f1f",
                        color: taskLocked && ln.kind === "premise" ? "#777" : "#ddd",
                        border: "1px solid #333",
                        cursor:
                          taskLocked && ln.kind === "premise" ? "not-allowed" : "pointer",
                        fontWeight: 700,
                        opacity: taskLocked && ln.kind === "premise" ? 0.7 : 1,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              }

              function renderBox(boxLine) {
                const lineNo = displayedLines.indexOf(boxLine) + 1;
                const items = getDirectItemsForScope(boxLine.scopePath || [], displayedLines);
                const goalReached = boxGoalReached(boxLine, displayedLines);
                const isOpenBox =
                  activeBox &&
                  activeBox.assumptionLineNo === lineNo;

                return (
                  <div
                    key={`box-${lineNo}`}
                    style={{
                      border: "3px solid #d8d8d8",
                      borderColor: isOpenBox ? "#9aa6ff" : "#6d6d6d",
                      borderRadius: 2,
                      padding: 12,
                      marginTop: 8,
                      marginBottom: 8,
                      background: "#111",
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
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
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

                    <div style={{ display: "grid", gap: 8 }}>
                      {renderLineCard(boxLine)}

                      {items
                        .filter((item) => !(item.type === "line" && item.line === boxLine))
                        .map((item) =>
                          item.type === "line"
                            ? renderLineCard(item.line)
                            : renderBox(item.line)
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
              background: "#1b1b1b",
              border: "1px solid #2a2a2a",
              borderRadius: 14,
              padding: 16,
              minWidth: 0,
              boxSizing: "border-box",
            }}
          >
            <h2 style={{ margin: "0 0 10px 0", fontSize: 18 }}>Propose Step</h2>

            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Formula</div>
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
                background: "#101010",
                color: "#eee",
                border: "1px solid #2a2a2a",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
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
                background: "#101010",
                color: "#eee",
                border: "1px solid #2a2a2a",
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
                  background:
                    taskLocked && stepFormula.trim() ? "#2b2b2b" : "#151515",
                  color: taskLocked && stepFormula.trim() ? "#eee" : "#777",
                  border: "1px solid #3a3a3a",
                  cursor:
                    taskLocked && stepFormula.trim() ? "pointer" : "not-allowed",
                  fontWeight: 800,
                }}
              >
                Open →I Box
              </button>
            )}

            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
              References (comma-separated line numbers)
            </div>
            <input
              data-field="refs"
              onFocus={(e) => setActive(e.target)}
              value={refsText}
              onChange={(e) => setRefsText(e.target.value)}
              placeholder={
                rule === "IMP_I"
                  ? "e.g., assumptionLine, finalLine"
                  : "e.g., 1, 2"
              }
              style={{
                width: "100%",
                maxWidth: "100%",
                borderRadius: 10,
                padding: 10,
                background: "#101010",
                color: "#eee",
                border: "1px solid #2a2a2a",
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
                background: taskLocked ? "#2b2b2b" : "#151515",
                color: taskLocked ? "#eee" : "#777",
                border: "1px solid #3a3a3a",
                cursor: taskLocked ? "pointer" : "not-allowed",
                fontWeight: 800,
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
                background: taskLocked ? "#2b2b2b" : "#151515",
                color: taskLocked ? "#eee" : "#777",
                border: "1px solid #3a3a3a",
                cursor: taskLocked ? "pointer" : "not-allowed",
                fontWeight: 800,
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
                  background: taskLocked ? "#2b2b2b" : "#151515",
                  color: taskLocked ? "#eee" : "#777",
                  border: "1px solid #3a3a3a",
                  cursor: taskLocked ? "pointer" : "not-allowed",
                  fontWeight: 800,
                }}
              >
                {savingProof ? "Saving..." : "Save Proof"}
              </button>

            {!taskLocked && (
              <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
                Start the proof first to validate steps.
              </div>
            )}

            <div
              style={{
                marginTop: 14,
                background: "#141414",
                border: "1px solid #2a2a2a",
                borderRadius: 12,
                padding: 12,
                minHeight: 88,
                boxSizing: "border-box",
              }}
            >
              {!result && !globalFeedback ? (
                <div style={{ opacity: 0.75 }}>No feedback yet.</div>
              ) : result?.error ? (
                <div>
                  {typeBadge("NETWORK")}
                  <span style={{ fontWeight: 700 }}>Request failed:</span>{" "}
                  <span style={{ opacity: 0.9 }}>{result.error}</span>
                </div>
              ) : result ? (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    {ok ? pill("VALID", "#d1fae5") : pill("INVALID", "#fee2e2")}
                    {!ok && typeBadge(errType)}
                    <span style={{ opacity: 0.8 }}>HTTP {result.status}</span>
                  </div>

                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {result.data.message || "(No message)"}
                  </div>

                  <details style={{ marginTop: 8, opacity: 0.9 }}>
                    <summary style={{ cursor: "pointer" }}>Show raw response</summary>
                    <pre
                      style={{
                        marginTop: 8,
                        whiteSpace: "pre-wrap",
                        background: "#0f0f0f",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #222",
                        overflowX: "auto",
                      }}
                    >
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : null}

              {globalFeedback && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: globalFeedback.complete ? "#102418" : "#161616",
                    border: globalFeedback.complete ? "1px solid #224d32" : "1px solid #343434",
                    color: globalFeedback.complete ? "#d1fae5" : "#eee",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    {globalFeedback.complete ? "Proof status: Complete ✅" : "Proof status: In progress"}
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    {globalFeedback.message}
                  </div>

                  {Array.isArray(globalFeedback.progress) && globalFeedback.progress.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {globalFeedback.complete ? "Summary" : "Progress"}
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {globalFeedback.progress.map((item, idx) => (
                          <div key={idx} style={{ opacity: 0.9, fontSize: 13 }}>
                            • {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(globalFeedback.hints) && globalFeedback.hints.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Hint</div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {globalFeedback.hints.map((item, idx) => (
                          <div key={idx} style={{ opacity: 0.9, fontSize: 13 }}>
                            • {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {saveFeedback && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: saveFeedback.ok ? "#102418" : "#2a1616",
                    border: saveFeedback.ok ? "1px solid #224d32" : "1px solid #5a2a2a",
                    color: saveFeedback.ok ? "#d1fae5" : "#fee2e2",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    {saveFeedback.ok ? "Save status: Saved ✅" : "Save status: Failed"}
                  </div>

                  <div>{saveFeedback.message}</div>

                  {saveFeedback.ok && saveFeedback.proofId && (
                    <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                      Proof ID: {saveFeedback.proofId}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ opacity: 0.7, marginTop: 14, fontSize: 12 }}>
          Note: premises are inserted as initial proof lines only after you click <b>Start proof</b>.
        </div>
      </div>
    </div>
  );
}