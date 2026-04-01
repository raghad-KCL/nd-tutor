from dataclasses import dataclass
from typing import Any, Dict, Optional, List

from .tokens import normalise_only
from .context import ProofContext
from .validate import parse_formula
from .parser import ParseError
from .ast import BinOp
from .printer import formula_to_string
from .rules import (
    RuleError,
    and_elim,
    and_intro,
    or_elim,
    or_intro,
    imp_elim,
    imp_intro,
    iff_elim,
    iff_intro,
    neg_elim,
    neg_intro,

)


@dataclass
class CheckProofResult:
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


@dataclass
class OpenSubproofResult:
    ok: bool
    type: Optional[str] = None
    message: str = ""
    normalised: str = ""
    assumption: str = ""
    goal: str = ""


def open_subproof_payload(body: Dict[str, Any]) -> OpenSubproofResult:
    formula_str = (body.get("formula") or "").strip()
    rule = (body.get("rule") or "").strip()

    if not formula_str:
        return OpenSubproofResult(
            ok=False,
            type="SYNTAX",
            message="No formula provided.",
        )

    if rule != "IMP_I":
        return OpenSubproofResult(
            ok=False,
            type="RULE",
            message="Only IMP_I subproof opening is supported.",
        )

    normalised = normalise_only(formula_str)

    try:
        ast = parse_formula(normalised)
    except (ValueError, ParseError) as e:
        return OpenSubproofResult(
            ok=False,
            type="SYNTAX",
            message=str(e),
            normalised=normalised,
        )

    if not isinstance(ast, BinOp) or ast.op != "→":
        return OpenSubproofResult(
            ok=False,
            type="RULE",
            message="IMP_I requires an implication formula A → B.",
            normalised=normalised,
        )

    assumption = formula_to_string(ast.left)
    goal = formula_to_string(ast.right)

    return OpenSubproofResult(
        ok=True,
        message="Opened →I subproof.",
        normalised=formula_to_string(ast),
        assumption=assumption,
        goal=goal,
    )

@dataclass
class ValidationResult:
    ok: bool
    type: Optional[str] = None  # "SYNTAX" or "RULE"
    message: str = ""
    normalised: str = ""


def validate_task_payload(body: Dict[str, Any]) -> Dict[str, Any]:
    proof = body.get("proofState") or {}
    premises = proof.get("premises") or []
    conclusion = (proof.get("conclusion") or "").strip()

    try:
        normalised_premises = []
        for p in premises:
            p_norm = normalise_only(p.strip())
            parse_formula(p_norm)   # syntax check
            normalised_premises.append(p_norm)

        conclusion_norm = normalise_only(conclusion)
        parse_formula(conclusion_norm)

        return {
            "ok": True,
            "premises": normalised_premises,
            "conclusion": conclusion_norm,
        }

    except (ValueError, ParseError) as e:
        return {
            "ok": False,
            "type": "SYNTAX",
            "message": str(e),
        }


def validate_step_payload(body: Dict[str, Any]) -> ValidationResult:
    proof = body.get("proofState") or {}
    step = body.get("proposedStep") or {}

    rule = step.get("rule")
    if not rule:
        # Keep JSON shape consistent on the frontend (normalised empty here)
        return ValidationResult(False, "RULE", "No rule provided.", normalised="")

    formula_str = (step.get("formula") or "").strip()
    normalised_step = normalise_only(formula_str)
    refs: List[int] = step.get("refs") or []
    current_scope_path = tuple(step.get("scopePath") or [])

    # Parse proposed formula (parse the normalised string)
    try:
        proposed_ast = parse_formula(normalised_step)
    except (ValueError, ParseError) as e:
        return ValidationResult(False, "SYNTAX", str(e), normalised=normalised_step)

    ctx = ProofContext.from_payload(proof.get("lines") or [])
    
     
    # ---- Rule dispatch ----
    try:
        
        # ASSUME opens a new scope
        if rule == "ASSUME":
            if refs:
                raise RuleError("ASSUME does not take references.")
            if proposed_ast is None:
                raise RuleError("ASSUME requires a formula.")
            # backend trusts frontend to add the new line with scopePath = current_scope_path + [new_line_no]
            return ValidationResult(True, message="Assumption accepted.", normalised=normalised_step)

        if rule in ("AND_E1", "AND_E2"):
            if len(refs) != 1:
                raise RuleError(f"{rule} requires exactly 1 referenced line.")
            ref_ast = ctx.get_line_ast(refs[0])
            expected = and_elim(ref_ast, 1 if rule == "AND_E1" else 2)
            if proposed_ast != expected:
                raise RuleError("Incorrect result for ∧-Elimination.")
            return ValidationResult(True, message="Step valid (∧-Elimination).", normalised=normalised_step)

        if rule == "AND_I":
            if len(refs) != 2:
                raise RuleError("AND_I requires exactly 2 referenced lines.")
            a_ast = ctx.get_line_ast(refs[0])
            b_ast = ctx.get_line_ast(refs[1])

            if not isinstance(proposed_ast, BinOp) or proposed_ast.op != "∧":
                raise RuleError("AND_I requires the proposed formula to be a conjunction (A ∧ B).")

            expected1 = and_intro(a_ast, b_ast)
            expected2 = and_intro(b_ast, a_ast)
            if proposed_ast != expected1 and proposed_ast != expected2:
                raise RuleError(
                    "Incorrect result for AND_I: must match the referenced lines (order doesn't matter)."
                )

            return ValidationResult(True, message="Step valid (∧-Introduction).", normalised=normalised_step)

        if rule == "OR_E":
            if len(refs) != 3:
                raise RuleError("OR_E requires exactly 3 referenced lines.")

            a1 = ctx.get_line_ast(refs[0])
            a2 = ctx.get_line_ast(refs[1])
            a3 = ctx.get_line_ast(refs[2])

            expected = or_elim(a1, a2, a3)

            if proposed_ast != expected:
                raise RuleError("Incorrect result for ∨-Elimination.")

            return ValidationResult(
                True,
                message="Step valid (∨-Elimination).",
                normalised=normalised_step,
            )
        
        if rule in ("OR_I1", "OR_I2"):
            if len(refs) != 1:
                raise RuleError(f"{rule} requires exactly 1 referenced line.")
            ref_ast = ctx.get_line_ast(refs[0])
            side = 1 if rule == "OR_I1" else 2
            or_intro(ref_ast, proposed_ast, side)
            return ValidationResult(True, message="Step valid (∨-Introduction).", normalised=normalised_step)

        if rule == "IMP_E":
            if len(refs) != 2:
                raise RuleError("IMP_E requires exactly 2 referenced lines.")
            a1 = ctx.get_line_ast(refs[0])
            a2 = ctx.get_line_ast(refs[1])
            expected = imp_elim(a1, a2)
            if proposed_ast != expected:
                raise RuleError("Incorrect result for →-Elimination (MP).")
            return ValidationResult(True, message="Step valid (→-Elimination / Modus Ponens).", normalised=normalised_step)

        if rule == "IMP_I":
            if len(refs) != 2:
                raise RuleError("IMP_I requires exactly 2 refs: [assumption_line, final_line].")

            assumption_no, final_no = refs
            assumption_line = ctx.get_line(assumption_no)
            final_line = ctx.get_line(final_no)

            if assumption_line.kind != "assumption":
                raise RuleError("First reference of IMP_I must be an assumption line.")

            # assumption scope must end with its own line number
            if not assumption_line.scope_path or assumption_line.scope_path[-1] != assumption_no:
                raise RuleError("Assumption line has invalid scopePath.")

            parent_scope = assumption_line.scope_path[:-1]

            # IMP_I result must be added OUTSIDE that subproof
            if current_scope_path != parent_scope:
                raise RuleError(
                    "IMP_I must be added in the parent scope of the discharged assumption."
                )

            # final line must be inside the subproof started by that assumption
            if final_line.scope_path[:len(assumption_line.scope_path)] != assumption_line.scope_path:
                raise RuleError(
                    "Second reference of IMP_I must be a line inside the discharged subproof."
                )

            if final_no <= assumption_no:
                raise RuleError("IMP_I requires the final line to occur after the assumption line.")

            assumption_ast = ctx.get_line_ast(assumption_no)
            final_ast = ctx.get_line_ast(final_no)
            expected = imp_intro(assumption_ast, final_ast)

            if proposed_ast != expected:
                raise RuleError("Incorrect result for →-Introduction.")

            return ValidationResult(True, message="Step valid (→-Introduction).", normalised=normalised_step)
        
        if rule == "IFF_E":
            if len(refs) != 1:
                raise RuleError("IFF_E requires exactly 1 referenced line.")

            ref_ast = ctx.get_line_ast(refs[0])
            expected = iff_elim(ref_ast)

            if proposed_ast != expected:
                raise RuleError("Incorrect result for ↔-Elimination.")

            return ValidationResult(
                True,
                message="Step valid (↔-Elimination).",
                normalised=normalised_step,
            )
        
        if rule == "IFF_I":
            if len(refs) != 2:
                raise RuleError("IFF_I requires exactly 2 referenced lines.")

            a1 = ctx.get_line_ast(refs[0])
            a2 = ctx.get_line_ast(refs[1])
            expected = iff_intro(a1, a2)

            if proposed_ast != expected:
                raise RuleError("Incorrect result for ↔-Introduction.")

            return ValidationResult(
                True,
                message="Step valid (↔-Introduction).",
                normalised=normalised_step,
            )
        
        if rule == "NEG_E":
            if len(refs) != 2:
                raise RuleError("NEG_E requires exactly 2 referenced lines.")

            a1 = ctx.get_line_ast(refs[0])
            a2 = ctx.get_line_ast(refs[1])
            expected = neg_elim(a1, a2)

            if proposed_ast != expected:
                raise RuleError("Incorrect result for ¬-Elimination.")

            return ValidationResult(
                True,
                message="Step valid (¬-Elimination).",
                normalised=normalised_step,
            )
        
        if rule == "NEG_I":
            if len(refs) != 2:
                raise RuleError("NEG_I requires exactly 2 referenced lines.")

            a1 = ctx.get_line_ast(refs[0])
            a2 = ctx.get_line_ast(refs[1])
            expected = neg_intro(a1, a2)

            if proposed_ast != expected:
                raise RuleError("Incorrect result for ¬-Introduction.")

            return ValidationResult(
                True,
                message="Step valid (¬-Introduction).",
                normalised=normalised_step,
            )

        raise RuleError(f"Rule '{rule}' not implemented yet.")

    except RuleError as e:
        # Return normalised input even on rule errors (useful for UI display)
        return ValidationResult(False, "RULE", str(e), normalised=normalised_step)


