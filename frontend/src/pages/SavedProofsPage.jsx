import { useEffect, useRef, useState } from "react";

export default function SavedProofsPage({ onBackToWorkspace, onOpenProof, hideBackButton = false }) {
  const [savedProofs, setSavedProofs] = useState([]);
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [proofsFeedback, setProofsFeedback] = useState(null);

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("");

  // Rename state
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef(null);
  // Track whether Enter was pressed so blur doesn't cancel after confirm
  const renameConfirmedRef = useRef(false);

  async function loadSavedProofs() {
    setLoadingProofs(true);
    setProofsFeedback(null);

    try {
      const res = await fetch("http://localhost:8000/api/proofs/", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        setProofsFeedback({ ok: false, message: data?.message || "Failed to load saved proofs." });
        return;
      }

      setSavedProofs(data.proofs || []);
    } catch (e) {
      setProofsFeedback({ ok: false, message: `Load failed: ${String(e)}` });
    } finally {
      setLoadingProofs(false);
    }
  }

  async function openSavedProof(proofId) {
    setProofsFeedback(null);

    try {
      const res = await fetch(`http://localhost:8000/api/proofs/${proofId}/`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        setProofsFeedback({ ok: false, message: data?.message || "Failed to open proof." });
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
      setProofsFeedback({ ok: false, message: `Open failed: ${String(e)}` });
    }
  }

  async function deleteSavedProof(proofId) {
    setProofsFeedback(null);

    try {
      const res = await fetch(`http://localhost:8000/api/proofs/${proofId}/`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        setProofsFeedback({ ok: false, message: data?.message || "Failed to delete proof." });
        return;
      }

      setSavedProofs((prev) => prev.filter((p) => p.id !== proofId));
      setProofsFeedback({ ok: true, message: data?.message || "Proof deleted successfully." });
    } catch (e) {
      setProofsFeedback({ ok: false, message: `Delete failed: ${String(e)}` });
    }
  }

  async function renameProof(proofId, newTitle) {
    const trimmed = newTitle.trim();
    try {
      const res = await fetch(`http://localhost:8000/api/proofs/${proofId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: trimmed }),
      });

      const data = await res.json();

      if (!res.ok || data?.ok !== true) {
        setProofsFeedback({ ok: false, message: data?.message || "Failed to rename proof." });
        return;
      }

      setSavedProofs((prev) =>
        prev.map((p) => (p.id === proofId ? { ...p, title: trimmed } : p))
      );
    } catch (e) {
      setProofsFeedback({ ok: false, message: `Rename failed: ${String(e)}` });
    }
  }

  function startRename(proof) {
    renameConfirmedRef.current = false;
    setRenamingId(proof.id);
    setRenameValue(proof.title || "");
  }

  function confirmRename(proofId) {
    renameConfirmedRef.current = true;
    setRenamingId(null);
    renameProof(proofId, renameValue);
  }

  function cancelRename() {
    renameConfirmedRef.current = true; // prevent double-cancel from blur
    setRenamingId(null);
    setRenameValue("");
  }

  // Focus & select the rename input when it mounts
  useEffect(() => {
    if (renamingId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    loadSavedProofs();
  }, []);

  function getDisplayTitle(proof) {
    return proof.title || `Proof of ${proof.conclusion}`;
  }

  const filtered = savedProofs
    .filter((p) => {
      if (searchText) {
        const q = searchText.toLowerCase();
        if (
          !getDisplayTitle(p).toLowerCase().includes(q) &&
          !p.conclusion.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (statusFilter === "Complete" && !p.is_complete) return false;
      if (statusFilter === "In Progress" && p.is_complete) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "Newest") return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === "Oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === "A\u2013Z") return getDisplayTitle(a).localeCompare(getDisplayTitle(b));
      if (sortBy === "Z\u2013A") return getDisplayTitle(b).localeCompare(getDisplayTitle(a));
      return 0;
    });

  const selectStyle = {
    borderRadius: 8,
    padding: "6px 10px",
    background: "#ffffff",
    color: "#555c6a",
    border: "1px solid #e8e9ec",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 13,
    outline: "none",
  };

  return (
    <div
      style={{
        background: "#f0f2f5",
        color: "#1a1a1a",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "clamp(14px, 2.5vw, 28px)",
        boxSizing: "border-box",
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
        <p style={{ opacity: 0.85, marginTop: 8 }}>Saved proofs</p>

        <div style={{ display: "flex", gap: 10, marginTop: 16, marginBottom: 6, flexWrap: "wrap" }}>
          {!hideBackButton && (
            <button
              onClick={onBackToWorkspace}
              style={{
                borderRadius: 10,
                padding: "8px 14px",
                background: "#ffffff",
                color: "#555c6a",
                border: "1px solid #e8e9ec",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Back to Workspace
            </button>
          )}

          <button
            onClick={loadSavedProofs}
            disabled={loadingProofs}
            style={{
              borderRadius: 10,
              padding: "8px 14px",
              background: "#ffffff",
              color: "#555c6a",
              border: "1px solid #e8e9ec",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {loadingProofs ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            background: "#ffffff",
            border: "none",
            borderRadius: 18,
            padding: 20,
            boxSizing: "border-box",
            boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>Saved Proofs</h2>
            <span style={{ opacity: 0.75, fontSize: 13 }}>
              {filtered.length}{filtered.length !== savedProofs.length ? ` of ${savedProofs.length}` : ""} proof{savedProofs.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Filter bar */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Search by title..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                flex: "1 1 200px",
                borderRadius: 8,
                padding: "6px 10px",
                background: "#f8f9fb",
                color: "#1a1a1a",
                border: "1px solid #e8e9ec",
                fontSize: 13,
                outline: "none",
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option>All</option>
              <option>Complete</option>
              <option>In Progress</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={selectStyle}
            >
              <option value="">Sort by...</option>
              <option>Newest</option>
              <option>Oldest</option>
              <option value="A\u2013Z">A&ndash;Z</option>
              <option value="Z\u2013A">Z&ndash;A</option>
            </select>
          </div>

          {proofsFeedback && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: proofsFeedback.ok ? "#e8faf8" : "#fee2e2",
                border: proofsFeedback.ok ? "1px solid #0bc4b0" : "1px solid #fca5a5",
                color: proofsFeedback.ok ? "#0bc4b0" : "#991b1b",
              }}
            >
              {proofsFeedback.message}
            </div>
          )}

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {!loadingProofs && filtered.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                {savedProofs.length === 0 ? "No saved proofs yet." : "No proofs match the current filters."}
              </div>
            ) : (
              filtered.map((proof) => (
                <div
                  key={proof.id}
                  style={{
                    background: "#f8f9fb",
                    border: "1px solid #edeef1",
                    borderRadius: 14,
                    padding: 14,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title row with inline rename */}
                      {renamingId === proof.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmRename(proof.id);
                              if (e.key === "Escape") cancelRename();
                            }}
                            onBlur={() => {
                              if (!renameConfirmedRef.current) cancelRename();
                            }}
                            style={{
                              fontWeight: 800,
                              fontSize: 16,
                              flex: 1,
                              padding: "2px 6px",
                              borderRadius: 6,
                              border: "1px solid #0bc4b0",
                              outline: "none",
                              background: "#ffffff",
                              color: "#1a1a1a",
                              boxSizing: "border-box",
                            }}
                          />
                          <button
                            onMouseDown={(e) => {
                              // prevent blur from firing before click
                              e.preventDefault();
                              confirmRename(proof.id);
                            }}
                            title="Confirm rename"
                            style={{
                              background: "#0bc4b0",
                              border: "none",
                              borderRadius: 6,
                              color: "#fff",
                              cursor: "pointer",
                              padding: "2px 8px",
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            Save
                          </button>
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              cancelRename();
                            }}
                            title="Cancel rename"
                            style={{
                              background: "none",
                              border: "1px solid #e8e9ec",
                              borderRadius: 6,
                              color: "#555c6a",
                              cursor: "pointer",
                              padding: "2px 8px",
                              fontSize: 13,
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 16 }}>
                            {getDisplayTitle(proof)}
                          </span>
                          <button
                            onClick={() => startRename(proof)}
                            title="Rename"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "0 2px",
                              color: "#adb5bd",
                              fontSize: 14,
                              lineHeight: 1,
                              flexShrink: 0,
                            }}
                          >
                            &#x270E;
                          </button>
                        </div>
                      )}

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
                        background: proof.is_complete ? "#e8faf8" : "#f5f6f8",
                        color: proof.is_complete ? "#0bc4b0" : "#8a8f99",
                        border: proof.is_complete ? "1px solid #0bc4b0" : "1px solid #e8e9ec",
                        flexShrink: 0,
                      }}
                    >
                      {proof.is_complete ? "Complete" : "In progress"}
                    </div>
                  </div>

                  <div style={{ opacity: 0.8, fontSize: 13 }}>
                    Premises: {Array.isArray(proof.premises) ? proof.premises.length : 0} &middot;{" "}
                    Lines: {Array.isArray(proof.lines) ? proof.lines.length : 0}
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
                        background: "#0bc4b0",
                        color: "#ffffff",
                        border: "none",
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
                        background: "#ffffff",
                        color: "#991b1b",
                        border: "1px solid #fca5a5",
                        cursor: "pointer",
                        fontWeight: 500,
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
