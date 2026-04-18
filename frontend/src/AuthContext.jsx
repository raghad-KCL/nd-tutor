import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = loading, null = not logged in, string = username
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    fetch("http://localhost:8000/api/auth/me", {
      method: "GET",
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setUser(data?.username ?? null);
      })
      .catch(() => {
        setUser(null);
      });
  }, []);

  async function login(username, password) {
    const res = await fetch("http://localhost:8000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || "Login failed.");
    }
    setUser(data.username);
    return data.username;
  }

  async function register(username, password) {
    const res = await fetch("http://localhost:8000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || "Registration failed.");
    }
    setUser(data.username);
    return data.username;
  }

  async function logout() {
    await fetch("http://localhost:8000/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
