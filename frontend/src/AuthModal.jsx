import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

export default function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, [mode]);

  async function handleSubmit() {
    setError(null);
    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      onClose();
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onClose();
  }

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #c8d8e8",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    background: "#e8f0f8",
    color: "#000b21",
  };


  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "modalBackdropIn 0.2s ease-in-out both",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          position: "relative",
          background: "#f5f8fc",
          borderRadius: 18,
          padding: "28px 28px 24px",
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          boxSizing: "border-box",
          animation: "modalPanelIn 0.2s ease-in-out both",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 20,
            color: "#3a5068",
            cursor: "pointer",
            lineHeight: 1,
            padding: 0,
          }}
        >
          &times;
        </button>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "#000b21" }}>
          {mode === "login" ? "Log in" : "Sign up"}
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#3a5068" }}>
          {mode === "login"
            ? "Log in to save and manage your proofs."
            : "Create an account to save and manage your proofs."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            ref={usernameRef}
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            className="nd-input"
            style={inputStyle}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="nd-input"
            style={inputStyle}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {error && (
          <div
            className="feedback-enter"
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 8,
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              color: "#991b1b",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="nd-btn-primary"
          style={{
            marginTop: 16,
            width: "100%",
            padding: "10px",
            borderRadius: 10,
            border: "none",
            background: "#4ca2b5",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 14,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? (mode === "login" ? "Logging in..." : "Signing up...") : (mode === "login" ? "Log in" : "Sign up")}
        </button>

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "#3a5068" }}>
          {mode === "login" ? (
            <>
              No account?{" "}
              <button
                onClick={() => { setMode("signup"); setError(null); }}
                style={{ background: "none", border: "none", color: "#4ca2b5", cursor: "pointer", fontWeight: 600, padding: 0 }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => { setMode("login"); setError(null); }}
                style={{ background: "none", border: "none", color: "#4ca2b5", cursor: "pointer", fontWeight: 600, padding: 0 }}
              >
                Log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
