import { apiGet, apiPost, apiFetch } from "./api";

/**
 * Creates a new saved proof on the server.
 *
 * @param {string} title      - Display title for the proof.
 * @param {Object} proofState - Object with `premises`, `conclusion`, and `lines`.
 * @returns {Promise<{ok: boolean, data: Object}>}
 */
export async function saveProof(title, proofState) {
  const { res, data } = await apiPost("/proofs/", { title, proofState });
  return { ok: res.ok && data?.ok === true, data };
}

/**
 * Fetches all saved proofs for the current user.
 *
 * @returns {Promise<Object>} Response data with a `proofs` array.
 */
export async function fetchProofs() {
  const { data } = await apiGet("/proofs/");
  return data;
}

/**
 * Fetches a single saved proof by its id.
 *
 * @param {number} proofId - Primary key of the proof.
 * @returns {Promise<Object>} Response data with the `proof` object.
 */
export async function fetchProof(proofId) {
  const { data } = await apiGet(`/proofs/${proofId}/`);
  return data;
}

/**
 * Updates an existing proof (PATCH).
 *
 * @param {number} proofId - Primary key of the proof.
 * @param {Object} body    - Fields to update (`title`, `proofState`, etc.).
 * @returns {Promise<{ok: boolean, data: Object}>}
 */
export async function updateProof(proofId, body) {
  const { res, data } = await apiFetch(`/proofs/${proofId}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return { ok: res.ok && data?.ok === true, data };
}

/**
 * Deletes a saved proof.
 *
 * @param {number} proofId - Primary key of the proof to delete.
 * @returns {Promise<{ok: boolean, data: Object}>}
 */
export async function deleteProof(proofId) {
  const { res, data } = await apiFetch(`/proofs/${proofId}/`, {
    method: "DELETE",
  });
  return { ok: res.ok && data?.ok === true, data };
}
