import { apiPost, apiGet } from "./api";

/**
 * Validates a proposed proof step against inference rules.
 *
 * @param {Object} proofState   - Current proof state (`premises`, `conclusion`, `lines`).
 * @param {Object} proposedStep - The step to validate (`formula`, `rule`, `refs`, `scopePath`).
 * @returns {Promise<Object>} Validation result with `ok`, `type`, `message`, `normalised`.
 */
export async function validateStep(proofState, proposedStep) {
  const { data } = await apiPost("/validate-step", { proofState, proposedStep });
  return data;
}

/**
 * Validates and normalises the premises and conclusion of a proof task.
 *
 * @param {Object} proofState - Object with `premises` and `conclusion`.
 * @returns {Promise<Object>} Normalised task data or error details.
 */
export async function validateTask(proofState) {
  const { data } = await apiPost("/validate-task/", { proofState });
  return data;
}

/**
 * Checks whether a proof has reached its target conclusion.
 *
 * @param {Object} proofState - Current proof state.
 * @returns {Promise<Object>} Completeness result with `complete`, `goalLine`, etc.
 */
export async function checkProof(proofState) {
  const { data } = await apiPost("/check-proof", { proofState });
  return data;
}

/**
 * Requests the backend to open an implication-introduction subproof.
 *
 * @param {string} formula - The implication formula (e.g. "P → Q").
 * @param {string} rule    - Must be "IMP_I".
 * @returns {Promise<Object>} Result with `assumption`, `goal`, and `normalised`.
 */
export async function openSubproof(formula, rule) {
  const { data } = await apiPost("/open-subproof", { formula, rule });
  return data;
}

/**
 * Requests the backend to close a subproof and generate the →I line.
 *
 * @param {Object} proofState          - Current proof state.
 * @param {number} assumptionLineIndex - 0-based index of the assumption.
 * @param {number} finalLineIndex      - 0-based index of the goal line.
 * @returns {Promise<Object>} Result with `formula`, `refs`, and `scopePath`.
 */
export async function closeSubproof(proofState, assumptionLineIndex, finalLineIndex) {
  const { data } = await apiPost("/close-subproof", {
    proofState,
    assumptionLineIndex,
    finalLineIndex,
  });
  return data;
}

/**
 * Requests backend deletion of a single proof line with cascade invalidation.
 *
 * @param {Object} proofState - Object with `lines`.
 * @param {number} lineIndex  - 0-based index of the line to delete.
 * @returns {Promise<Object>} Updated lines and flagged line numbers.
 */
export async function deleteLineApi(proofState, lineIndex) {
  const { data } = await apiPost("/delete-line", {
    proofState: { lines: proofState.lines },
    lineIndex,
  });
  return data;
}

/**
 * Requests backend deletion of an entire subproof.
 *
 * @param {Array}  lines                - Current proof lines.
 * @param {number} assumptionLineIndex  - 0-based index of the assumption line.
 * @returns {Promise<Object>} Updated lines and flagged line numbers.
 */
export async function deleteSubproofApi(lines, assumptionLineIndex) {
  const { data } = await apiPost("/delete-subproof", {
    proofState: { lines },
    assumptionLineIndex,
  });
  return data;
}

/**
 * Fetches a random proof problem, optionally filtered by difficulty.
 *
 * @param {string} difficulty - "easy", "medium", "hard", or "any" for unfiltered.
 * @returns {Promise<Object>} Problem data with `premises`, `conclusion`, `difficulty`, `score`.
 */
export async function fetchRandomTask(difficulty) {
  const path = difficulty === "any"
    ? "/random-task/"
    : `/random-task/?difficulty=${difficulty}`;
  const { data } = await apiGet(path);
  return data;
}
