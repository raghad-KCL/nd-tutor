import { useState } from "react";
import { getProblemType, PROBLEM_TYPE_TOOLTIPS } from "../utils";

/**
 * Displays the inferred problem type (e.g. "Theorem", "Derivation") with
 * a hover tooltip explaining the category.
 *
 * @param {Object}  props
 * @param {Array}   props.premises - List of premise formula strings.
 * @param {boolean} [props.dark=false] - Use light text colour for dark backgrounds.
 */
export default function ProblemTypeLabel({ premises, dark = false }) {
  const [hovered, setHovered] = useState(false);
  const type = getProblemType(premises);

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      <span>
        <span style={{ fontWeight: 600, color: "#4ca2b5" }}>Problem type:</span>
        <span style={{ color: dark ? "#c8d8e8" : "#3a5068" }}> {type}</span>
      </span>
      <span
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor: "default",
          color: "#4ca2b5",
          fontSize: 13,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        ⓘ
      </span>
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            display: "block",
            width: 280,
            background: "#000b21",
            color: "#ffffff",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: "normal",
            wordBreak: "normal",
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          {PROBLEM_TYPE_TOOLTIPS[type]}
        </div>
      )}
    </div>
  );
}
