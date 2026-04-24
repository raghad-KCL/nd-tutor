from dataclasses import dataclass
from typing import Any, Dict, Optional, List

from ..tokens import normalise_only
from ..validate import parse_formula
from ..ast import BinOp
from ..printer import formula_to_string


@dataclass
class CheckProofResult:
    """Result of checking whether a proof is complete.

    Attributes:
        ok: Whether the check itself ran without errors.
        complete: Whether the proof is finished (goal derived at top level).
        goal_reached_top_level: Whether the target conclusion appears at
            scope depth 0.
        goal_reached_somewhere: Whether the target conclusion appears
            anywhere in the proof, including inside subproofs.
        goal_line: 1-based line number of the first top-level match, or
            ``None`` if none exists.
        matching_lines: 1-based line numbers of every line whose formula
            matches the target conclusion.
        message: Human-readable summary of the check outcome.
        progress: List of progress observations for the student.
        hints: List of actionable hints to guide the student.
    """

    ok: bool
    complete: bool
    goal_reached_top_level: bool
    goal_reached_somewhere: bool
    goal_line: Optional[int] = None
    matching_lines: List[int] = None
    message: str = ""
    progress: List[str] = None
    hints: List[str] = None

def check_proof_payload(body: Dict[str, Any]) -> CheckProofResult:
    """Checks whether a natural-deduction proof has reached its target conclusion.

    Scans every proof line for a formula matching the target conclusion.
    If a match is found at the top-level scope the proof is marked complete;
    otherwise partial-progress feedback and hints are generated.

    Args:
        body: Request payload containing a ``proofState`` dict with keys
            ``conclusion`` (the target formula string) and ``lines`` (list
            of proof-line dicts).

    Returns:
        A ``CheckProofResult`` describing completeness, matching lines,
        progress observations, and hints.
    """
    proof = body.get("proofState") or {}
    conclusion = (proof.get("conclusion") or "").strip()
    lines = proof.get("lines") or []

    if not conclusion:
        return CheckProofResult(
            ok=False,
            complete=False,
            goal_reached_top_level=False,
            goal_reached_somewhere=False,
            goal_line=None,
            matching_lines=[],
            message="No target conclusion provided.",
            progress=[],
            hints=[],
        )

    conclusion_norm = normalise_only(conclusion)

    matching_lines: List[int] = []
    top_level_goal_line: Optional[int] = None

    for i, raw in enumerate(lines, start=1):
        formula = normalise_only((raw.get("formula") or "").strip())
        scope_path = tuple(raw.get("scopePath") or [])

        if formula == conclusion_norm:
            matching_lines.append(i)
            if scope_path == () and top_level_goal_line is None:
                top_level_goal_line = i

    progress: List[str] = []
    hints: List[str] = []

    if top_level_goal_line is not None:
        return CheckProofResult(
            ok=True,
            complete=True,
            goal_reached_top_level=True,
            goal_reached_somewhere=True,
            goal_line=top_level_goal_line,
            matching_lines=matching_lines,
            message=f"Proof complete. The target conclusion was derived at top level on line {top_level_goal_line}.",
            progress=[f"Top-level conclusion found on line {top_level_goal_line}."],
            hints=[],
        )

    if matching_lines:
        progress.append(
            f"The target conclusion appears in the proof on line(s): {', '.join(map(str, matching_lines))}."
        )
        hints.append(
            "A matching formula exists, but not at top level. Try discharging the relevant subproof or deriving it outside the box."
        )
        return CheckProofResult(
            ok=True,
            complete=False,
            goal_reached_top_level=False,
            goal_reached_somewhere=True,
            goal_line=None,
            matching_lines=matching_lines,
            message="The target conclusion has been derived, but only inside a subproof.",
            progress=progress,
            hints=hints,
        )

    # Very light partial-progress feedback for common 2-reference and 3-reference rules
    top_level_lines = []
    for i, raw in enumerate(lines, start=1):
        scope_path = tuple(raw.get("scopePath") or [])
        if scope_path == ():
            top_level_lines.append((i, normalise_only((raw.get("formula") or "").strip())))

    progress.append("No top-level line currently matches the target conclusion.")

    # Small heuristics for partial progress
    # Case 1: target is an equivalence A ↔ B, but maybe one implication exists
    try:
        target_ast = parse_formula(conclusion_norm)
        if isinstance(target_ast, BinOp) and target_ast.op == "↔":
            left_to_right = normalise_only(formula_to_string(BinOp("→", target_ast.left, target_ast.right)))
            right_to_left = normalise_only(formula_to_string(BinOp("→", target_ast.right, target_ast.left)))

            have_ltr = any(f == left_to_right for _, f in top_level_lines)
            have_rtl = any(f == right_to_left for _, f in top_level_lines)

            if have_ltr and not have_rtl:
                hints.append(
                    f"Partial progress: {left_to_right} is available, but {right_to_left} is still needed to conclude {conclusion_norm}."
                )
            elif have_rtl and not have_ltr:
                hints.append(
                    f"Partial progress: {right_to_left} is available, but {left_to_right} is still needed to conclude {conclusion_norm}."
                )

        # Case 2: target is atomic/other, look for one branch of ∨E
        for i, f in top_level_lines:
            try:
                ast = parse_formula(f)
            except Exception:
                continue

            if isinstance(ast, BinOp) and ast.op == "→":
                rhs = normalise_only(formula_to_string(ast.right))
                if rhs == conclusion_norm:
                    hints.append(
                        f"Partial progress: line {i} gives {f}. You may still need another matching implication or supporting line to derive {conclusion_norm}."
                    )
                    break

    except Exception:
        pass

    return CheckProofResult(
        ok=True,
        complete=False,
        goal_reached_top_level=False,
        goal_reached_somewhere=False,
        goal_line=None,
        matching_lines=[],
        message="The proof is still incomplete.",
        progress=progress,
        hints=hints,
    )
