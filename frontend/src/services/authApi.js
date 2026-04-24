import { apiGet, apiPost } from "./api";

/**
 * Fetches the currently authenticated user's username via the session.
 *
 * @returns {Promise<string|null>} The username, or `null` if not logged in.
 */
export async function fetchCurrentUser() {
  const { data } = await apiGet("/auth/me");
  return data?.username ?? null;
}

/**
 * Authenticates a user with username and password.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} The authenticated username.
 * @throws {Error} If login fails.
 */
export async function loginUser(username, password) {
  const { res, data } = await apiPost("/auth/login", { username, password });
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || "Login failed.");
  }
  return data.username;
}

/**
 * Registers a new user account and logs them in.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} The newly created username.
 * @throws {Error} If registration fails.
 */
export async function registerUser(username, password) {
  const { res, data } = await apiPost("/auth/register", { username, password });
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || "Registration failed.");
  }
  return data.username;
}

/**
 * Logs out the current user by destroying the server-side session.
 *
 * @returns {Promise<void>}
 */
export async function logoutUser() {
  await apiPost("/auth/logout", {});
}
