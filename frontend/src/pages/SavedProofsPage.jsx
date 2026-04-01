import { useEffect, useState } from "react";

export default function SavedProofsPage({ onBackToWorkspace, onOpenProof }) {
  const [savedProofs, setSavedProofs] = useState([]);
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [proofsFeedback, setProofsFeedback] = useState(null);

  async function loadSavedProofs() {
    setLoadingProofs(true);
    setProofsFeedback(null);

    try {
      const res = await fetch("http://localhost:8000/api/proofs/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        setProofsFeedback({
          ok: false,
          message: data?.message || "Failed to load saved proofs.",
        });
        return;
      }

      setSavedProofs(data.proofs || []);
    } catch (e) {
      setProofsFeedback({
        ok: false,
        message: `Load failed: ${String(e)}`,
      });
    } finally {
      setLoadingProofs(false);
    }
  }

  async function openSavedProof(proofId) {
    setProofsFeedback(null);

    try {
      const res = await fetch(`http://localhost:8000/api/proofs/${proofId}/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        setProofsFeedback({
          ok: false,
          message: data?.message || "Failed to open proof.",
        });
        return;
      }

      const proof = data.proof;

      onOpenProof({
        premises: proof.premises || [],
        conclusion: proof.conclusion || "",
        lines: proof.lines || [],
        title: proof.title || "",
        id: proof.id,
      });
    } catch (e) {
      setProofsFeedback({
        ok: false,
        message: `Open failed: ${String(e)}`,
      });
    }
  }

  async function deleteSavedProof(proofId) {
    setProofsFeedback(null);

    try {
      const res = await fetch(`http://localhost:8000/api/proofs/${proofId}/`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        setProofsFeedback({
          ok: false,
          message: data?.message || "Failed to delete proof.",
        });
        return;
      }

      setSavedProofs((prev) => prev.filter((p) => p.id !== proofId));
      setProofsFeedback({
        ok: true,
        message: data?.message || "Proof deleted successfully.",
      });
    } catch (e) {
      setProofsFeedback({
        ok: false,
        message: `Delete failed: ${String(e)}`,
      });
    }
  }

  useEffect(() => {
    loadSavedProofs();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#121212",
        color: "#eee",
        fontFamily: "system-ui",
        padding: "clamp(14px, 2.5vw, 28px)",
        boxSizing: "border-box",
        overflowX: "hidden",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ fontSize: 42, margin: 0 }}>ND Tutor</h1>
        <p style={{ opacity: 0.85, marginTop: 8 }}>
          Saved proofs
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 16, marginBottom: 6, flexWrap: "wrap" }}>
          <button
            onClick={onBackToWorkspace}
            style={{
              borderRadius: 10,
              padding: "10px 14px",
              background: "#2b2b2b",
              color: "#eee",
              border: "1px solid #3a3a3a",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Back to Workspace
          </button>

          <button
            onClick={loadSavedProofs}
            disabled={loadingProofs}
            style={{
              borderRadius: 10,
              padding: "10px 14px",
              background: "#2b2b2b",
              color: "#eee",
              border: "1px solid #3a3a3a",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {loadingProofs ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            background: "#1b1b1b",
            border: "1px solid #2a2a2a",
            borderRadius: 14,
            padding: 16,
            boxSizing: "border-box",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Saved Proofs</h2>
            <span style={{ opacity: 0.75, fontSize: 13 }}>
              {savedProofs.length} proof{savedProofs.length === 1 ? "" : "s"}
            </span>
          </div>

          {proofsFeedback && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: proofsFeedback.ok ? "#102418" : "#2a1616",
                border: proofsFeedback.ok ? "1px solid #224d32" : "1px solid #5a2a2a",
                color: proofsFeedback.ok ? "#d1fae5" : "#fee2e2",
              }}
            >
              {proofsFeedback.message}
            </div>
          )}

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {!loadingProofs && savedProofs.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No saved proofs yet.</div>
            ) : (
              savedProofs.map((proof) => (
                <div
                  key={proof.id}
                  style={{
                    background: "#141414",
                    border: "1px solid #2a2a2a",
                    borderRadius: 12,
                    padding: 14,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>
                        {proof.title || `Proof #${proof.id}`}
                      </div>

                      <div style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>
                        Conclusion:{" "}
                        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          {proof.conclusion}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        alignSelf: "start",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        background: proof.is_complete ? "#102418" : "#1f1f1f",
                        color: proof.is_complete ? "#d1fae5" : "#ddd",
                        border: proof.is_complete ? "1px solid #224d32" : "1px solid #333",
                      }}
                    >
                      {proof.is_complete ? "Complete" : "In progress"}
                    </div>
                  </div>

                  <div style={{ opacity: 0.8, fontSize: 13 }}>
                    Premises: {Array.isArray(proof.premises) ? proof.premises.length : 0} ·
                    {" "}Lines: {Array.isArray(proof.lines) ? proof.lines.length : 0}
                  </div>

                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    Updated: {proof.updated_at ? new Date(proof.updated_at).toLocaleString() : "-"}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                    <button
                      onClick={() => openSavedProof(proof.id)}
                      style={{
                        borderRadius: 10,
                        padding: "10px 14px",
                        background: "#2b2b2b",
                        color: "#eee",
                        border: "1px solid #3a3a3a",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Open
                    </button>

                    <button
                      onClick={() => deleteSavedProof(proof.id)}
                      style={{
                        borderRadius: 10,
                        padding: "10px 14px",
                        background: "#2b2b2b",
                        color: "#eee",
                        border: "1px solid #5a2a2a",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}