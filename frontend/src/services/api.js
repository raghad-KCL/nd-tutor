/** @type {string} Base URL for all API requests. */
const API_BASE = "http://localhost:8000/api";

/**
 * Low-level fetch wrapper that prepends the API base URL, sets JSON
 * headers, and includes credentials.
 *
 * @param {string} path    - API path (e.g. "/auth/me").
 * @param {RequestInit} [options={}] - Fetch options (method, body, etc.).
 * @returns {Promise<{res: Response, data: *}>} The raw `Response` and
 *   parsed JSON body.
 */
export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: options.credentials ?? "include",
  });
  const data = await res.json();
  return { res, data };
}

/**
 * Performs a GET request to the given API path.
 *
 * @param {string} path - API path.
 * @returns {Promise<{res: Response, data: *}>}
 */
export async function apiGet(path) {
  return apiFetch(path, { method: "GET" });
}

/**
 * Performs a POST request with a JSON body to the given API path.
 *
 * @param {string} path - API path.
 * @param {*}      body - Request payload (will be JSON-stringified).
 * @returns {Promise<{res: Response, data: *}>}
 */
export async function apiPost(path, body) {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
