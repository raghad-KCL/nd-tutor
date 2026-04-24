import { useState } from "react";
import { useStickyBanner } from "../hooks/useStickyBanner";

const rules = [
  {
    category: "Conjunction",
    symbol: "∧",
    items: [
      {
        id: "AND_I",
        name: "∧ Introduction",
        abbr: "∧I",
        summary: "Combine two formulas into a conjunction.",
        schema: "A    B\n────────\n A ∧ B",
        refs: "Two lines: A, B",
      },
      {
        id: "AND_E1",
        name: "∧ Elimination 1",
        abbr: "∧E1",
        summary: "Extract the left conjunct from a conjunction.",
        schema: "A ∧ B\n─────\n  A",
        refs: "One line: A ∧ B",
      },
      {
        id: "AND_E2",
        name: "∧ Elimination 2",
        abbr: "∧E2",
        summary: "Extract the right conjunct from a conjunction.",
        schema: "A ∧ B\n─────\n  B",
        refs: "One line: A ∧ B",
      },
    ],
  },
  {
    category: "Disjunction",
    symbol: "∨",
    items: [
      {
        id: "OR_I1",
        name: "∨ Introduction 1",
        abbr: "∨I1",
        summary: "Introduce a disjunction from the left disjunct.",
        schema: "  A\n─────\nA ∨ B",
        refs: "One line: A",
      },
      {
        id: "OR_I2",
        name: "∨ Introduction 2",
        abbr: "∨I2",
        summary: "Introduce a disjunction from the right disjunct.",
        schema: "  B\n─────\nA ∨ B",
        refs: "One line: B",
      },
      {
        id: "OR_E",
        name: "∨ Elimination",
        abbr: "∨E",
        summary: "Derive C from a disjunction by cases: if A→C and B→C.",
        schema: "A → C    B → C    A ∨ B\n────────────────────────\n          C",
        refs: "Three lines: A → C, B → C, A ∨ B",
      },
    ],
  },
  {
    category: "Implication",
    symbol: "→",
    items: [
      {
        id: "IMP_E",
        name: "→ Elimination",
        abbr: "→E  (MP)",
        summary: "Modus Ponens: from A and A → B, derive B.",
        schema: "A    A → B\n──────────\n    B",
        refs: "Two lines: A, A → B",
      },
      {
        id: "IMP_I",
        name: "→ Introduction",
        abbr: "→I",
        summary: "Open a subproof assuming A, derive B, then conclude A → B.",
        schema: "┌ A  [assumption]\n│ ⋮\n│ B\n└──────────\n  A → B",
        refs: "Subproof: assumption line + last line inside it",
      },
    ],
  },
  {
    category: "Negation",
    symbol: "¬",
    items: [
      {
        id: "NEG_I",
        name: "¬ Introduction",
        abbr: "¬I",
        summary: "If assuming A leads to both B and ¬B, conclude ¬A.",
        schema: "A → B    A → ¬B\n────────────────\n      ¬A",
        refs: "Two lines: A → B, A → ¬B",
      },
      {
        id: "NEG_E",
        name: "¬ Elimination",
        abbr: "¬E",
        summary: "If assuming ¬A leads to both B and ¬B, conclude A.",
        schema: "¬A → B    ¬A → ¬B\n──────────────────\n        A",
        refs: "Two lines: ¬A → B, ¬A → ¬B",
      },
    ],
  },
  {
    category: "Reiteration",
    symbol: "≡",
    items: [
      {
        id: "Reit",
        name: "Reiteration",
        abbr: "Reit",
        summary: "Repeat a formula from an outer scope into the current subproof scope.",
        schema: "  A        (outer scope)\n──────────────────────\n  A        (current scope)",
        refs: "One line: A (must be accessible from current scope)",
      },
    ],
  },
  {
    category: "Equivalence",
    symbol: "↔",
    items: [
      {
        id: "IFF_I",
        name: "↔ Introduction",
        abbr: "↔I",
        summary: "From A → B and B → A, conclude A ↔ B.",
        schema: "A → B    B → A\n───────────────\n    A ↔ B",
        refs: "Two lines: A → B, B → A",
      },
      {
        id: "IFF_E",
        name: "↔ Elimination",
        abbr: "↔E",
        summary: "From A ↔ B, extract the conjunction of both implications.",
        schema: "    A ↔ B\n─────────────────────\n(A → B) ∧ (B → A)",
        refs: "One line: A ↔ B",
      },
    ],
  },
];

const categoryColors = {
  "Conjunction": { bg: "#e8f4e8", border: "#4a9e4a", accent: "#2d7a2d", tag: "#d4edd4" },
  "Disjunction": { bg: "#e8eef8", border: "#4a6eb5", accent: "#2d4f99", tag: "#d4dff0" },
  "Implication": { bg: "#f5edf8", border: "#8a5ab5", accent: "#6a3a99", tag: "#ecdff5" },
  "Negation":    { bg: "#fdf0e8", border: "#c07030", accent: "#9a5010", tag: "#f5dfc8" },
  "Equivalence": { bg: "#f8f0e8", border: "#b09040", accent: "#8a6a10", tag: "#f0e4c8" },
  "Reiteration": { bg: "#f0f5f5", border: "#508080", accent: "#2a6060", tag: "#daeaea" },
};

/**
 * Expandable card for a single inference rule, showing its abbreviation,
 * name, summary, schematic form, and reference requirements.
 *
 * @param {Object} props
 * @param {Object} props.rule   - Rule descriptor with `id`, `name`, `abbr`,
 *   `summary`, `schema`, and `refs`.
 * @param {Object} props.colors - Category colour palette.
 */
function RuleCard({ rule, colors }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "#ffffff",
        border: `1.5px solid ${colors.border}`,
        borderRadius: "10px",
        overflow: "hidden",
        transition: "box-shadow 0.18s",
        boxShadow: expanded ? `0 4px 18px ${colors.border}33` : "0 1px 4px #0001",
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          background: expanded ? colors.bg : "#ffffff",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            background: colors.tag,
            color: colors.accent,
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: "13px",
            padding: "3px 10px",
            borderRadius: "5px",
            minWidth: "52px",
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        >
          {rule.abbr}
        </span>
        <span style={{ fontWeight: 600, fontSize: "15px", color: "#000b21", flex: 1 }}>
          {rule.name}
        </span>
        <span style={{ color: colors.accent, fontSize: "18px", lineHeight: 1 }}>
          {expanded ? "−" : "+"}
        </span>
      </button>

      {/* Summary always visible */}
      <div style={{ padding: "0 16px 12px 16px", borderTop: expanded ? `1px solid ${colors.border}44` : "none" }}>
        {!expanded && (
          <p style={{ margin: "8px 0 0", color: "#3a5068", fontSize: "14px" }}>{rule.summary}</p>
        )}

        {expanded && (
          <div className="rule-card-content-enter" style={{ paddingTop: "12px" }}>
            <p style={{ margin: "0 0 12px", color: "#000b21", fontSize: "14px" }}>{rule.summary}</p>

            {/* Schema */}
            <div
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}66`,
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "10px",
              }}
            >
              <div style={{ fontSize: "11px", color: colors.accent, fontWeight: 700, marginBottom: "6px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Schematic Form
              </div>
              <pre
                style={{
                  margin: 0,
                  fontFamily: "'Courier New', monospace",
                  fontSize: "14px",
                  color: "#000b21",
                  whiteSpace: "pre",
                  lineHeight: 1.7,
                }}
              >
                {rule.schema}
              </pre>
            </div>

            {/* References hint */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: colors.accent, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", paddingTop: "1px", whiteSpace: "nowrap" }}>
                Refs:
              </span>
              <span style={{ fontSize: "13px", color: "#3a5068" }}>{rule.refs}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full-page reference of all supported propositional inference rules,
 * grouped by category with a search filter and collapsible sticky banner.
 */
export default function RulesPage() {
  const [search, setSearch] = useState("");
  const { compact, wrapperRef } = useStickyBanner();

  const filtered = rules
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (r) =>
          search === "" ||
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.abbr.toLowerCase().includes(search.toLowerCase()) ||
          r.summary.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((cat) => cat.items.length > 0);

  return (
    <div
      ref={wrapperRef}
      style={{
        minHeight: "100vh",
        background: "#f5f8fc",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        padding: "0 0 60px",
      }}
    >
      {/* Header */}
      <div className={`rules-banner${compact ? " compact" : ""}`}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="rules-banner-eyebrow">
            Natural Deduction
          </div>
          <h1 className="rules-banner-title">
            Inference Rules Reference
          </h1>
          <p className="rules-banner-subtitle">
            All supported propositional rules, click any rule to expand its schema.
          </p>

          {/* Search */}
          <input
            type="text"
            placeholder="Search rules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="banner-frosted-input"
            style={{
              width: "100%",
              maxWidth: "360px",
              padding: "9px 14px",
              borderRadius: "999px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Categories */}
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "28px 32px 0" }}>
        {filtered.length === 0 && (
          <p style={{ color: "#3a5068", textAlign: "center", paddingTop: "40px" }}>No rules match your search.</p>
        )}

        {filtered.map((cat) => {
          const colors = categoryColors[cat.category];
          return (
            <div key={cat.category} style={{ marginBottom: "32px" }}>
              {/* Category heading */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span
                  style={{
                    fontSize: "22px",
                    color: colors.accent,
                    fontFamily: "serif",
                    lineHeight: 1,
                  }}
                >
                  {cat.symbol}
                </span>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "17px",
                    fontWeight: 700,
                    color: "#000b21",
                    letterSpacing: "0.01em",
                  }}
                >
                  {cat.category}
                </h2>
                <div style={{ flex: 1, height: "1px", background: `${colors.border}55` }} />
                <span style={{ fontSize: "12px", color: "#3a5068" }}>
                  {cat.items.length} rule{cat.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {cat.items.map((rule) => (
                  <RuleCard key={rule.id} rule={rule} colors={colors} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Footer note */}
        <div
          style={{
            marginTop: "20px",
            padding: "14px 18px",
            background: "#ffffff",
            border: "1px solid #c8d8e8",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#3a5068",
          }}
        >
          <strong style={{ color: "#000b21" }}>Note:</strong> This system covers the Basic Natural Deduction rules for propositional logic only.
          Formulas are limited to at most 5 distinct variables and parse-tree depth of 5.
        </div>
      </div>
    </div>
  );
}