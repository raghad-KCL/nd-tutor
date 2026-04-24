import { useEffect, useMemo, useRef, useState } from "react";
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
} from "../utils";
import { saveProof as saveProofApi } from "../services/proofApi";
import {
  validateStep,
  validateTask,
  checkProof as checkProofApi,
  openSubproof as openSubproofApi,
  closeSubproof as closeSubproofApi,
  fetchRandomTask,
  deleteSubproofApi,
} from "../services/validationApi";


/**
 * Converts a raw parser/engine error message into student-friendly text.
 *
 * @param {string} msg - The raw error message from the backend.
 * @returns {string} A user-facing explanation.
 */
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

/**
 * Maps a raw syntax error message to a short toast title.
 *
 * @param {string} msg - The raw error message.
 * @returns {string} A concise title string.
 */
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

/**
 * Determines the scope path for a proposed proof step.
 *
 * For IMP_I the step lands in the parent scope of the discharged
 * assumption; for all other rules it lands in the active writing scope.
 *
 * @param {string}   rule      - The inference rule being applied.
 * @param {Array}    refs      - Parsed line references for the step.
 * @param {Array}    lines     - Current proof lines.
 * @param {Array}    openBoxes - Currently open subproof boxes.
 * @returns {number[]} The scope path array for the new line.
 */
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

/**
 * Inserts a new proof line at the correct position within its scope.
 *
 * Lines belonging to the same or deeper scope are shifted down and
 * their references, scope paths, and discharge numbers are renumbered.
 *
 * @param {Array}  lines   - Current proof lines (will not be mutated).
 * @param {Object} newLine - The line object to insert.
 * @returns {Array} A new lines array with the line inserted and
 *   subsequent references renumbered.
 */
function insertLineInScope(lines, newLine) {
  const P = newLine.scopePath || [];

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

/**
 * Re-derives the list of currently open subproof boxes from the lines.
 *
 * An assumption is considered open if no non-broken IMP_I line
 * discharges it.
 *
 * @param {Array} nextLines - The proof lines to scan.
 * @returns {Array<Object>} Open box descriptors with assumption info
 *   and scope paths.
 */
function computeOpenBoxes(nextLines) {
  return nextLines
    .filter((ln) => ln.kind === "assumption" && (ln.scopePath || []).length > 0 && ln.boxGoal)
    .filter((ln) => {
      const assumptionLineNo = (ln.scopePath || [])[ln.scopePath.length - 1];
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


/**
 * Central hook managing the full proof-construction lifecycle.
 *
 * Owns task creation, proof lines, open subproof boxes, step validation,
 * proof checking, saving, discarding, and session persistence.
 *
 * @param {Object}   params
 * @param {Object|null} params.user            - The authenticated user, or null.
 * @param {Function}    params.showToast       - Toast display callback from `useToasts`.
 * @param {Function}    params.setShowAuthModal - Setter to open the auth modal.
 * @returns {Object} A large bag of state values, derived data, and action
 *   handlers consumed by page components.
 */
export default function useProofState({ user, showToast, setShowAuthModal }) {

  // ── Page ──────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(() => {
    try {
      const s = sessionStorage.getItem("currentProof");
      return s && JSON.parse(s).taskLocked ? "workspace" : "create";
    } catch { return "create"; }
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [pendingSave, setPendingSave]       = useState(false);
  const [savingProof, setSavingProof]       = useState(false);
  const [savedTitle, setSavedTitle]         = useState(null);
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

  /**
   * Records the DOM element that last received focus in the symbol toolbar.
   *
   * @param {HTMLElement|null} el - The focused input element.
   */
  function setActive(el) {
    activeRef.current = el;
  }

  /**
   * Inserts a symbol token into whichever input field was last focused.
   *
   * Identifies the target field via its `data-field` attribute and
   * updates the corresponding state setter.
   *
   * @param {string} token - The symbol character to insert (e.g. "∧").
   */
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

  /**
   * Loads a previously saved proof into the workspace.
   *
   * Restores lines, open boxes, and scope, then navigates to the
   * workspace page.
   *
   * @param {Object} proof - A saved proof object from the API.
   */
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

  /**
   * Generates a default title for saving based on the conclusion formula.
   *
   * @returns {string} A title like "Proof of Q∧P" or "Untitled proof".
   */
  function buildDefaultProofTitle() {
    const goal = conclusion.trim();
    return goal ? `Proof of ${goal}` : "Untitled proof";
  }

  /**
   * Persists the current proof to the backend.
   *
   * @returns {Promise<void>}
   */
  async function doSaveProof() {
    if (!taskLocked) return;
    setSavingProof(true);
    try {
      const { ok, data } = await saveProofApi(buildDefaultProofTitle(), { premises, conclusion, lines });
      if (!ok) {
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

  /**
   * Initiates proof saving, prompting for authentication if needed.
   *
   * If the user is not logged in, sets `pendingSave` and opens the
   * auth modal; saving resumes automatically after login.
   */
  function saveProof() {
    if (!taskLocked) return;
    if (!user) {
      setPendingSave(true);
      setShowAuthModal(true);
      return;
    }
    doSaveProof();
  }

  /**
   * Asks the backend whether the proof is complete.
   *
   * @param {Array} [linesToCheck] - Optional lines array to check
   *   instead of the current `lines` state (used for auto-checking
   *   immediately after adding a step).
   * @returns {Promise<void>}
   */
  async function checkProof(linesToCheck) {
    if (!taskLocked) return;
    setWorkspaceError(null);
    const effectiveLines = Array.isArray(linesToCheck) ? linesToCheck : lines;
    const isAutoCheck = Array.isArray(linesToCheck);
    if (!isAutoCheck && hasBrokenRefs) {
      setWorkspaceError({ type: "error", title: "Can't check proof", message: "Fix or remove the flagged lines before checking the proof." });
      return;
    }
    setCheckingProof(true);
    try {
      const data = await checkProofApi({ premises, conclusion, lines: effectiveLines });
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

  /**
   * Fetches a random proof problem from the backend and fills the
   * create-task form fields.
   *
   * @returns {Promise<void>}
   */
  async function loadRandomTask() {
    setLoading(true);
    setTaskError("");
    try {
      const data = await fetchRandomTask(randomDifficulty);
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

  /**
   * Validates the task form inputs and transitions to the workspace page.
   *
   * On success the premises and conclusion are normalised, premise
   * lines are created, and the workspace is initialised.
   *
   * @returns {Promise<void>}
   */
  async function startProof() {
    setLoading(true);
    setTaskError("");
    setCheckedProofStatus(null);

    const formPremises = premisesFromText(formPremisesText);

    try {
      const data = await validateTask({ premises: formPremises, conclusion: formConclusion });

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

  /**
   * Returns to the create page with the current premises/conclusion
   * pre-filled, discarding all derived lines.
   */
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

  /** Opens the discard-confirmation modal. */
  function discardProof() {
    setShowDiscardModal(true);
  }

  /** Confirms discarding: clears all proof state and session storage. */
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

  /**
   * Handles changes to the premises textarea.
   *
   * When the task is not yet locked, re-derives premise lines from
   * the new text.
   *
   * @param {string} next - The updated premises text.
   */
  function onChangePremisesText(next) {
    setFormPremisesText(next);
    if (!taskLocked) {
      setLines(premisesFromText(next).map(makePremiseLine));
      setCurrentScopePath([]);
      setOpenBoxes([]);
      setCheckedProofStatus(null);
    }
  }

  /**
   * Opens a new →I subproof box from the step formula field.
   *
   * Validates the implication via the backend, then adds the
   * assumption line and registers the open box.
   *
   * @returns {Promise<void>}
   */
  async function openImplicationBox() {
    if (!taskLocked) return;
    setLoading(true);
    try {
      const data = await openSubproofApi(stepFormula, "IMP_I");

      if (data?.ok !== true) {
        const rawMsg = data?.message || "";
        if (data?.type === "SYNTAX") {
          setWorkspaceError({ type: "error", title: syntaxErrorTitle(rawMsg), message: friendifyError(rawMsg) });
        } else {
          setWorkspaceError({ type: "error", title: "Could not open subproof", message: rawMsg || "Check the formula." });
        }
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

  /**
   * Validates the proposed step and, if valid, adds it to the proof.
   *
   * After insertion, automatically closes any subproofs whose goals
   * have been reached and triggers a completion check when the
   * overall conclusion appears at top level.
   *
   * @returns {Promise<void>}
   */
  async function validateAndAdd() {
    setWorkspaceError(null);
    if (rule === "IMP_I" && !refsText.trim()) {
      await openImplicationBox();
      return;
    }

    const newRefs   = parseRefs(refsText);
    const scopePath = buildProposedScopePath(rule, newRefs, lines, openBoxes);

    setLoading(true);

    try {
      const data = await validateStep(
        { premises, conclusion, lines },
        { formula: stepFormula, rule, refs: newRefs, scopePath },
      );

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

        let accLines = insertLineInScope([...lines], newLine);
        let accBoxes = [...openBoxes];

        let keepClosing = true;
        while (keepClosing) {
          const justClosed = accBoxes.filter((box) => isImpBoxGoalReached(box, accLines));
          if (justClosed.length === 0) { keepClosing = false; break; }

          for (const closedBox of justClosed) {
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
            const assumptionLineIdx = closedBox.assumptionLineNo - 1;

            accBoxes = accBoxes.filter((b) => b !== closedBox);

            if (finalLineIdx === -1) continue;

            try {
              const closeData = await closeSubproofApi(
                { premises, conclusion, lines: accLines },
                assumptionLineIdx,
                finalLineIdx,
              );

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

  /**
   * Removes a single proof line by index and recomputes open boxes.
   *
   * @param {number} index - 0-based index of the line to remove.
   */
  function doDeleteLine(index) {
    setDeleteConfirmState({ show: false, lineIndex: null, affectedLineNos: [] });
    setWorkspaceError(null);

    const updatedLines = lines.slice(0, index).concat(lines.slice(index + 1));
    const nextOpenBoxes = computeOpenBoxes(updatedLines);
    setLines(updatedLines);
    setOpenBoxes(nextOpenBoxes);
    setCurrentScopePath(getActiveWritingScope(nextOpenBoxes, updatedLines));
    setCheckedProofStatus(null);
  }

  /**
   * Undoes a subproof closure by removing the →I line and the goal
   * step that triggered it, re-opening the subproof.
   *
   * @param {number} impILineIndex - 0-based index of the →I line.
   */
  function doUndoClosure(impILineIndex) {
    setDeleteSubproofState({ show: false, assumptionLineIndex: null, impILineIndex: null, lineCount: 0 });
    setWorkspaceError(null);

    const impILine = lines[impILineIndex];
    if (!impILine) return;

    const assumptionNo = (impILine.discharges || [])[0];
    const assumptionLine = lines[assumptionNo - 1];
    const scopePath = assumptionLine?.scopePath || [];

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

    const toRemove = new Set([impILineIndex]);
    if (goalIdx !== -1) toRemove.add(goalIdx);

    const updatedLines = lines.filter((_, i) => !toRemove.has(i));
    const nextOpenBoxes = computeOpenBoxes(updatedLines);
    setLines(updatedLines);
    setOpenBoxes(nextOpenBoxes);
    setCurrentScopePath(getActiveWritingScope(nextOpenBoxes, updatedLines));
    setCheckedProofStatus(null);
  }

  /**
   * Deletes an entire subproof via the backend and applies the
   * returned updated lines.
   *
   * @param {number} assumptionIdx - 0-based index of the assumption line.
   * @returns {Promise<void>}
   */
  async function doDeleteSubproof(assumptionIdx) {
    setDeleteSubproofState({ show: false, assumptionLineIndex: null, lineCount: 0 });
    setWorkspaceError(null);
    try {
      const data = await deleteSubproofApi(lines, assumptionIdx);
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

  /**
   * Entry-point for removing a line from the proof or the premise list.
   *
   * Before the task is locked, removes a premise from the form.
   * After locking, only the last line can be removed; if that line is
   * an →I discharge the subproof-delete modal is shown instead.
   *
   * @param {number} index - 0-based index of the line to remove.
   */
  function removeLine(index) {
    if (!taskLocked) {
      const current = premisesFromText(formPremisesText);
      const next    = current.filter((_, i) => i !== index);
      setFormPremisesText(next.join("\n"));
      return;
    }

    if (index !== lines.length - 1) return;

    const target = lines[index];
    if (!target || target.kind === "premise") return;

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

    doDeleteLine(index);
  }

  return {
    // Page
    page, setPage,

    // Task input
    formPremisesText, formConclusion, randomDifficulty,
    setFormConclusion, setRandomDifficulty, onChangePremisesText,

    // Proof state
    premisesText, premises, conclusion, lines, currentScopePath, openBoxes, activeBox,
    taskLocked, checkedProofStatus, savedTitle,

    // Step input
    stepFormula, setStepFormula, rule,
    setRule: (r) => { setRule(r); if (r === "IMP_I") setRefsText(""); },
    refsText, setRefsText,

    // Loading / error state
    loading, taskError, setTaskError, checkingProof, savingProof, workspaceError, setWorkspaceError,

    // Modal state
    showDiscardModal, setShowDiscardModal, deleteConfirmState, setDeleteConfirmState, deleteSubproofState, setDeleteSubproofState,

    // View
    proofViewMode, setProofViewMode,

    // Derived
    displayedLines, ruleLabelByValue, refsPreview, hasBrokenRefs, persistentConclusionBadge,

    // Symbol toolbar
    setActive, insertToken,

    // Actions
    handleOpenSavedProof,
    startProof, loadRandomTask, resetProofToPremises,
    discardProof, confirmDiscard,
    validateAndAdd, checkProof, saveProof,
    removeLine, doDeleteLine, doUndoClosure, doDeleteSubproof,
  };
}
