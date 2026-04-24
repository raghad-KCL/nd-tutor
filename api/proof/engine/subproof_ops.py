from dataclasses import dataclass
from typing import Any, Dict, Optional, List

from ..tokens import normalise_only
from ..context import ProofContext
from ..validate import parse_formula
from ..parser import ParseError
from ..ast import BinOp
from ..printer import formula_to_string
from ..rules import RuleError, imp_intro


@dataclass
class OpenSubproofResult:
    """Result of opening an implication-introduction subproof.

    Attributes:
        ok: Whether the subproof was opened successfully.
        type: Error category on failure (``"SYNTAX"`` or ``"RULE"``).
        message: Human-readable description of the outcome.
        normalised: Printer-canonical form of the full implication formula.
        assumption: Printer-canonical form of the antecedent (the assumed
            formula that begins the subproof).
        goal: Printer-canonical form of the consequent (the formula that
            must be derived to close the subproof).
    """

    ok: bool
    type: Optional[str] = None
    message: str = ""
    normalised: str = ""
    assumption: str = ""
    goal: str = ""


def open_subproof_payload(body: Dict[str, Any]) -> OpenSubproofResult:
    """Opens an implication-introduction (→I) subproof.

    Parses the provided implication formula ``A → B``, extracts the
    antecedent as the assumption and the consequent as the subproof goal.

    Args:
        body: Request payload with ``formula`` (an implication string)
            and ``rule`` (must be ``"IMP_I"``).

    Returns:
        An ``OpenSubproofResult`` with the assumption and goal on success,
        or an error describing why the subproof could not be opened.
    """
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
    """Result of closing a subproof and generating its →I discharge line.

    Attributes:
        ok: Whether the subproof was closed successfully.
        type: Error category on failure (``"RULE"``).
        message: Human-readable description of the outcome.
        formula: Printer-canonical implication ``A → B`` to add as the
            discharge line.
        refs: Two-element list ``[assumption_no, final_no]`` (1-based)
            referencing the assumption and final lines of the subproof.
        scope_path: The scope path for the new discharge line (the
            parent scope of the closed subproof).
    """

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
