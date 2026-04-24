from dataclasses import dataclass
from typing import Any, Dict, Optional, List

from ..tokens import normalise_only
from ..context import ProofContext
from ..validate import parse_formula
from ..parser import ParseError
from ..ast import BinOp
from ..printer import formula_to_string
from ..rules import (
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
class ValidationResult:
    """Result of validating a single proof step or task.

    Attributes:
        ok: Whether the validation passed.
        type: Error category when validation fails — ``"SYNTAX"`` for
            parse errors or ``"RULE"`` for rule-application errors.
            ``None`` on success.
        message: Human-readable explanation of the outcome.
        normalised: Printer-canonical form of the proposed formula,
            populated even on rule errors so the UI can display it.
    """

    ok: bool
    type: Optional[str] = None  # "SYNTAX" or "RULE"
    message: str = ""
    normalised: str = ""


def validate_task_payload(body: Dict[str, Any]) -> Dict[str, Any]:
    """Validates and normalises the premises and conclusion of a proof task.

    Parses each premise and the conclusion, returning their
    printer-canonical forms. If any formula is syntactically invalid a
    ``SYNTAX`` error is returned instead.

    Args:
        body: Request payload containing a ``proofState`` dict with keys
            ``premises`` (list of formula strings) and ``conclusion``
            (formula string).

    Returns:
        A dict with ``ok=True`` and normalised ``premises``/``conclusion``
        on success, or ``ok=False`` with ``type`` and ``message`` on failure.
    """
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
    """Validates a proposed proof step against natural-deduction rules.

    Dispatches on the ``rule`` field of the proposed step and checks that
    the referenced lines, scope, and resulting formula satisfy the
    corresponding inference rule (e.g. AND_E1, IMP_I, REIT, etc.).

    Args:
        body: Request payload containing:
            - ``proofState``: dict with ``lines`` (current proof lines).
            - ``proposedStep``: dict with ``rule``, ``formula``,
              ``refs`` (line references or subproof ranges), and
              ``scopePath``.

    Returns:
        A ``ValidationResult`` indicating success or describing the
        syntax / rule error.
    """
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
