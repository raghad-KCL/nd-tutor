/**
 * Classifies a proof task as a tautology (no premises) or derivation.
 *
 * @param {string[]} premises - List of premise formula strings.
 * @returns {"Tautology"|"Derivation"}
 */
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

/**
 * Returns the colour palette for a subproof at the given nesting depth.
 * Cycles through `SUBPROOF_COLORS`.
 *
 * @param {number} depth - 0-based nesting depth.
 * @returns {Object} Colour descriptor with `border`, `bg`, `label`, etc.
 */
export function getSubproofColor(depth) {
  return SUBPROOF_COLORS[depth % SUBPROOF_COLORS.length];
}

// ── Proof-line pure helpers ────────────────────────────────────────────────

/**
 * Splits a newline-delimited text block into an array of non-empty
 * premise strings.
 *
 * @param {string} text - Raw textarea value.
 * @returns {string[]} Trimmed, non-empty premise strings.
 */
export function premisesFromText(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Creates a proof-line object for a premise formula.
 *
 * @param {string} formula - The premise formula string.
 * @returns {Object} A line object with `kind: "premise"` and empty refs/scope.
 */
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

/**
 * Parses a comma-separated references string into an array of
 * line numbers (integers) or subproof ranges (`[i, j]` arrays).
 *
 * @param {string} refsText - Raw text like "1, 3-5, 2".
 * @returns {Array<number|number[]>} Parsed references.
 */
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

/**
 * Formats a single reference for display (e.g. `3` or `"3–5"`).
 *
 * @param {number|number[]} ref - A line number or `[start, end]` range.
 * @returns {string}
 */
export function formatRef(ref) {
  return Array.isArray(ref) ? `${ref[0]}\u2013${ref[1]}` : String(ref);
}

/**
 * Compares two reference arrays for deep equality.
 *
 * Handles both integer refs and `[i, j]` range refs.
 *
 * @param {Array} a - First reference array.
 * @param {Array} b - Second reference array.
 * @returns {boolean}
 */
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

/**
 * Checks whether two scope paths are identical.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {boolean}
 */
export function samePath(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Checks whether `prefix` is a prefix of `full`.
 *
 * @param {number[]} prefix
 * @param {number[]} full
 * @returns {boolean}
 */
export function isPrefixPath(prefix = [], full = []) {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

/**
 * Returns the direct child items (lines and subproof boxes) at
 * a given scope path.
 *
 * Lines exactly at `scopePath` become `{ type: "line" }` items.
 * Assumptions one level deeper become `{ type: "box" }` items.
 *
 * @param {number[]} scopePath - The scope to inspect.
 * @param {Array}    lines     - Full proof lines.
 * @returns {Array<{type: "line"|"box", line: Object}>}
 */
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

/**
 * Checks whether a subproof's goal has been derived within its scope.
 *
 * @param {Object} boxLine - The assumption line that opens the box.
 * @param {Array}  lines   - Full proof lines.
 * @returns {boolean}
 */
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

/**
 * Checks whether an open subproof box's goal has been derived.
 *
 * @param {Object|null} box   - Open box descriptor from `useProofState`.
 * @param {Array}       lines - Full proof lines.
 * @returns {boolean}
 */
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

/**
 * Returns the scope path where the next proof line should be written.
 *
 * Walks the open boxes stack from innermost outward, returning the
 * scope of the first box whose goal has not yet been derived.
 * Falls back to the top-level scope (`[]`).
 *
 * @param {Array} openBoxes - Currently open subproof descriptors.
 * @param {Array} lines     - Full proof lines.
 * @returns {number[]} The active writing scope path.
 */
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
