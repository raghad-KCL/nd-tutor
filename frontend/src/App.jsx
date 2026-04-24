import { useAuth } from "./AuthContext";
import { useState } from "react";
import ndLogo from "./assets/ND-tutor-logo.svg";
import SavedProofsPage from "./pages/SavedProofsPage";
import RulesPage from "./pages/RulesPage";
import AuthModal from "./AuthModal";
import ExportButton from "./components/ExportButton";
import ProblemTypeLabel from "./components/ProblemTypeLabel";
import GoalTree from "./components/GoalTree";
import ProofWorkspace from "./components/ProofWorkspace";
import useWindowWidth from "./hooks/useWindowWidth";
import StepInputPanel from "./components/StepInputPanel";
import TaskInputPanel from "./components/TaskInputPanel";
import { useStickyBanner } from "./hooks/useStickyBanner";
import { premisesFromText } from "./utils";
import DeleteConfirmModal from "./components/DeleteConfirmModal";
import DeleteSubproofModal from "./components/DeleteSubproofModal";
import DiscardModal from "./components/DiscardModal";
import ToastContainer from "./components/ToastContainer";
import useToasts from "./hooks/useToasts";
import useProofState from "./hooks/useProofState";

// ── Page shell ─────────────────────────────────────────────────────────────
// Wraps every page with the shared outer flex container, sidebar, modals,
// and toast stack so each page branch only renders its own content div.

/**
 * Wraps every page with the shared outer flex container, sidebar,
 * modals (discard, delete-line, delete-subproof, auth), and toast
 * stack so each page branch only renders its own content div.
 *
 * @param {Object}        props
 * @param {boolean}       props.isMobile              - Mobile viewport flag.
 * @param {JSX.Element}   props.sidebar               - Sidebar navigation element.
 * @param {boolean}       props.showDiscardModal       - Whether the discard modal is open.
 * @param {Function}      props.confirmDiscard         - Callback to confirm discarding.
 * @param {Function}      props.setShowDiscardModal    - Setter for discard modal visibility.
 * @param {Object}        props.deleteConfirmState     - State for the delete-line modal.
 * @param {Function}      props.onConfirmDelete        - Confirm delete-line callback.
 * @param {Function}      props.onCancelDelete         - Cancel delete-line callback.
 * @param {Object}        props.deleteSubproofState    - State for the delete-subproof modal.
 * @param {Function}      props.onUndoClosure          - Undo subproof closure callback.
 * @param {Function}      props.onConfirmDeleteSubproof - Confirm full subproof deletion.
 * @param {Function}      props.onCancelDeleteSubproof  - Cancel subproof deletion.
 * @param {boolean}       props.showAuthModal          - Whether the auth modal is open.
 * @param {Function}      props.setShowAuthModal       - Setter for auth modal visibility.
 * @param {Array}         props.toasts                 - Active toast notifications.
 * @param {Function}      props.dismissToast           - Toast dismissal callback.
 * @param {JSX.Element}   props.children               - Page content.
 */
function PageShell({
  isMobile,
  sidebar,
  showDiscardModal,
  confirmDiscard,
  setShowDiscardModal,
  deleteConfirmState,
  onConfirmDelete,
  onCancelDelete,
  deleteSubproofState,
  onUndoClosure,
  onConfirmDeleteSubproof,
  onCancelDeleteSubproof,
  showAuthModal,
  setShowAuthModal,
  toasts,
  dismissToast,
  children,
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      height: isMobile ? undefined : "100vh",
      minHeight: "100vh",
      overflow: isMobile ? "auto" : "hidden",
      background: "#f5f8fc",
      color: "#000b21",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {sidebar}
      {children}
      {showDiscardModal && (
        <DiscardModal
          onConfirm={confirmDiscard}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}
      {deleteConfirmState?.show && (
        <DeleteConfirmModal
          affectedLineNos={deleteConfirmState.affectedLineNos}
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
        />
      )}
      {deleteSubproofState?.show && (
        <DeleteSubproofModal
          lineCount={deleteSubproofState.lineCount}
          onUndoClosure={onUndoClosure}
          onDeleteAll={onConfirmDeleteSubproof}
          onCancel={onCancelDeleteSubproof}
        />
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

/**
 * Root application component.
 *
 * Owns the top-level page router (create / workspace / savedProofs /
 * rules), the sidebar navigation, and wires together authentication,
 * toasts, and the central `useProofState` hook.
 */
export default function App() {

  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toasts, showToast, dismissToast } = useToasts();

  const proof = useProofState({ user, showToast, setShowAuthModal });

  // ── Window width (responsive layout) ─────────────────────────────────────
  const { isNarrow, isMobile } = useWindowWidth();

  // ── Sticky banner (New Proof page) ───────────────────────────────────────
  const { compact: createCompact, wrapperRef: createWrapperRef } = useStickyBanner();

  // ── Layout constants ──────────────────────────────────────────────────────
  const pagePad = "clamp(14px, 2.5vw, 28px)";

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebar = (
    <div
      style={{
        width: isMobile ? "100%" : 180,
        height: isMobile ? "auto" : "100vh",
        position: isMobile ? "relative" : "sticky",
        top: 0,
        flexShrink: 0,
        background: "#f5f8fc",
        borderRight: isMobile ? "none" : "1px solid #c8d8e8",
        borderBottom: isMobile ? "1px solid #c8d8e8" : "none",
        display: "flex",
        flexDirection: isMobile ? "row" : "column",
        alignItems: isMobile ? "center" : "stretch",
        padding: isMobile ? "8px 12px" : "20px 12px",
        boxSizing: "border-box",
        overflowY: isMobile ? "hidden" : "auto",
        overflowX: isMobile ? "auto" : "hidden",
        gap: isMobile ? 8 : 0,
        zIndex: 10,
      }}
    >
      <div style={{ marginBottom: isMobile ? 0 : 24, flexShrink: 0 }}>
        <img
          src={ndLogo}
          alt="Natural Deduction Tutor"
          style={{ width: isMobile ? 36 : "100%", height: "auto", display: "block" }}
        />
      </div>
      <nav style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 4, flex: isMobile ? 1 : undefined }}>
        <button
          onClick={() => proof.setPage("create")}
          style={{
            textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
            background: proof.page === "create" ? "#e8f0f8" : "transparent",
            color: proof.page === "create" ? "#4ca2b5" : "#3a5068",
            cursor: "pointer", fontWeight: proof.page === "create" ? 600 : 500, fontSize: 14,
            transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
          }}
        >
          New Proof
        </button>

        {proof.taskLocked && (
          <button
            className="current-proof-tab"
            onClick={() => proof.setPage("workspace")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
              background: proof.page === "workspace" ? "#e8f0f8" : "transparent",
              color: proof.page === "workspace" ? "#4ca2b5" : "#3a5068",
              cursor: "pointer", fontWeight: proof.page === "workspace" ? 600 : 500, fontSize: 14,
              transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
            }}
          >
            Current Proof
            <span
              className="discard-btn"
              title="Discard proof"
              onClick={(e) => { e.stopPropagation(); proof.discardProof(); }}
            >
              ×
            </span>
          </button>
        )}

        <button
          onClick={() => proof.setPage("savedProofs")}
          style={{
            textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
            background: proof.page === "savedProofs" ? "#e8f0f8" : "transparent",
            color: proof.page === "savedProofs" ? "#4ca2b5" : "#3a5068",
            cursor: "pointer", fontWeight: proof.page === "savedProofs" ? 600 : 500, fontSize: 14,
            transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
          }}
        >
          Saved Proofs
        </button>

        <button
          onClick={() => proof.setPage("rules")}
          style={{
            textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none",
            background: proof.page === "rules" ? "#e8f0f8" : "transparent",
            color: proof.page === "rules" ? "#4ca2b5" : "#3a5068",
            cursor: "pointer", fontWeight: proof.page === "rules" ? 600 : 500, fontSize: 14,
            transition: "background-color 0.18s ease-in-out, color 0.18s ease-in-out",
          }}
        >
          Rules
        </button>
      </nav>

      <div style={{
        marginTop: isMobile ? 0 : "auto",
        paddingTop: isMobile ? 0 : 16,
        borderTop: isMobile ? "none" : "1px solid #c8d8e8",
        marginLeft: isMobile ? "auto" : 0,
        flexShrink: 0,
      }}>
        {user ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#3a5068", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user}
            </span>
            <button
              onClick={logout}
              style={{
                textAlign: "left", padding: "7px 10px", borderRadius: 8,
                border: "1px solid #c8d8e8", background: "transparent",
                color: "#3a5068", cursor: "pointer", fontWeight: 500, fontSize: 13,
              }}
            >
              Log out
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            style={{
              width: "100%", textAlign: "center", padding: "8px 10px", borderRadius: 8,
              border: "none", background: "#4ca2b5", color: "#ffffff",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}
          >
            Log in / Sign up
          </button>
        )}
      </div>
    </div>
  );

  // Props shared by every PageShell call
  const shellProps = {
    isMobile,
    sidebar,
    showDiscardModal: proof.showDiscardModal,
    confirmDiscard: proof.confirmDiscard,
    setShowDiscardModal: proof.setShowDiscardModal,
    deleteConfirmState: proof.deleteConfirmState,
    onConfirmDelete: () => proof.doDeleteLine(proof.deleteConfirmState.lineIndex),
    onCancelDelete: () => proof.setDeleteConfirmState({ show: false, lineIndex: null, affectedLineNos: [] }),
    deleteSubproofState: proof.deleteSubproofState,
    onUndoClosure: () => proof.doUndoClosure(proof.deleteSubproofState.impILineIndex),
    onConfirmDeleteSubproof: () => proof.doDeleteSubproof(proof.deleteSubproofState.assumptionLineIndex),
    onCancelDeleteSubproof: () => proof.setDeleteSubproofState({ show: false, assumptionLineIndex: null, impILineIndex: null, lineCount: 0 }),
    showAuthModal,
    setShowAuthModal,
    toasts,
    dismissToast,
  };

  // ── Create page ───────────────────────────────────────────────────────────
  if (proof.page === "create") {
    return (
      <PageShell {...shellProps}>
        <div className="page-content-enter" style={{ flex: 1, height: isMobile ? "auto" : "100vh", overflowY: "auto", overflowX: "hidden", overflowAnchor: "none", padding: 0, boxSizing: "border-box" }}>
          <div className={`rules-banner${createCompact ? " compact" : ""}`}>
            <div style={{ maxWidth: 980, margin: "0 auto" }}>
              <div className="rules-banner-eyebrow">Natural Deduction</div>
              <h1 className="rules-banner-title">New Proof</h1>
              <p className="rules-banner-subtitle">Enter premises and a conclusion, then start the proof.</p>
            </div>
          </div>
          <div ref={createWrapperRef} style={{ minHeight: "100vh", boxSizing: "border-box" }}>
            <div style={{ padding: pagePad, boxSizing: "border-box" }}>
              <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
                <TaskInputPanel
                  formPremisesText={proof.formPremisesText}
                  formConclusion={proof.formConclusion}
                  randomDifficulty={proof.randomDifficulty}
                  loading={proof.loading}
                  taskError={proof.taskError}
                  isNarrow={isNarrow}
                  onChangePremisesText={proof.onChangePremisesText}
                  onSetFormConclusion={proof.setFormConclusion}
                  onSetRandomDifficulty={proof.setRandomDifficulty}
                  onStartProof={proof.startProof}
                  onReset={() => { proof.onChangePremisesText(""); proof.setFormConclusion(""); }}
                  onLoadRandomTask={proof.loadRandomTask}
                  onDismissError={() => proof.setTaskError("")}
                  onFocus={proof.setActive}
                  onInsertToken={proof.insertToken}
                />
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Rules page ────────────────────────────────────────────────────────────
  if (proof.page === "rules") {
    return (
      <PageShell {...shellProps}>
        <div className="page-content-enter" style={{ flex: 1, height: isMobile ? "auto" : "100vh", overflowY: "auto", overflowX: "hidden", overflowAnchor: "none" }}>
          <RulesPage />
        </div>
      </PageShell>
    );
  }

  // ── Saved Proofs page ─────────────────────────────────────────────────────
  if (proof.page === "savedProofs") {
    return (
      <PageShell {...shellProps}>
        <div className="page-content-enter" style={{ flex: 1, height: isMobile ? "auto" : "100vh", overflowY: "auto", overflowX: "hidden", overflowAnchor: "none" }}>
          <SavedProofsPage
            onBackToWorkspace={() => proof.setPage("workspace")}
            onOpenProof={proof.handleOpenSavedProof}
            hideBackButton={true}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onShowToast={showToast}
          />
        </div>
      </PageShell>
    );
  }

  // ── Workspace page ────────────────────────────────────────────────────────
  return (
    <PageShell {...shellProps}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: isMobile ? "auto" : "100vh", overflow: "hidden" }}>

        {/* Task header strip — always visible, never scrolls */}
        <div style={{ padding: `${pagePad} ${pagePad} 0`, boxSizing: "border-box", flexShrink: 0 }}>
          <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap",
            background: "#e8f0f8", borderBottom: "1px solid #c8d8e8",
            borderRadius: 14, padding: "12px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <button
              onClick={proof.resetProofToPremises}
              style={{ borderRadius: 8, padding: "4px 10px", background: "transparent", color: "#4ca2b5", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              ← Edit task
            </button>
            <div style={{ fontSize: 14, color: "#000b21", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", flex: 1 }}>
              Proving:{" "}
              {proof.premises.length > 0 ? proof.premises.join(", ") : "(no premises)"}
              {" "}⊢{" "}
              {proof.conclusion.trim() || "(no conclusion)"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <ProblemTypeLabel premises={proof.premises} />
              {proof.taskLocked && (
                <ExportButton
                  proofData={{
                    title: proof.savedTitle,
                    premises: premisesFromText(proof.premisesText),
                    conclusion: proof.conclusion,
                    lines: proof.lines,
                    is_complete: proof.checkedProofStatus?.complete ?? false,
                  }}
                  goalTreeElementId="proof-goal-tree"
                  size={18}
                  onExport={() => showToast("success", "Proof exported", "Proof opened for printing/download.")}
                />
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Workspace error zone — shown below Edit Task bar, cleared on next action */}
        {proof.workspaceError && (
          <div style={{ padding: `0 ${pagePad}`, flexShrink: 0, boxSizing: "border-box" }}>
            <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 12 }}>
              <div style={{
                padding: "10px 16px",
                borderRadius: 10,
                borderLeft: `4px solid ${
                  proof.workspaceError.type === "error"    ? "#ef4444"
                  : proof.workspaceError.type === "warning"  ? "#f59e0b"
                  : proof.workspaceError.type === "complete" ? "#22c55e"
                  : "#3b82f6"
                }`,
                background:
                  proof.workspaceError.type === "error"    ? "#fff1f2"
                  : proof.workspaceError.type === "warning"  ? "#fffbeb"
                  : proof.workspaceError.type === "complete" ? "#f0fdf4"
                  : "#eff6ff",
                color:
                  proof.workspaceError.type === "error"    ? "#991b1b"
                  : proof.workspaceError.type === "warning"  ? "#92400e"
                  : proof.workspaceError.type === "complete" ? "#166534"
                  : "#1d4ed8",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{proof.workspaceError.title}</div>
                  {proof.workspaceError.message && (
                    <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>{proof.workspaceError.message}</div>
                  )}
                </div>
                <button
                  onClick={() => proof.setWorkspaceError(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0, opacity: 0.6 }}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable panels area */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: `16px ${pagePad} ${pagePad}`, boxSizing: "border-box" }}>
          <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

          <div style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: 14,
            width: "100%",
            boxSizing: "border-box",
            alignItems: "start",
          }}>

            {/* ── Left panel: Proof Display ── */}
            <div style={{ background: "#ffffff", border: "1.5px solid #c8d8e8", borderRadius: 14, padding: 20, minWidth: 0, boxSizing: "border-box", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", order: isNarrow ? 2 : 1 }}>

              {/* Panel header with view toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#000b21" }}>Proof</h2>
                <span style={{ opacity: 0.75, fontSize: 12 }}>
                  {proof.taskLocked ? `${proof.lines.length} lines` : `${proof.displayedLines.length} lines (preview)`}
                </span>

                {/* Sequential / Tree toggle */}
                <div style={{ marginLeft: "auto", display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #c8d8e8", flexShrink: 0 }}>
                  {["sequential", "tree"].map((mode) => (
                    <button
                      key={mode}
                      className="view-toggle-btn"
                      onClick={() => proof.setProofViewMode(mode)}
                      style={{
                        padding: "4px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                        background: proof.proofViewMode === mode ? "#4ca2b5" : "transparent",
                        color: proof.proofViewMode === mode ? "#ffffff" : "#3a5068",
                      }}
                    >
                      {mode === "sequential" ? "Sequential" : "Tree"}
                    </button>
                  ))}
                </div>

                {proof.taskLocked && proof.proofViewMode === "sequential" && (
                  <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ opacity: 0.9, fontSize: 12 }}>
                      Goal:{" "}
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {proof.conclusion.trim() || "(none)"}
                      </span>
                    </span>
                    {proof.persistentConclusionBadge.show && (
                      <span style={{
                        display: "inline-block", padding: "4px 10px", borderRadius: 999,
                        fontSize: 12, fontWeight: 800, background: "#dcfce7",
                        color: "#166534", border: "1px solid #22c55e",
                      }}>
                        Conclusion derived on line {proof.persistentConclusionBadge.lineNo} ✅
                      </span>
                    )}
                  </div>
                )}
              </div>

              {proof.taskLocked && proof.proofViewMode === "sequential" && (
                <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
                  Current scope:{" "}
                  {proof.currentScopePath.length ? `[${proof.currentScopePath.join(", ")}]` : "top level"}
                </div>
              )}

              {proof.proofViewMode === "sequential" ? (
                <>
                  <ProofWorkspace
                    displayedLines={proof.displayedLines}
                    refsPreview={proof.refsPreview}
                    taskLocked={proof.taskLocked}
                    ruleLabelByValue={proof.ruleLabelByValue}
                    activeBox={proof.activeBox}
                    onRemoveLine={proof.removeLine}
                  />
                  {!proof.taskLocked && (
                    <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 10 }}>
                      Preview mode: these lines reflect your premises. Click <b>Start proof</b> to lock the task and begin.
                    </div>
                  )}
                  <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, display: "grid", gap: 4 }}>
                    <div>Lines can only be added via validated steps.</div>
                    {proof.taskLocked && <div>Use <b>Check Proof</b> to see the current global status of the proof.</div>}
                  </div>
                </>
              ) : (
                <div id="proof-goal-tree">
                  <GoalTree
                    lines={proof.lines}
                    openBoxes={proof.openBoxes}
                    conclusion={proof.conclusion}
                  />
                </div>
              )}
            </div>

            {/* ── Right panel: Input / Controls ── */}
            <div style={{
              display: "flex", flexDirection: "column", gap: 14, minWidth: 0, boxSizing: "border-box",
              order: isNarrow ? 1 : 2,
              ...(isNarrow ? {} : {
                position: "sticky",
                top: 0,
                maxHeight: "100vh",
                overflowY: "auto",
              }),
            }}>

              {/* Propose Step */}
              <div style={{ background: "#ffffff", border: "1.5px solid #c8d8e8", borderRadius: 14, padding: 20, minWidth: 0, boxSizing: "border-box", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <h2 style={{ margin: "0 0 10px 0", fontSize: 17, fontWeight: 700, color: "#000b21" }}>Propose Step</h2>
                <StepInputPanel
                  stepFormula={proof.stepFormula}
                  rule={proof.rule}
                  refsText={proof.refsText}
                  loading={proof.loading}
                  taskLocked={proof.taskLocked}
                  checkingProof={proof.checkingProof}
                  savingProof={proof.savingProof}
                  hasBrokenRefs={proof.hasBrokenRefs}
                  onSetStepFormula={proof.setStepFormula}
                  onSetRule={proof.setRule}
                  onSetRefsText={proof.setRefsText}
                  onFocus={proof.setActive}
                  onInsertToken={proof.insertToken}
                  onValidateAndAdd={proof.validateAndAdd}
                  onCheckProof={proof.checkProof}
                  onSaveProof={proof.saveProof}
                />
              </div>

            </div>

          </div>
        </div>
      </div>

      </div>
    </PageShell>
  );
}
