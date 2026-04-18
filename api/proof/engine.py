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
    reiteration,
)


def _is_range(ref) -> bool:
    """True if ref is a two-element list/tuple of positive ints (a subproof range)."""
    return (
        isinstance(ref, (list, tuple))
        and len(ref) == 2
        and all(isinstance(x, int) and x > 0 for x in ref)
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
class CloseSubproofResult:
    ok: bool
    type: Optional[str] = None
    message: str = ""
    formula: str = ""
    refs: List[int] = None
    scope_path: List[int] = None


def close_subproof_payload(body: Dict[str, Any]) -> "CloseSubproofResult":
    """
    Validate →I conditions and generate the implication line for a closed subproof.

    Expects:
      - proofState.lines: current proof lines (the subproof's goal line already appended)
      - assumptionLineIndex: 0-based index of the assumption line
      - finalLineIndex: 0-based index of the line that reached the subproof goal
    """
    proof = body.get("proofState") or {}
    assumption_idx = body.get("assumptionLineIndex")
    final_idx = body.get("finalLineIndex")

    if assumption_idx is None or final_idx is None:
        return CloseSubproofResult(
            ok=False, type="RULE",
            message="assumptionLineIndex and finalLineIndex are required.",
        )

    lines_raw = proof.get("lines") or []
    if not lines_raw:
        return CloseSubproofResult(ok=False, type="RULE", message="Proof has no lines.")

    ctx = ProofContext.from_payload(lines_raw)

    assumption_no = assumption_idx + 1  # convert to 1-based
    final_no = final_idx + 1

    try:
        assumption_line = ctx.get_line(assumption_no)
        final_line = ctx.get_line(final_no)

        if assumption_line.kind != "assumption":
            return CloseSubproofResult(
                ok=False, type="RULE",
                message=f"Line {assumption_no} is not an assumption line.",
            )

        if not assumption_line.scope_path or assumption_line.scope_path[-1] != assumption_no:
            return CloseSubproofResult(
                ok=False, type="RULE",
                message=f"Assumption line {assumption_no} has an invalid scopePath.",
            )

        if final_no <= assumption_no:
            return CloseSubproofResult(
                ok=False, type="RULE",
                message="The final line must come after the assumption line.",
            )

        subproof_scope = assumption_line.scope_path
        if final_line.scope_path[: len(subproof_scope)] != subproof_scope:
            return CloseSubproofResult(
                ok=False, type="RULE",
                message=f"Line {final_no} is not inside the subproof opened at line {assumption_no}.",
            )

        assumption_ast = ctx.get_line_ast(assumption_no)
        final_ast = ctx.get_line_ast(final_no)
        formula_ast = imp_intro(assumption_ast, final_ast)
        formula_str = formula_to_string(formula_ast)
        parent_scope = list(assumption_line.scope_path[:-1])

        return CloseSubproofResult(
            ok=True,
            message="→I line generated.",
            formula=formula_str,
            refs=[assumption_no, final_no],
            scope_path=parent_scope,
        )

    except RuleError as e:
        return CloseSubproofResult(ok=False, type="RULE", message=str(e))


@dataclass
class DeleteLineResult:
    ok: bool
    type: Optional[str] = None
    message: str = ""
    updated_lines: List[Dict] = None
    flagged_line_nos: List[int] = None  # 1-based, after renumbering


def delete_line_payload(body: Dict[str, Any]) -> "DeleteLineResult":
    """
    Delete a proof line and compute full transitive cascade invalidation.

    Expects:
      - proofState.lines: current proof lines
      - lineIndex: 0-based index of the line to delete

    Returns the updated line list (with ``brokenRef`` set on every
    transitively invalidated line) plus the sorted set of 1-based line
    numbers (after renumbering) that were flagged.
    """
    proof = body.get("proofState") or {}
    lines_raw = proof.get("lines") or []
    line_index = body.get("lineIndex")

    if line_index is None:
        return DeleteLineResult(ok=False, type="INPUT", message="lineIndex is required.")
    if not (0 <= line_index < len(lines_raw)):
        return DeleteLineResult(ok=False, type="INPUT", message="lineIndex out of range.")

    target = lines_raw[line_index]
    if (target or {}).get("kind") == "premise":
        return DeleteLineResult(ok=False, type="RULE", message="Cannot delete premise lines.")

    removed_line_no = line_index + 1  # 1-based

    def renumber_no(n: int) -> int:
        return n - 1 if n > removed_line_no else n

    def renumber_ref(ref):
        if isinstance(ref, (list, tuple)):
            return [renumber_no(ref[0]), renumber_no(ref[1])]
        return renumber_no(ref)

    def ref_touches_deleted(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return ref[0] <= removed_line_no <= ref[1]
        return ref == removed_line_no

    # ── Step 1: remove the target line and renumber all remaining lines ───────
    updated: List[Dict] = []
    for i, ln in enumerate(lines_raw):
        if i == line_index:
            continue
        refs = ln.get("refs") or []
        discharges = ln.get("discharges") or []
        scope_path = ln.get("scopePath") or []

        has_direct_broken = any(ref_touches_deleted(r) for r in refs) or any(
            d == removed_line_no for d in discharges
        )

        new_ln = dict(ln)
        new_ln["scopePath"] = [renumber_no(x) for x in scope_path]
        new_ln["refs"] = [renumber_ref(r) for r in refs]
        new_ln["discharges"] = [renumber_no(d) for d in discharges]

        if has_direct_broken:
            # Attribute the brokenRef to the original deleted line number
            new_ln["brokenRef"] = removed_line_no
            new_ln["brokenKind"] = "deleted"

        updated.append(new_ln)

    # ── Step 2: cascade – propagate brokenRef to transitive dependents ────────
    broken_new_nos: set = {i + 1 for i, ln in enumerate(updated) if ln.get("brokenRef")}

    def ref_is_broken(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return any(n in broken_new_nos for n in range(ref[0], ref[1] + 1))
        return ref in broken_new_nos

    changed = True
    while changed:
        changed = False
        for i, ln in enumerate(updated):
            if i + 1 in broken_new_nos:
                continue
            refs = ln.get("refs") or []
            discharges = ln.get("discharges") or []

            broken_dep = None
            for r in refs:
                if ref_is_broken(r):
                    broken_dep = r[0] if isinstance(r, (list, tuple)) else r
                    break
            if broken_dep is None:
                for d in discharges:
                    if d in broken_new_nos:
                        broken_dep = d
                        break

            if broken_dep is not None:
                broken_new_nos.add(i + 1)
                new_ln = dict(ln)
                new_ln["brokenRef"] = broken_dep
                new_ln["brokenKind"] = "cascade"
                updated[i] = new_ln
                changed = True

    # ── Step 3: auto-remove broken →I lines ──────────────────────────────────
    # A →I line is a live consequence of its subproof. If it becomes broken,
    # remove it automatically and cascade to anything that depended on it.
    # Loop until no more broken →I lines remain (handles nested subproofs).
    while True:
        broken_impi = [
            i for i, ln in enumerate(updated)
            if (i + 1) in broken_new_nos
            and ln.get("rule") == "IMP_I"
            and ln.get("discharges")
        ]
        if not broken_impi:
            break

        to_remove = {i + 1 for i in broken_impi}  # 1-based

        def _rn(n: int, _tr=to_remove) -> int:
            return n - sum(1 for r in _tr if r < n)

        def _rr(ref, _tr=to_remove):
            if isinstance(ref, (list, tuple)):
                return [_rn(ref[0], _tr), _rn(ref[1], _tr)]
            return _rn(ref, _tr)

        def _touches(ref, _tr=to_remove) -> bool:
            if isinstance(ref, (list, tuple)):
                return any(n in _tr for n in range(ref[0], ref[1] + 1))
            return ref in _tr

        new_updated: List[Dict] = []
        for i, ln in enumerate(updated):
            if (i + 1) in to_remove:
                continue
            new_ln = dict(ln)
            old_refs = ln.get("refs") or []
            old_discharges = ln.get("discharges") or []
            new_ln["scopePath"] = [_rn(x) for x in (ln.get("scopePath") or [])]
            new_ln["refs"] = [_rr(r) for r in old_refs]
            new_ln["discharges"] = [_rn(d) for d in old_discharges]
            if not new_ln.get("brokenRef"):
                if any(_touches(r) for r in old_refs) or any(d in to_remove for d in old_discharges):
                    broken_src = next(
                        (r[0] if isinstance(r, (list, tuple)) else r for r in old_refs if _touches(r)),
                        next((d for d in old_discharges if d in to_remove), None),
                    )
                    new_ln["brokenRef"] = broken_src
                    new_ln["brokenKind"] = "deleted"
            new_updated.append(new_ln)

        updated = new_updated
        broken_new_nos = {i + 1 for i, ln in enumerate(updated) if ln.get("brokenRef")}

        # Re-cascade after removing the →I lines
        def _ref_is_broken_inner(ref) -> bool:
            if isinstance(ref, (list, tuple)):
                return any(n in broken_new_nos for n in range(ref[0], ref[1] + 1))
            return ref in broken_new_nos

        changed = True
        while changed:
            changed = False
            for i, ln in enumerate(updated):
                if i + 1 in broken_new_nos:
                    continue
                broken_dep = None
                for r in (ln.get("refs") or []):
                    if _ref_is_broken_inner(r):
                        broken_dep = r[0] if isinstance(r, (list, tuple)) else r
                        break
                if broken_dep is None:
                    for d in (ln.get("discharges") or []):
                        if d in broken_new_nos:
                            broken_dep = d
                            break
                if broken_dep is not None:
                    broken_new_nos.add(i + 1)
                    new_ln = dict(ln)
                    new_ln["brokenRef"] = broken_dep
                    new_ln["brokenKind"] = "cascade"
                    updated[i] = new_ln
                    changed = True

    return DeleteLineResult(
        ok=True,
        updated_lines=updated,
        flagged_line_nos=sorted(broken_new_nos),
    )


@dataclass
class DeleteSubproofResult:
    ok: bool
    type: Optional[str] = None
    message: str = ""
    updated_lines: List[Dict] = None
    flagged_line_nos: List[int] = None


def delete_subproof_payload(body: Dict[str, Any]) -> "DeleteSubproofResult":
    """
    Delete an entire subproof atomically:
      - The assumption line
      - All lines whose scopePath begins with the assumption's scopePath
      - The →I line that discharges this assumption (if it exists)

    Cascade-flags any external lines that referenced the removed lines.

    Expects:
      - proofState.lines: current proof lines
      - assumptionLineIndex: 0-based index of the assumption line
    """
    proof = body.get("proofState") or {}
    lines_raw = proof.get("lines") or []
    assumption_idx = body.get("assumptionLineIndex")

    if assumption_idx is None:
        return DeleteSubproofResult(ok=False, type="INPUT", message="assumptionLineIndex is required.")
    if not (0 <= assumption_idx < len(lines_raw)):
        return DeleteSubproofResult(ok=False, type="INPUT", message="assumptionLineIndex out of range.")

    assumption_line = lines_raw[assumption_idx]
    if (assumption_line or {}).get("kind") != "assumption":
        return DeleteSubproofResult(ok=False, type="RULE", message="Target line is not an assumption.")

    assumption_no = assumption_idx + 1  # 1-based
    scope_path = list(assumption_line.get("scopePath") or [])

    def is_in_subproof(ln) -> bool:
        lsp = ln.get("scopePath") or []
        return (
            len(lsp) >= len(scope_path)
            and lsp[: len(scope_path)] == scope_path
        )

    def is_impi_closing(ln) -> bool:
        return ln.get("rule") == "IMP_I" and assumption_no in (ln.get("discharges") or [])

    remove_indices = {
        i for i, ln in enumerate(lines_raw)
        if is_in_subproof(ln) or is_impi_closing(ln)
    }
    removed_nos = sorted(i + 1 for i in remove_indices)
    removed_nos_set = set(removed_nos)

    def rn(n: int) -> int:
        return n - sum(1 for r in removed_nos if r < n)

    def rr(ref):
        if isinstance(ref, (list, tuple)):
            return [rn(ref[0]), rn(ref[1])]
        return rn(ref)

    def touches(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return any(n in removed_nos_set for n in range(ref[0], ref[1] + 1))
        return ref in removed_nos_set

    updated: List[Dict] = []
    for i, ln in enumerate(lines_raw):
        if i in remove_indices:
            continue
        new_ln = dict(ln)
        old_refs = ln.get("refs") or []
        old_discharges = ln.get("discharges") or []
        new_ln["scopePath"] = [rn(x) for x in (ln.get("scopePath") or [])]
        new_ln["refs"] = [rr(r) for r in old_refs]
        new_ln["discharges"] = [rn(d) for d in old_discharges]
        if any(touches(r) for r in old_refs) or any(d in removed_nos_set for d in old_discharges):
            broken_src = next(
                (r[0] if isinstance(r, (list, tuple)) else r for r in old_refs if touches(r)),
                next((d for d in old_discharges if d in removed_nos_set), None),
            )
            new_ln["brokenRef"] = broken_src
            new_ln["brokenKind"] = "deleted"
        updated.append(new_ln)

    # Cascade
    broken_new_nos: set = {i + 1 for i, ln in enumerate(updated) if ln.get("brokenRef")}

    def ref_broken(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return any(n in broken_new_nos for n in range(ref[0], ref[1] + 1))
        return ref in broken_new_nos

    changed = True
    while changed:
        changed = False
        for i, ln in enumerate(updated):
            if i + 1 in broken_new_nos:
                continue
            broken_dep = None
            for r in (ln.get("refs") or []):
                if ref_broken(r):
                    broken_dep = r[0] if isinstance(r, (list, tuple)) else r
                    break
            if broken_dep is None:
                for d in (ln.get("discharges") or []):
                    if d in broken_new_nos:
                        broken_dep = d
                        break
            if broken_dep is not None:
                broken_new_nos.add(i + 1)
                new_ln = dict(ln)
                new_ln["brokenRef"] = broken_dep
                new_ln["brokenKind"] = "cascade"
                updated[i] = new_ln
                changed = True

    return DeleteSubproofResult(
        ok=True,
        updated_lines=updated,
        flagged_line_nos=sorted(broken_new_nos),
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
            normalised_premises.append(formula_to_string(parse_formula(p_norm)))

        conclusion_norm = formula_to_string(parse_formula(normalise_only(conclusion)))

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
    # Each element is either an int (line number) or a [i, j] list (subproof range).
    refs: List = step.get("refs") or []
    current_scope_path = tuple(step.get("scopePath") or [])

    # Parse proposed formula, then reprint via formula_to_string so the returned
    # `normalised` is always printer-canonical (same format as open_subproof).
    try:
        proposed_ast = parse_formula(normalised_step)
        normalised_step = formula_to_string(proposed_ast)
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
                raise RuleError(f"{rule} requires exactly 1 ref.")
            ref_ast = ctx.resolve_ref(refs[0], current_scope_path)
            expected = and_elim(ref_ast, 1 if rule == "AND_E1" else 2)
            if proposed_ast != expected:
                raise RuleError("Incorrect result for ∧-Elimination.")
            return ValidationResult(True, message="Step valid (∧-Elimination).", normalised=normalised_step)

        if rule == "AND_I":
            if len(refs) != 2:
                raise RuleError("AND_I requires exactly 2 refs.")
            a_ast = ctx.resolve_ref(refs[0], current_scope_path)
            b_ast = ctx.resolve_ref(refs[1], current_scope_path)

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
                raise RuleError("OR_E requires exactly 3 refs.")

            a1 = ctx.resolve_ref(refs[0], current_scope_path)
            a2 = ctx.resolve_ref(refs[1], current_scope_path)
            a3 = ctx.resolve_ref(refs[2], current_scope_path)

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
                raise RuleError(f"{rule} requires exactly 1 ref.")
            ref_ast = ctx.resolve_ref(refs[0], current_scope_path)
            side = 1 if rule == "OR_I1" else 2
            or_intro(ref_ast, proposed_ast, side)
            return ValidationResult(True, message="Step valid (∨-Introduction).", normalised=normalised_step)

        if rule == "IMP_E":
            if len(refs) != 2:
                raise RuleError("IMP_E requires exactly 2 refs.")
            a1 = ctx.resolve_ref(refs[0], current_scope_path)
            a2 = ctx.resolve_ref(refs[1], current_scope_path)
            expected = imp_elim(a1, a2)
            if proposed_ast != expected:
                raise RuleError("Incorrect result for →-Elimination (MP).")
            return ValidationResult(True, message="Step valid (→-Elimination / Modus Ponens).", normalised=normalised_step)

        if rule == "IMP_I":
            if len(refs) == 1 and _is_range(refs[0]):
                # Single range ref [i, j]: resolves to i's assumption → j's formula.
                expected = ctx.resolve_ref(refs[0], current_scope_path)
            elif len(refs) == 2 and not any(_is_range(r) for r in refs):
                # Legacy: two integer line refs with full scope validation.
                assumption_no, final_no = refs[0], refs[1]
                assumption_line = ctx.get_line(assumption_no)
                final_line = ctx.get_line(final_no)

                if assumption_line.kind != "assumption":
                    raise RuleError("First reference of IMP_I must be an assumption line.")

                if not assumption_line.scope_path or assumption_line.scope_path[-1] != assumption_no:
                    raise RuleError("Assumption line has invalid scopePath.")

                parent_scope = assumption_line.scope_path[:-1]
                if current_scope_path != parent_scope:
                    raise RuleError(
                        "IMP_I must be added in the parent scope of the discharged assumption."
                    )

                if final_line.scope_path[:len(assumption_line.scope_path)] != assumption_line.scope_path:
                    raise RuleError(
                        "Second reference of IMP_I must be a line inside the discharged subproof."
                    )

                if final_no <= assumption_no:
                    raise RuleError("IMP_I requires the final line to occur after the assumption line.")

                expected = imp_intro(ctx.get_line_ast(assumption_no), ctx.get_line_ast(final_no))
            else:
                raise RuleError(
                    "IMP_I requires either one subproof range [i-j] or two integer refs [assumption, final]."
                )

            if proposed_ast != expected:
                raise RuleError("Incorrect result for →-Introduction.")

            return ValidationResult(True, message="Step valid (→-Introduction).", normalised=normalised_step)

        if rule == "IFF_E":
            if len(refs) != 1:
                raise RuleError("IFF_E requires exactly 1 ref.")

            ref_ast = ctx.resolve_ref(refs[0], current_scope_path)
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
                raise RuleError("IFF_I requires exactly 2 refs.")

            a1 = ctx.resolve_ref(refs[0], current_scope_path)
            a2 = ctx.resolve_ref(refs[1], current_scope_path)
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
                raise RuleError("NEG_E requires exactly 2 refs.")

            a1 = ctx.resolve_ref(refs[0], current_scope_path)
            a2 = ctx.resolve_ref(refs[1], current_scope_path)
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
                raise RuleError("NEG_I requires exactly 2 refs.")

            a1 = ctx.resolve_ref(refs[0], current_scope_path)
            a2 = ctx.resolve_ref(refs[1], current_scope_path)
            expected = neg_intro(a1, a2)

            if proposed_ast != expected:
                raise RuleError("Incorrect result for ¬-Introduction.")

            return ValidationResult(
                True,
                message="Step valid (¬-Introduction).",
                normalised=normalised_step,
            )

        if rule == "REIT":
            if len(refs) != 1:
                raise RuleError("REIT requires exactly 1 ref.")
            ref = refs[0]
            if isinstance(ref, int) and not ctx.is_visible_from(ref, current_scope_path):
                raise RuleError(
                    f"Line {ref} is not accessible from the current scope."
                )
            resolved_ast = ctx.resolve_ref(ref, current_scope_path)
            reiteration(proposed_ast, resolved_ast)
            return ValidationResult(True, message="Step valid (Reiteration).", normalised=normalised_step)

        raise RuleError(f"Rule '{rule}' not implemented yet.")

    except RuleError as e:
        # Return normalised input even on rule errors (useful for UI display)
        return ValidationResult(False, "RULE", str(e), normalised=normalised_step)


