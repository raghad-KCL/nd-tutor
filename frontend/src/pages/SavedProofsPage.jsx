import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import ExportButton from "../components/ExportButton";
import { useStickyBanner } from "../hooks/useStickyBanner";
import { fetchProofs, fetchProof, deleteProof as deleteProofApi, updateProof } from "../services/proofApi";

/**
 * Page listing all of the user's saved proofs with search, filter,
 * sort, inline rename, delete confirmation, and export capabilities.
 * Prompts unauthenticated users to log in.
 *
 * @param {Object}   props
 * @param {Function} props.onBackToWorkspace - Navigate back to the workspace.
 * @param {Function} props.onOpenProof       - Callback to load a saved proof into the workspace.
 * @param {boolean}  [props.hideBackButton=false] - Hide the "Back to Workspace" button.
 * @param {Function} props.onOpenAuthModal   - Opens the authentication modal.
 * @param {Function} props.onShowToast       - Toast display callback.
 */
export default function SavedProofsPage({ onBackToWorkspace, onOpenProof, hideBackButton = false, onOpenAuthModal, onShowToast }) {
  const { user } = useAuth();
  const { compact, wrapperRef } = useStickyBanner();
  const [savedProofs, setSavedProofs] = useState([]);
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [proofsFeedback, setProofsFeedback] = useState(null);

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("");

  // Delete confirm state
  const [deleteConfirmProof, setDeleteConfirmProof] = useState(null);

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
      const data = await fetchProofs();

      if (data?.ok !== true) {
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
      const data = await fetchProof(proofId);

      if (data?.ok !== true) {
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
      const { ok, data } = await deleteProofApi(proofId);

      if (!ok) {
        setProofsFeedback({ ok: false, message: data?.message || "Failed to delete proof." });
        return;
      }

      setSavedProofs((prev) => prev.filter((p) => p.id !== proofId));
      onShowToast?.("success", "Proof deleted", data?.message || "Proof deleted successfully.");
    } catch (e) {
      setProofsFeedback({ ok: false, message: `Delete failed: ${String(e)}` });
    }
  }

  async function renameProof(proofId, newTitle) {
    const trimmed = newTitle.trim();
    try {
      const { ok, data } = await updateProof(proofId, { title: trimmed });

      if (!ok) {
        setProofsFeedback({ ok: false, message: data?.message || "Failed to rename proof." });
        return;
      }

      setSavedProofs((prev) =>
        prev.map((p) => (p.id === proofId ? { ...p, title: trimmed } : p))
      );
      onShowToast?.("success", "Proof renamed", `Renamed to "${trimmed}".`);
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

  if (user === undefined) {
    return (
      <div ref={wrapperRef} style={{ minHeight: "100vh", background: "#f5f8fc" }}>
        <div className={`rules-banner${compact ? " compact" : ""}`}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div className="rules-banner-eyebrow">Natural Deduction</div>
            <h1 className="rules-banner-title">Saved Proofs</h1>
          </div>
        </div>
        <div style={{ padding: "clamp(14px, 2.5vw, 28px)", color: "#3a5068", fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div ref={wrapperRef} style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "0 0 60px" }}>
        <div className={`rules-banner${compact ? " compact" : ""}`}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div className="rules-banner-eyebrow">Natural Deduction</div>
            <h1 className="rules-banner-title">Saved Proofs</h1>
            <p className="rules-banner-subtitle">Your saved natural deduction proofs.</p>
          </div>
        </div>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 32px 0", boxSizing: "border-box" }}>
          <div style={{ background: "#ffffff", border: "1px solid #c8d8e8", borderRadius: 14, padding: "32px 28px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", textAlign: "center" }}>
            <p style={{ fontSize: 16, color: "#3a5068", marginTop: 0, marginBottom: 20 }}>
              To access this page you need to log in or sign up.
            </p>
            <button
              onClick={onOpenAuthModal}
              style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#4ca2b5", color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Log in / Sign up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      ref={wrapperRef}
      style={{
        minHeight: "100vh",
        background: "#f5f8fc",
        color: "#000b21",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "0 0 60px",
      }}
    >
      {/* Dark header banner */}
      <div className={`rules-banner${compact ? " compact" : ""}`}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="rules-banner-eyebrow">Natural Deduction</div>
          <h1 className="rules-banner-title">Saved Proofs</h1>
          <p className="rules-banner-subtitle">Your saved natural deduction proofs.</p>

          {/* Search + filter row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search by title..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="banner-frosted-input"
              style={{
                flex: "1 1 200px",
                maxWidth: "360px",
                padding: "9px 14px",
                borderRadius: "999px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="banner-frosted-select"
              style={{
                borderRadius: 999,
                padding: "9px 10px",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              <option>All</option>
              <option>Complete</option>
              <option>In Progress</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="banner-frosted-select"
              style={{
                borderRadius: 999,
                padding: "9px 10px",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              <option value="">Sort by...</option>
              <option>Newest</option>
              <option>Oldest</option>
              <option value="A\u2013Z">A&ndash;Z</option>
              <option value="Z\u2013A">Z&ndash;A</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 32px 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          {!hideBackButton && (
            <button
              onClick={onBackToWorkspace}
              className="nd-btn-secondary"
              style={{
                borderRadius: 10,
                padding: "8px 14px",
                background: "#f5f8fc",
                color: "#3a5068",
                border: "1px solid #c8d8e8",
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
            className="nd-btn-secondary"
            style={{
              borderRadius: 10,
              padding: "8px 14px",
              background: "#ffffff",
              color: "#3a5068",
              border: "1px solid #c8d8e8",
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
            border: "1.5px solid #c8d8e8",
            borderRadius: 14,
            padding: 20,
            boxSizing: "border-box",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#000b21" }}>Saved Proofs</h2>
            <span style={{ opacity: 0.75, fontSize: 13 }}>
              {filtered.length}{filtered.length !== savedProofs.length ? ` of ${savedProofs.length}` : ""} proof{savedProofs.length === 1 ? "" : "s"}
            </span>
          </div>

          {proofsFeedback && (
            <div
              className="feedback-enter"
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: proofsFeedback.ok ? "#e8f0f8" : "#fee2e2",
                border: proofsFeedback.ok ? "1px solid #4ca2b5" : "1px solid #fca5a5",
                color: proofsFeedback.ok ? "#4ca2b5" : "#991b1b",
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
                  className="proof-card"
                  style={{
                    background: "#ffffff",
                    border: "1.5px solid #c8d8e8",
                    borderRadius: 12,
                    padding: 16,
                    display: "grid",
                    gap: 8,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
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
                            className="nd-input"
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
                              border: "1px solid #4ca2b5",
                              outline: "none",
                              background: "#f5f8fc",
                              color: "#000b21",
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
                              background: "#4ca2b5",
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
                              border: "1px solid #c8d8e8",
                              borderRadius: 6,
                              color: "#3a5068",
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
                              color: "#3a5068",
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
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: proof.is_complete ? "#e0f4f7" : "#f5f8fc",
                        color: proof.is_complete ? "#2a8a9f" : "#3a5068",
                        border: proof.is_complete ? "1.5px solid #4ca2b5" : "1.5px solid #c8d8e8",
                        flexShrink: 0,
                        letterSpacing: "0.02em",
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

                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      onClick={() => openSavedProof(proof.id)}
                      className="nd-btn-primary"
                      style={{
                        borderRadius: 10,
                        padding: "10px 14px",
                        background: "#4ca2b5",
                        color: "#ffffff",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Open
                    </button>

                    <button
                      onClick={() => setDeleteConfirmProof(proof)}
                      className="nd-btn-secondary"
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

                    <ExportButton
                      proofData={{
                        title: proof.title || null,
                        premises: proof.premises || [],
                        conclusion: proof.conclusion || "",
                        lines: proof.lines || [],
                        is_complete: proof.is_complete || false,
                      }}
                      goalTreeElementId={null}
                      onExport={() => onShowToast?.("success", "Proof exported", "Proof opened for printing/download.")}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Delete confirmation modal */}
    {deleteConfirmProof && (
      <div
        onClick={() => setDeleteConfirmProof(null)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "modalBackdropIn 0.2s ease-in-out both",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#f5f8fc",
            borderRadius: 16,
            padding: "28px 32px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            maxWidth: 400,
            width: "calc(100% - 40px)",
            boxSizing: "border-box",
            animation: "modalPanelIn 0.2s ease-in-out both",
          }}
        >
          <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700, color: "#000b21" }}>
            Delete this proof?
          </h2>
          <p style={{ margin: "0 0 4px 0", fontSize: 14, color: "#3a5068", lineHeight: 1.6 }}>
            <strong>{deleteConfirmProof.title || `Proof of ${deleteConfirmProof.conclusion}`}</strong> will be permanently deleted.
          </p>
          <p style={{ margin: "0 0 24px 0", fontSize: 13, color: "#6b8aaa" }}>
            This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => setDeleteConfirmProof(null)}
              style={{
                padding: "9px 20px",
                borderRadius: 10,
                border: "1px solid #c8d8e8",
                background: "transparent",
                color: "#3a5068",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                deleteSavedProof(deleteConfirmProof.id);
                setDeleteConfirmProof(null);
              }}
              style={{
                padding: "9px 20px",
                borderRadius: 10,
                border: "none",
                background: "#ef4444",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
