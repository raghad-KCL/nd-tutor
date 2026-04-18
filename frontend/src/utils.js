export function getProblemType(premises) {
  return premises.length === 0 ? "Tautology" : "Derivation";
}

export const PROBLEM_TYPE_TOOLTIPS = {
  Tautology:
    "This problem has no premises, you are proving a tautology (a statement that is always true).",
  Derivation:
    "This problem includes premises, derive the conclusion using the given assumptions.",
};

// ── Rule definitions ───────────────────────────────────────────────────────

export const RULES = [
  { value: "AND_E1", label: "∧E1  (And-Elim Left)",            name: "∧ Elimination 1",  schema: "A ∧ B\n─────\n  A" },
  { value: "AND_E2", label: "∧E2  (And-Elim Right)",           name: "∧ Elimination 2",  schema: "A ∧ B\n─────\n  B" },
  { value: "AND_I",  label: "∧I   (And-Intro)",                name: "∧ Introduction",   schema: "A    B\n────────\n A ∧ B" },
  { value: "OR_E",   label: "∨E (Disjunction Elimination)",    name: "∨ Elimination",    schema: "A → C    B → C    A ∨ B\n────────────────────────\n          C" },
  { value: "OR_I1",  label: "∨I1  (Or-Intro Left)",            name: "∨ Introduction 1", schema: "  A\n─────\nA ∨ B" },
  { value: "OR_I2",  label: "∨I2  (Or-Intro Right)",           name: "∨ Introduction 2", schema: "  B\n─────\nA ∨ B" },
  { value: "IMP_E",  label: "→E   (Modus Ponens)",             name: "→ Elimination",    schema: "A    A → B\n──────────\n    B" },
  { value: "IMP_I",  label: "→I   (Implication Introduction)", name: "→ Introduction",   schema: "┌ A  [assumption]\n│ ⋮\n│ B\n└──────────\n  A → B" },
  { value: "IFF_E",  label: "↔E   (Equivalence Elimination)",  name: "↔ Elimination",    schema: "    A ↔ B\n─────────────────────\n(A → B) ∧ (B → A)" },
  { value: "IFF_I",  label: "↔I   (Equivalence Introduction)", name: "↔ Introduction",   schema: "A → B    B → A\n───────────────\n    A ↔ B" },
  { value: "NEG_E",  label: "¬E   (Negation Elimination)",     name: "¬ Elimination",    schema: "¬A → B    ¬A → ¬B\n──────────────────\n        A" },
  { value: "NEG_I",  label: "¬I   (Negation Introduction)",    name: "¬ Introduction",   schema: "A → B    A → ¬B\n────────────────\n      ¬A" },
  { value: "REIT",   label: "Reit (Reiteration)",              name: "Reiteration",      schema: "  A        (outer scope)\n──────────────────────\n  A        (current scope)" },
];

// ── Subproof colours (used by ProofWorkspace and GoalTree) ─────────────────

export const SUBPROOF_COLORS = [
  { border: "#0bc4b0", bg: "#e8faf8", treeBorder: "#0bc4b0", treeBg: "#e8faf8", label: "#0bc4b0" },
  { border: "#818cf8", bg: "#eef2ff", treeBorder: "#818cf8", treeBg: "#eef2ff", label: "#6366f1" },
  { border: "#f59e0b", bg: "#fffbeb", treeBorder: "#f59e0b", treeBg: "#fffbeb", label: "#d97706" },
  { border: "#ec4899", bg: "#fdf2f8", treeBorder: "#ec4899", treeBg: "#fdf2f8", label: "#db2777" },
  { border: "#22c55e", bg: "#f0fdf4", treeBorder: "#22c55e", treeBg: "#f0fdf4", label: "#16a34a" },
];

export function getSubproofColor(depth) {
  return SUBPROOF_COLORS[depth % SUBPROOF_COLORS.length];
}

// ── Proof-line pure helpers ────────────────────────────────────────────────

export function premisesFromText(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function makePremiseLine(formula) {
  return {
    formula: formula.trim(),
    kind: "premise",
    rule: "PREMISE",
    refs: [],
    scopePath: [],
    discharges: [],
  };
}

export function parseRefs(refsText) {
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

export function formatRef(ref) {
  return Array.isArray(ref) ? `${ref[0]}\u2013${ref[1]}` : String(ref);
}

export function sameRefs(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Array.isArray(a[i]) && Array.isArray(b[i])) {
      if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
    } else if (a[i] !== b[i]) return false;
  }
  return true;
}

// ── Scope path helpers (used by GoalTree and ProofWorkspace) ───────────────

export function samePath(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function isPrefixPath(prefix = [], full = []) {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

export function getDirectItemsForScope(scopePath, lines) {
  const items = [];
  for (const line of lines) {
    const lineScope = line.scopePath || [];
    if (samePath(lineScope, scopePath)) {
      items.push({ type: "line", line });
      continue;
    }
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

export function boxGoalReached(boxLine, lines) {
  const goal = (boxLine.boxGoal || "").trim();
  if (!goal) return false;
  return lines.some(
    (ln) =>
      ln.kind === "derived" &&
      !ln.brokenRef &&
      samePath(ln.scopePath || [], boxLine.scopePath || []) &&
      (ln.formula || "").trim() === goal
  );
}

export function isImpBoxGoalReached(box, lines) {
  if (!box) return false;
  const goal = (box.goalFormula || "").trim();
  if (!goal) return false;
  return lines.some(
    (ln) =>
      ln.kind === "derived" &&
      !ln.brokenRef &&
      samePath(ln.scopePath || [], box.scopePath || []) &&
      (ln.formula || "").trim() === goal
  );
}

export function getActiveWritingScope(openBoxes, lines) {
  if (!openBoxes.length) return [];
  for (let i = openBoxes.length - 1; i >= 0; i--) {
    const box = openBoxes[i];
    if (!isImpBoxGoalReached(box, lines)) {
      return box.scopePath || [];
    }
  }
  return [];
}
