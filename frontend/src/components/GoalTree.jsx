import { useRef, useState } from "react";
import { samePath } from "../utils";

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W     = 190;           // node rect width  (px)
const NODE_H     = 72;            // node rect height (px)
const H_SLOT     = NODE_W + 44;   // px per leaf slot  (NODE_W + gap)
const LEVEL_H    = NODE_H + 80;   // px per depth level
const PAD_X      = 36;
const PAD_Y      = 28;
const PAD_BOTTOM = 44;

// ── Rule labels ───────────────────────────────────────────────────────────────
const RULE_MAP = {
  AND_I:"∧I", AND_E1:"∧E₁", AND_E2:"∧E₂",
  OR_I1:"∨I₁", OR_I2:"∨I₂", OR_E:"∨E",
  IMP_I:"→I",  IMP_E:"→E",
  NEG_I:"¬I",  NEG_E:"¬E",
  IFF_I:"↔I",  IFF_E:"↔E",
  REIT:"Reit", ASSUME:"Assume", PREMISE:"Premise",
};
function fmtRule(r) { return RULE_MAP[r] || r || ""; }

// ── Step 1 — buildGoalTree ────────────────────────────────────────────────────
function buildGoalTree(lines, conclusion, openBoxes) {
  const allLines = lines || [];
  const ct = (conclusion || "").trim();

  const openByLineNo = {};
  for (const box of openBoxes || []) openByLineNo[box.assumptionLineNo] = box;

  const sgMap = {};
  allLines.forEach((ln, i) => {
    if (ln.kind !== "assumption") return;
    const sp = ln.scopePath || [];
    if (sp.length === 0) return;
    const lineNo = i + 1;
    const ob     = openByLineNo[lineNo];

    const assm = (ob?.assumptionFormula || ln.formula || "").trim();
    const goal = ((ob?.goalFormula ?? ln.boxGoal) || "").trim();
    const rule = ln.boxRule || ob?.kind || "IMP_I";
    const key  = sp.join(",");

    const directSteps = allLines
      .map((l, j) => ({ l, no: j + 1 }))
      .filter(({ l }) => l.kind === "derived" && samePath(l.scopePath || [], sp))
      .sort((a, b) => a.no - b.no);

    const proved = goal !== "" &&
      directSteps.some(({ l }) => (l.formula || "").trim() === goal);

    sgMap[key] = {
      id:         `sg-${key}`,
      type:       "subgoal",
      label:      goal ? `${assm} → ${goal}` : assm,
      sub:        goal
                    ? `assume ${assm}, show ${goal}`
                    : `assume ${assm}`,
      rule,
      status:     proved ? "proved" : "open",
      scopePath:  sp,
      goal,
      directSteps,
      children:   [],
    };
  });

  const topRoots = [];
  const sorted = Object.values(sgMap).sort(
    (a, b) => a.scopePath.length - b.scopePath.length
           || (a.scopePath.at(-1) ?? 0) - (b.scopePath.at(-1) ?? 0)
  );
  for (const node of sorted) {
    const pk = node.scopePath.slice(0, -1).join(",");
    if (pk && sgMap[pk]) sgMap[pk].children.push(node);
    else topRoots.push(node);
  }

  for (const node of Object.values(sgMap)) {
    if (node.children.length > 0) continue;
    for (const { l, no } of node.directSteps) {
      const isGoal = node.goal !== "" && (l.formula || "").trim() === node.goal;
      node.children.push({
        id:     `step-${no}`,
        type:   "step",
        label:  l.formula || "",
        sub:    fmtRule(l.rule),
        rule:   l.rule,
        status: isGoal ? "proved" : "derived",
        lineNo: no,
        children: [],
      });
    }
  }

  const conclusionProved = ct !== "" && allLines.some(
    l => (l.scopePath || []).length === 0 && (l.formula || "").trim() === ct
  );

  const root = {
    id:     "root",
    type:   "goal",
    label:  ct || "(no conclusion)",
    sub:    conclusionProved ? "✓ Proved" : "Not yet proved",
    status: conclusionProved ? "proved" : "open",
    children: [],
  };

  if (topRoots.length > 0) {
    const allProved = topRoots.every(r => r.status === "proved");
    const stratSub  = topRoots.length === 1
      ? `via ${fmtRule(topRoots[0].rule)}`
      : `via ∨E / ¬E — ${topRoots.length} cases`;

    root.children.push({
      id:       "strategy",
      type:     "strategy",
      label:    "Strategy",
      sub:      stratSub,
      rule:     topRoots[0].rule,
      status:   allProved ? "proved" : "open",
      children: topRoots,
    });
  }

  const topSteps = allLines
    .map((l, j) => ({ l, no: j + 1 }))
    .filter(({ l }) => l.kind === "derived" && samePath(l.scopePath || [], []))
    .sort((a, b) => a.no - b.no);

  for (const { l, no } of topSteps) {
    root.children.push({
      id:     `top-${no}`,
      type:   "step",
      label:  l.formula || "",
      sub:    fmtRule(l.rule),
      rule:   l.rule,
      status: (l.formula || "").trim() === ct ? "proved" : "derived",
      lineNo: no,
      children: [],
    });
  }

  if (root.children.length === 0) {
    root.children.push({
      id: "hint", type: "hint",
      label: "Add a proof step", sub: "to see the tree grow",
      status: "open", children: [],
    });
  }

  return root;
}

// ── Step 2 — assignPositions ──────────────────────────────────────────────────
function assignPositions(node, depth, ctr) {
  if (node.children.length === 0) {
    node.x = ctr.val++;
    node.y = depth;
  } else {
    for (const c of node.children) assignPositions(c, depth + 1, ctr);
    node.x = (node.children[0].x + node.children[node.children.length - 1].x) / 2;
    node.y = depth;
  }
}

// ── Step 3 — scale to pixels ──────────────────────────────────────────────────
function applyPixels(node) {
  node.px = PAD_X + node.x * H_SLOT + NODE_W / 2;
  node.py = PAD_Y + node.y * LEVEL_H;
  for (const c of node.children) applyPixels(c);
}

// ── Step 4 — flatten tree ─────────────────────────────────────────────────────
function collectAll(root) {
  const out = [];
  (function w(n) { out.push(n); n.children.forEach(w); })(root);
  return out;
}

// ── Node colour palette ───────────────────────────────────────────────────────
function palette(type, status) {
  if (type === "goal")
    return status === "proved"
      ? { fill:"#e8faf8", stroke:"#0bc4b0", sw:2.5, ink:"#0f766e", dim:"#0bc4b0" }
      : { fill:"#f5f8fc", stroke:"#c8d8e8", sw:2,   ink:"#000b21", dim:"#6b8aaa" };
  if (type === "strategy")
    return { fill:"#eff6ff", stroke:"#3b82f6", sw:1.5, ink:"#1d4ed8", dim:"#3b82f6" };
  if (type === "subgoal")
    return status === "proved"
      ? { fill:"#e8faf8", stroke:"#0bc4b0", sw:2,   ink:"#0f766e", dim:"#0bc4b0" }
      : { fill:"#fffbeb", stroke:"#f59e0b", sw:2,   ink:"#92400e", dim:"#d97706" };
  if (type === "step")
    return status === "proved"
      ? { fill:"#e8faf8", stroke:"#0bc4b0", sw:1.5, ink:"#0f766e", dim:"#0bc4b0" }
      : { fill:"#e8eef8", stroke:"#5b7ea8", sw:1.5, ink:"#2c4a6e", dim:"#5b7ea8" };
  return { fill:"#f8fafc", stroke:"#c8d8e8", sw:1, ink:"#94a3b8", dim:"#b8c4ce" };
}

function typeTag(type, rule) {
  if (type === "goal")     return "GOAL";
  if (type === "strategy") return "STRATEGY";
  if (type === "subgoal")  return `${fmtRule(rule) || "SUB"}PROOF`.toUpperCase();
  if (type === "step")     return "STEP";
  return "";
}

function clip(text, max = 21) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
}

// ── SVG: connector paths ──────────────────────────────────────────────────────
function bezier(x1, y1, x2, y2) {
  const cy = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`;
}

function Connectors({ allNodes }) {
  const edges = [];
  for (const p of allNodes) {
    for (const c of p.children) {
      edges.push({
        key: `${p.id}→${c.id}`,
        x1: p.px,   y1: p.py + NODE_H,
        x2: c.px,   y2: c.py,
        label: c.type === "subgoal" ? fmtRule(c.rule) : "",
      });
    }
  }
  return (
    <>
      {edges.map(({ key, x1, y1, x2, y2, label }) => {
        const mx = (x1 + x2) / 2 + 5;
        const my = (y1 + y2) / 2;
        return (
          <g key={key}>
            <path
              d={bezier(x1, y1, x2, y2)}
              fill="none" stroke="#b0c4d8" strokeWidth="1.8"
            />
            <polygon
              points={`${x2 - 4},${y2 - 7} ${x2 + 4},${y2 - 7} ${x2},${y2}`}
              fill="#b0c4d8"
            />
            {label && (
              <text
                x={mx} y={my}
                fontSize="10" fontWeight="700" fill="#6b8aaa"
                dominantBaseline="middle" textAnchor="start"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// ── SVG: node cards ───────────────────────────────────────────────────────────
function NodeCard({ node }) {
  const p   = palette(node.type, node.status);
  const tag = typeTag(node.type, node.rule);
  const rx  = node.px - NODE_W / 2;
  const ry  = node.py;

  return (
    <g>
      <rect
        x={rx} y={ry} width={NODE_W} height={NODE_H}
        rx="10" ry="10"
        fill={p.fill} stroke={p.stroke} strokeWidth={p.sw}
      />
      {tag && (
        <text
          x={rx + 9} y={ry + 13}
          fontSize="8.5" fontWeight="700"
          fill={p.dim} letterSpacing="0.5"
          textAnchor="start" dominantBaseline="middle"
        >
          {tag}
        </text>
      )}
      {node.type === "step" && node.lineNo != null && (
        <text
          x={rx + NODE_W - 9} y={ry + 13}
          fontSize="8.5" fontWeight="700"
          fill={p.dim} textAnchor="end" dominantBaseline="middle"
        >
          #{node.lineNo}
        </text>
      )}
      <text
        x={node.px} y={ry + 35}
        fontSize="13" fontWeight="700" fill={p.ink}
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {clip(node.label)}
      </text>
      {node.sub && (
        <text
          x={node.px} y={ry + 55}
          fontSize="10" fontWeight="500" fill={p.dim}
          textAnchor="middle" dominantBaseline="middle"
        >
          {clip(node.sub, 29)}
        </text>
      )}
    </g>
  );
}

// ── Resize handle helper ──────────────────────────────────────────────────────
const HANDLE_SIZE = 8;
const CORNER_SIZE = 14;

const HANDLES = [
  { id: "n",  top: 0,    left: CORNER_SIZE, right: CORNER_SIZE, height: HANDLE_SIZE, cursor: "n-resize",  dx: 0, dy: -1, dw: 0,  dh: 1  },
  { id: "s",  bottom: 0, left: CORNER_SIZE, right: CORNER_SIZE, height: HANDLE_SIZE, cursor: "s-resize",  dx: 0, dy: 0,  dw: 0,  dh: 1  },
  { id: "e",  top: CORNER_SIZE, bottom: CORNER_SIZE, right: 0, width: HANDLE_SIZE,   cursor: "e-resize",  dx: 0, dy: 0,  dw: 1,  dh: 0  },
  { id: "w",  top: CORNER_SIZE, bottom: CORNER_SIZE, left: 0,  width: HANDLE_SIZE,   cursor: "w-resize",  dx: -1,dy: 0,  dw: 1,  dh: 0  },
  { id: "ne", top: 0,    right: 0,  width: CORNER_SIZE, height: CORNER_SIZE,         cursor: "ne-resize", dx: 0, dy: -1, dw: 1,  dh: 1  },
  { id: "nw", top: 0,    left: 0,   width: CORNER_SIZE, height: CORNER_SIZE,         cursor: "nw-resize", dx: -1,dy: -1, dw: 1,  dh: 1  },
  { id: "se", bottom: 0, right: 0,  width: CORNER_SIZE, height: CORNER_SIZE,         cursor: "se-resize", dx: 0, dy: 0,  dw: 1,  dh: 1  },
  { id: "sw", bottom: 0, left: 0,   width: CORNER_SIZE, height: CORNER_SIZE,         cursor: "sw-resize", dx: -1,dy: 0,  dw: 1,  dh: 1  },
];

function useResize(pos, setPos, size, setSize) {
  return (handle) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos  = { ...pos };
    const startSize = { ...size };
    const MIN_W = 300, MIN_H = 220;

    function onMove(ev) {
      const mx = ev.clientX - startX;
      const my = ev.clientY - startY;

      let newW = startSize.w, newH = startSize.h;
      let newX = startPos.x, newY = startPos.y;

      if (handle.dw) {
        newW = Math.max(MIN_W, startSize.w + mx * (handle.dx < 0 ? -1 : 1));
        if (handle.dx < 0) newX = startPos.x + startSize.w - newW;
      }
      if (handle.dh) {
        newH = Math.max(MIN_H, startSize.h + my * (handle.dy < 0 ? -1 : 1));
        if (handle.dy < 0) newY = startPos.y + startSize.h - newH;
      }

      setSize({ w: newW, h: newH });
      setPos({ x: newX, y: newY });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}

// ── Public component ──────────────────────────────────────────────────────────
const ZOOM_STEP = 0.15;
const ZOOM_MIN  = 0.3;
const ZOOM_MAX  = 2.0;

const LEGEND_ITEMS = [
  { color: "#0bc4b0", label: "Proved" },
  { color: "#f59e0b", label: "Open subproof" },
  { color: "#3b82f6", label: "Strategy" },
];

function Legend() {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: "8px 14px",
      padding: "6px 0 2px", marginBottom: 4,
    }}>
      {LEGEND_ITEMS.map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 12, height: 12, borderRadius: 3,
            border: `2px solid ${color}`, background: "#fff",
            display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#3a5068" }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ZoomControls({ zoom, zoomIn, zoomOut }) {
  const btnStyle = {
    width: 26, height: 26, borderRadius: "50%",
    border: "1px solid #c8d8e8", background: "#f5f8fc",
    color: "#4ca2b5", fontSize: 16, fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", lineHeight: 1, flexShrink: 0, padding: 0,
  };
  return (
    <>
      <button onClick={zoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out" style={{
        ...btnStyle,
        opacity: zoom <= ZOOM_MIN ? 0.4 : 1,
        cursor:  zoom <= ZOOM_MIN ? "not-allowed" : "pointer",
      }}>−</button>
      <span style={{
        fontSize: 11, fontWeight: 600, color: "#4ca2b5",
        minWidth: 34, textAlign: "center", userSelect: "none",
      }}>
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in" style={{
        ...btnStyle,
        opacity: zoom >= ZOOM_MAX ? 0.4 : 1,
        cursor:  zoom >= ZOOM_MAX ? "not-allowed" : "pointer",
      }}>+</button>
    </>
  );
}

export default function GoalTree({ lines, openBoxes, conclusion }) {
  const [popout, setPopout] = useState(false);
  const [pos,  setPos]  = useState({ x: 80, y: 80 });
  const [size, setSize] = useState({ w: 640, h: 460 });
  const [zoom, setZoom] = useState(1);
  const zoomIn  = () => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));

  const dragging   = useRef(false);
  const dragOffset = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const getResizeHandler = useResize(pos, setPos, size, setSize);

  const hasConclusion = !!(conclusion && conclusion.trim());
  const ct = (conclusion || "").trim();

  let svgW = 260, svgH = 200, allNodes = [];

  if (hasConclusion) {
    const root = buildGoalTree(lines || [], ct, openBoxes || []);
    const ctr  = { val: 0 };
    assignPositions(root, 0, ctr);
    applyPixels(root);
    allNodes = collectAll(root);
    const maxRight  = Math.max(...allNodes.map(n => n.px + NODE_W / 2));
    const maxBottom = Math.max(...allNodes.map(n => n.py + NODE_H));
    svgW = Math.max(260, maxRight  + PAD_X);
    svgH = Math.max(200, maxBottom + PAD_BOTTOM);
  }

  // ── Shared tree SVG content ───────────────────────────────────────────────
  const treeContent = !hasConclusion ? (
    <div style={{ color: "#3a5068", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
      Set a conclusion to see the goal tree.
    </div>
  ) : (
    <svg
      width={svgW * zoom}
      height={svgH * zoom}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ display: "block" }}
    >
      <Connectors allNodes={allNodes} />
      {allNodes.map(n => <NodeCard key={n.id} node={n} />)}
    </svg>
  );

  // ── Header drag handler ───────────────────────────────────────────────────
  function onHeaderMouseDown(e) {
    if (e.button !== 0) return;
    dragging.current = true;
    dragOffset.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };

    function onMove(ev) {
      if (!dragging.current) return;
      setPos({
        x: dragOffset.current.px + ev.clientX - dragOffset.current.mx,
        y: dragOffset.current.py + ev.clientY - dragOffset.current.my,
      });
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  }

  // ── Pop-out icon (expand/external link style) ─────────────────────────────
  const popOutIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M7 3H3C2.44772 3 2 3.44772 2 4V13C2 13.5523 2.44772 14 3 14H12C12.5523 14 13 13.5523 13 13V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );

  const popInIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 9V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M10 2H14V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 7L14 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );

  return (
    <>
      {/* ── Normal panel ── */}
      <div style={{
        background:    "#e8f0f8",
        borderRadius:  18,
        padding:       "16px 16px 20px",
        minWidth:      0,
        maxWidth:      "100%",
        boxSizing:     "border-box",
        boxShadow:     "0 2px 12px rgba(0,0,0,0.07)",
        display:       "flex",
        flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 12, flexShrink: 0, gap: 8,
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#000b21", flexShrink: 0 }}>
            Goal Tree
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {ZoomControls({ zoom, zoomIn, zoomOut })}
            <button
              onClick={() => setPopout(v => !v)}
              title={popout ? "Pop back in" : "Pop out into floating window"}
              style={{
                width: 30, height: 30, borderRadius: "50%",
                border: "1px solid #c8d8e8", background: popout ? "#d0eaf5" : "#f5f8fc",
                color: "#4ca2b5", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, padding: 0,
              }}
            >
              {popout ? popInIcon : popOutIcon}
            </button>
          </div>
        </div>

        {/* Colour legend + SVG canvas — hidden while popped out */}
        {!popout && (
          <>
            <Legend />
            <div style={{ overflowX: "auto", overflowY: "visible", maxWidth: "100%" }}>
              {treeContent}
            </div>
          </>
        )}

        {popout && (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#6b8aaa", fontSize: 13, fontStyle: "italic",
          }}>
            Goal Tree is open in a floating window.
          </div>
        )}
      </div>

      {/* ── Floating popup ── */}
      {popout && (
        <div
          style={{
            position:      "fixed",
            left:          pos.x,
            top:           pos.y,
            width:         size.w,
            height:        size.h,
            zIndex:        8000,
            background:    "#e8f0f8",
            borderRadius:  18,
            boxShadow:     "0 12px 48px rgba(0,0,0,0.26)",
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            minWidth:      300,
            minHeight:     220,
            userSelect:    "none",
          }}
        >
          {/* Resize handles */}
          {HANDLES.map(h => {
            const style = {
              position: "absolute",
              cursor:   h.cursor,
              zIndex:   1,
            };
            if (h.top    != null) style.top    = h.top;
            if (h.bottom != null) style.bottom = h.bottom;
            if (h.left   != null) style.left   = h.left;
            if (h.right  != null) style.right  = h.right;
            if (h.width  != null) style.width  = h.width;
            if (h.height != null) style.height = h.height;
            // edge handles stretch across full dimension
            if (h.id === "n" || h.id === "s") { style.left = CORNER_SIZE; style.right = CORNER_SIZE; style.height = HANDLE_SIZE; }
            if (h.id === "e" || h.id === "w") { style.top  = CORNER_SIZE; style.bottom = CORNER_SIZE; style.width  = HANDLE_SIZE; }
            return (
              <div
                key={h.id}
                style={style}
                onMouseDown={getResizeHandler(h)}
              />
            );
          })}

          {/* Draggable header */}
          <div
            onMouseDown={onHeaderMouseDown}
            style={{
              display:        "flex",
              justifyContent: "space-between",
              alignItems:     "center",
              padding:        "12px 16px",
              cursor:         "move",
              flexShrink:     0,
              borderBottom:   "1px solid #c8d8e8",
              background:     "#dce8f5",
              borderRadius:   "18px 18px 0 0",
              zIndex:         2,
              position:       "relative",
              gap:            8,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#000b21", flexShrink: 0 }}>
              Goal Tree
            </h2>
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              {ZoomControls({ zoom, zoomIn, zoomOut })}
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setPopout(false)}
                title="Close floating window"
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "1px solid #c8d8e8", background: "#f5f8fc",
                  color: "#3a5068", fontSize: 16, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", lineHeight: 1, flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Legend + scrollable tree content */}
          <div style={{ padding: "8px 16px 0", flexShrink: 0 }}>
            <Legend />
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "4px 16px 16px" }}>
            {treeContent}
          </div>
        </div>
      )}
    </>
  );
}
