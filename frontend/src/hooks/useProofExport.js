import { getProblemType } from "../utils";

// ── Node dimensions ───────────────────────────────────────────────────────────
const NODE_W    = 190;
const NODE_H    = 72;
const H_LEVEL_W = NODE_W + 50;   // px per depth level  (left → right)
const H_ROW_H   = NODE_H + 18;   // px per leaf row     (top → bottom)
const PAD       = 32;

const RULE_MAP = {
  AND_I:"∧I", AND_E1:"∧E₁", AND_E2:"∧E₂",
  OR_I1:"∨I₁", OR_I2:"∨I₂", OR_E:"∨E",
  IMP_I:"→I",  IMP_E:"→E",
  NEG_I:"¬I",  NEG_E:"¬E",
  IFF_I:"↔I",  IFF_E:"↔E",
  REIT:"Reit", ASSUME:"Assume", PREMISE:"Premise",
};
function fmtRule(r) { return RULE_MAP[r] || r || ""; }
function clip(text, max = 21) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "..." : text;
}

// ── Build goal tree (same logic as GoalTree.jsx) ──────────────────────────────
function buildGoalTree(lines, conclusion, openBoxes) {
  const allLines = lines || [];
  const ct = (conclusion || "").trim();
  const openByLineNo = {};
  for (const box of (openBoxes || [])) openByLineNo[box.assumptionLineNo] = box;

  const sgMap = {};
  allLines.forEach((ln, i) => {
    if (ln.kind !== "assumption") return;
    const sp = ln.scopePath || [];
    if (sp.length === 0) return;
    const lineNo = i + 1;
    const ob     = openByLineNo[lineNo];
    const assm   = (ob?.assumptionFormula || ln.formula || "").trim();
    const goal   = ((ob?.goalFormula ?? ln.boxGoal) || "").trim();
    const rule   = ln.boxRule || ob?.kind || "IMP_I";
    const key    = sp.join(",");

    const directSteps = allLines
      .map((l, j) => ({ l, no: j + 1 }))
      .filter(({ l }) => {
        if (l.kind !== "derived") return false;
        const lsp = l.scopePath || [];
        return lsp.length === sp.length && lsp.every((v, k) => v === sp[k]);
      })
      .sort((a, b) => a.no - b.no);

    const proved = goal !== "" && directSteps.some(({ l }) => (l.formula || "").trim() === goal);

    sgMap[key] = {
      id: `sg-${key}`, type: "subgoal",
      label: goal ? `${assm} -> ${goal}` : assm,
      sub:   goal ? `assume ${assm}, show ${goal}` : `assume ${assm}`,
      rule, status: proved ? "proved" : "open",
      scopePath: sp, goal, directSteps, children: [],
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
        id: `step-${no}`, type: "step",
        label: l.formula || "", sub: fmtRule(l.rule),
        rule: l.rule, status: isGoal ? "proved" : "derived",
        lineNo: no, children: [],
      });
    }
  }

  const conclusionProved = ct !== "" && allLines.some(
    l => (l.scopePath || []).length === 0 && (l.formula || "").trim() === ct
  );

  const root = {
    id: "root", type: "goal",
    label: ct || "(no conclusion)",
    sub: conclusionProved ? "Proved" : "Not yet proved",
    status: conclusionProved ? "proved" : "open",
    children: [],
  };

  if (topRoots.length > 0) {
    const allProved = topRoots.every(r => r.status === "proved");
    root.children.push({
      id: "strategy", type: "strategy", label: "Strategy",
      sub: topRoots.length === 1
        ? `via ${fmtRule(topRoots[0].rule)}`
        : `via vE / -E -- ${topRoots.length} cases`,
      rule: topRoots[0].rule,
      status: allProved ? "proved" : "open",
      children: topRoots,
    });
  }

  const topSteps = allLines
    .map((l, j) => ({ l, no: j + 1 }))
    .filter(({ l }) => l.kind === "derived" && (l.scopePath || []).length === 0)
    .sort((a, b) => a.no - b.no);
  for (const { l, no } of topSteps) {
    root.children.push({
      id: `top-${no}`, type: "step",
      label: l.formula || "", sub: fmtRule(l.rule),
      rule: l.rule, status: (l.formula || "").trim() === ct ? "proved" : "derived",
      lineNo: no, children: [],
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

// ── Layout ────────────────────────────────────────────────────────────────────
// node.x = leaf counter (fractional for internal nodes)
// node.y = depth level
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

// Horizontal layout:
//   px = left edge of rect = PAD + depth * H_LEVEL_W
//   py = top  edge of rect = PAD + leafSlot * H_ROW_H
function applyPixelsHorizontal(node) {
  node.px = PAD + node.y * H_LEVEL_W;
  node.py = PAD + node.x * H_ROW_H;
  for (const c of node.children) applyPixelsHorizontal(c);
}

function collectAll(root) {
  const out = [];
  (function w(n) { out.push(n); n.children.forEach(w); })(root);
  return out;
}

// ── Colour palette ────────────────────────────────────────────────────────────
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

// ── Build SVG string ──────────────────────────────────────────────────────────
function buildHorizontalSVG(lines, conclusion, openBoxes) {
  const root = buildGoalTree(lines, conclusion, openBoxes);
  const ctr  = { val: 0 };
  assignPositions(root, 0, ctr);
  applyPixelsHorizontal(root);
  const allNodes = collectAll(root);

  const svgW = Math.max(400, Math.max(...allNodes.map(n => n.px + NODE_W)) + PAD);
  const svgH = Math.max(200, Math.max(...allNodes.map(n => n.py + NODE_H)) + PAD);

  // Bezier: parent right-centre --> child left-centre
  function bezier(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2;
    return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
  }

  let edgesSVG = "";
  for (const p of allNodes) {
    for (const c of p.children) {
      const x1 = p.px + NODE_W;            // parent right edge
      const y1 = p.py + NODE_H / 2;        // parent vertical centre
      const x2 = c.px;                     // child left edge
      const y2 = c.py + NODE_H / 2;        // child vertical centre
      const label = c.type === "subgoal" ? fmtRule(c.rule) : "";
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - 10;
      edgesSVG += `<path d="${bezier(x1,y1,x2,y2)}" fill="none" stroke="#b0c4d8" stroke-width="1.8"/>`;
      edgesSVG += `<polygon points="${x2},${y2-4} ${x2},${y2+4} ${x2+7},${y2}" fill="#b0c4d8"/>`;
      if (label) edgesSVG += `<text x="${mx}" y="${my}" font-size="10" font-weight="700" fill="#6b8aaa" text-anchor="middle">${label}</text>`;
    }
  }

  let nodesSVG = "";
  for (const node of allNodes) {
    const p   = palette(node.type, node.status);
    const tag = typeTag(node.type, node.rule);
    const rx  = node.px;                   // left edge
    const ry  = node.py;                   // top edge
    const cx  = rx + NODE_W / 2;           // horizontal centre

    nodesSVG += `<rect x="${rx}" y="${ry}" width="${NODE_W}" height="${NODE_H}" rx="10" ry="10" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.sw}"/>`;
    if (tag) nodesSVG += `<text x="${rx+9}" y="${ry+13}" font-size="8.5" font-weight="700" fill="${p.dim}" letter-spacing="0.5" text-anchor="start" dominant-baseline="middle">${tag}</text>`;
    if (node.type === "step" && node.lineNo != null) nodesSVG += `<text x="${rx+NODE_W-9}" y="${ry+13}" font-size="8.5" font-weight="700" fill="${p.dim}" text-anchor="end" dominant-baseline="middle">#${node.lineNo}</text>`;
    nodesSVG += `<text x="${cx}" y="${ry+35}" font-size="13" font-weight="700" fill="${p.ink}" text-anchor="middle" dominant-baseline="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${clip(node.label)}</text>`;
    if (node.sub) nodesSVG += `<text x="${cx}" y="${ry+55}" font-size="10" font-weight="500" fill="${p.dim}" text-anchor="middle" dominant-baseline="middle">${clip(node.sub, 29)}</text>`;
  }

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMinYMid meet" style="width:100%;height:auto;display:block;">${edgesSVG}${nodesSVG}</svg>`,
  };
}

// ── Public hook ───────────────────────────────────────────────────────────────
export function useProofExport() {
  const exportProof = (proofData) => {
    const {
      title,
      premises    = [],
      conclusion  = "",
      lines       = [],
      openBoxes   = [],
      is_complete = false,
    } = proofData;

    const { svg: goalTreeSVG } = buildHorizontalSVG(lines, conclusion, openBoxes);

    const rowsHTML = lines.map((line, i) => {
      const depth = Array.isArray(line.scopePath) ? line.scopePath.length : 0;
      const ruleLabel =
        line.kind === "premise"      ? "Premise"
        : line.kind === "assumption" ? "Assumption"
        : line.rule || line.kind || "";
      const refsStr =
        Array.isArray(line.refs) && line.refs.length > 0
          ? ` [${line.refs.map(r => Array.isArray(r) ? `${r[0]}-${r[1]}` : String(r)).join(", ")}]`
          : "";
      return `<tr><td class="num">${i+1}</td><td class="formula" style="padding-left:${depth*20}px">${line.formula||""}</td><td class="rule">${ruleLabel}${refsStr}</td></tr>`;
    }).join("\n");

    const taskStr       = premises.length > 0 ? `${premises.join(", ")} |- ${conclusion}` : `|- ${conclusion}`;
    const subproofCount = lines.filter(l => l.kind === "assumption").length;
    const rulesUsed     = [...new Set(lines.filter(l => l.kind !== "premise" && l.kind !== "assumption" && l.rule).map(l => l.rule))].join(", ") || "None";
    const maxDepth      = lines.reduce((max, l) => Math.max(max, Array.isArray(l.scopePath) ? l.scopePath.length : 0), 0);
    const premisesHTML  = premises.length > 0 ? premises.map(p => `<div>${p}</div>`).join("") : "None";
    const problemType   = getProblemType(premises);
    const docTitle      = title || "Natural Deduction Proof";
    const timestamp     = new Date().toLocaleString();

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${docTitle}</title>
  <style>
    body { font-family: Georgia, serif; margin: 40px; color: #111; }
    h1   { font-size: 22px; margin-bottom: 4px; }
    h2   { font-size: 15px; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .task { font-size: 14px; margin: 8px 0; }
    .summary-table { border-collapse: collapse; font-size: 13px; }
    .summary-table td { padding: 4px 16px 4px 0; vertical-align: top; }
    .summary-table td.label { font-weight: bold; color: #555; width: 160px; }
    .complete   { color: #1a7a3a; font-weight: bold; }
    .incomplete { color: #b36a00; font-weight: bold; }
    table.steps { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
    table.steps th { text-align: left; border-bottom: 2px solid #aaa; padding: 4px 8px; }
    table.steps td { padding: 3px 8px; vertical-align: top; }
    table.steps tr:nth-child(even) { background: #f9f9f9; }
    td.num  { color: #888; width: 30px; }
    td.rule { color: #444; width: 200px; }
    .page-break { page-break-after: always; }
    footer { margin-top: 40px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; }
    @media print {
      body { margin: 0; padding: 8mm; }
      @page { size: landscape; margin: 8mm; }
      .page-break { page-break-after: always; }
      .tree-page { page-break-before: always; }
      .tree-wrap svg { width: 100% !important; height: auto !important; }
    }
  </style>
</head>
<body>
  <h1>Natural Deduction Proof</h1>
  <p class="task"><strong>Task:</strong> ${taskStr}</p>

  <h2>Summary</h2>
  <table class="summary-table">
    <tr><td class="label">Status</td>      <td class="${is_complete?"complete":"incomplete"}">${is_complete?"&#10003; Complete":"&#9203; In Progress"}</td></tr>
    <tr><td class="label">Problem Type</td><td>${problemType}</td></tr>
    <tr><td class="label">Premises</td>    <td>${premisesHTML}</td></tr>
    <tr><td class="label">Conclusion</td>  <td>${conclusion}</td></tr>
    <tr><td class="label">Total Steps</td> <td>${lines.length}</td></tr>
    <tr><td class="label">Subproofs</td>   <td>${subproofCount}</td></tr>
    <tr><td class="label">Rules Used</td>  <td>${rulesUsed}</td></tr>
    <tr><td class="label">Max Depth</td>   <td>${maxDepth}</td></tr>
  </table>

  <h2>Proof Steps</h2>
  <table class="steps">
    <thead><tr><th>#</th><th>Formula</th><th>Justification</th></tr></thead>
    <tbody>
      ${lines.length > 0 ? rowsHTML : '<tr><td colspan="3" style="color:#888;font-style:italic">No proof steps yet.</td></tr>'}
    </tbody>
  </table>

  <div class="tree-page">
    <h2>Proof Goal Tree</h2>
    <div class="tree-wrap">
      ${goalTreeSVG}
    </div>
  </div>

  <footer>Exported ${timestamp}</footer>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onafterprint = () => printWindow.close();
  };

  return { exportProof };
}