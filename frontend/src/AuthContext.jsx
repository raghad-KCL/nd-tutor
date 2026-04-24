import { createContext, useContext, useEffect, useState } from "react";
import { fetchCurrentUser, loginUser, registerUser, logoutUser } from "./services/authApi";

/** @type {React.Context<{user: string|null|undefined, login: Function, register: Function, logout: Function}|null>} */
const AuthContext = createContext(null);

/**
 * Provides authentication state and actions to the component tree.
 *
 * On mount, fetches the current session user. Exposes `login`,
 * `register`, and `logout` actions via context. The `user` value is
 * `undefined` while loading, `null` when unauthenticated, or a
 * username string when logged in.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components.
 */
export function AuthProvider({ children }) {
  // undefined = loading, null = not logged in, string = username
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    fetchCurrentUser()
      .then((username) => setUser(username))
      .catch(() => setUser(null));
  }, []);

  /**
   * Authenticates with the backend and updates the user state.
   *
   * @param {string} username
   * @param {string} password
   * @returns {Promise<string>} The authenticated username.
   */
  async function login(username, password) {
    const resultUsername = await loginUser(username, password);
    setUser(resultUsername);
    return resultUsername;
  }

  /**
   * Registers a new account and updates the user state.
   *
   * @param {string} username
   * @param {string} password
   * @returns {Promise<string>} The newly created username.
   */
  async function register(username, password) {
    const resultUsername = await registerUser(username, password);
    setUser(resultUsername);
    return resultUsername;
  }

  /** Logs out the user and resets the user state to `null`. */
  async function logout() {
    await logoutUser();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Convenience hook to access the auth context.
 *
 * @returns {{ user: string|null|undefined, login: Function, register: Function, logout: Function }}
 */
export function useAuth() {
  return useContext(AuthContext);
}
