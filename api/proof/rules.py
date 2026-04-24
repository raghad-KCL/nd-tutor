"""Inference-rule implementations for natural-deduction proof checking."""

from .ast import BinOp, Not


class RuleError(Exception):
    """Raised when an inference rule is applied incorrectly."""

    pass


def and_elim(ast_of_ref_line, which: int):
    """Applies conjunction elimination (∧E).

    Args:
        ast_of_ref_line: AST of the referenced conjunction line.
        which: ``1`` to extract the left conjunct, ``2`` for the right.

    Returns:
        The selected conjunct's AST.

    Raises:
        RuleError: If the referenced line is not a conjunction.
    """
    # which = 1 or 2
    if not isinstance(ast_of_ref_line, BinOp) or ast_of_ref_line.op != "∧":
        raise RuleError("∧-Elimination requires a referenced line that is a conjunction (A ∧ B).")
    return ast_of_ref_line.left if which == 1 else ast_of_ref_line.right


def and_intro(ast_left, ast_right):
    """Applies conjunction introduction (∧I).

    Args:
        ast_left: AST of the left conjunct.
        ast_right: AST of the right conjunct.

    Returns:
        A ``BinOp("∧", ...)`` AST node.
    """
    # Build the expected conjunction AST
    return BinOp("∧", ast_left, ast_right)


def or_intro(ast_ref, proposed_ast, side: int):
    """Validates disjunction introduction (∨I).

    Args:
        ast_ref: AST of the referenced line.
        proposed_ast: AST of the proposed disjunction.
        side: ``1`` if the reference should match the left disjunct,
            ``2`` for the right.

    Returns:
        ``True`` if the introduction is valid.

    Raises:
        RuleError: If the proposed formula is not a disjunction or the
            reference does not match the expected side.
    """
    # side = 1 means ref must match left side of (A ∨ B)
    # side = 2 means ref must match right side of (A ∨ B)
    if not isinstance(proposed_ast, BinOp) or proposed_ast.op != "∨":
        raise RuleError("∨-Introduction requires the proposed formula to be a disjunction (A ∨ B).")

    if side == 1 and proposed_ast.left != ast_ref:
        raise RuleError("OR_I1 requires the referenced line to match the LEFT side of the disjunction (A ∨ B).")

    if side == 2 and proposed_ast.right != ast_ref:
        raise RuleError("OR_I2 requires the referenced line to match the RIGHT side of the disjunction (A ∨ B).")

    return True


def or_elim(ast1, ast2, ast3):
    """Applies disjunction elimination (∨E).

    Expects two implications ``A→C`` and ``B→C`` and a disjunction
    ``A∨B``, and returns the common consequent ``C``.

    Args:
        ast1: AST of the first implication (``A→C``).
        ast2: AST of the second implication (``B→C``).
        ast3: AST of the disjunction (``A∨B``).

    Returns:
        The common consequent AST (``C``).

    Raises:
        RuleError: If the arguments don't satisfy ∨E conditions.
    """
    if not (
        isinstance(ast1, BinOp) and ast1.op == "→" and
        isinstance(ast2, BinOp) and ast2.op == "→"
    ):
        raise RuleError("∨E requires two implications.")

    if not (isinstance(ast3, BinOp) and ast3.op == "∨"):
        raise RuleError("∨E requires a disjunction (A ∨ B).")

    if ast1.right != ast2.right:
        raise RuleError("Both implications must conclude the same formula C.")

    A = ast1.left
    B = ast2.left
    disj_left = ast3.left
    disj_right = ast3.right

    if not (
        (A == disj_left and B == disj_right) or
        (A == disj_right and B == disj_left)
    ):
        raise RuleError("Implication antecedents must match the disjunction.")

    return ast1.right


def imp_elim(ast1, ast2):
    """
    Returns the expected conclusion AST if MP applies.
    Accepts either order: (A→B, A) or (A, A→B).
    """
    # Case 1: ast1 is (A→B) and ast2 is A
    if isinstance(ast1, BinOp) and ast1.op == "→" and ast2 == ast1.left:
        return ast1.right

    # Case 2: ast2 is (A→B) and ast1 is A
    if isinstance(ast2, BinOp) and ast2.op == "→" and ast1 == ast2.left:
        return ast2.right

    raise RuleError("→-Elimination (MP) requires references to A→B and A (in any order).")


def imp_intro(assumption_ast, final_ast):
    """Applies implication introduction (→I).

    Args:
        assumption_ast: AST of the discharged assumption.
        final_ast: AST of the formula derived at the end of the subproof.

    Returns:
        A ``BinOp("→", assumption, conclusion)`` AST node.
    """
    return BinOp("→", assumption_ast, final_ast)


def iff_elim(ast_ref):
    """Applies biconditional elimination (↔E).

    Decomposes ``A ↔ B`` into ``(A → B) ∧ (B → A)``.

    Args:
        ast_ref: AST of the referenced biconditional line.

    Returns:
        A conjunction AST of the two implications.

    Raises:
        RuleError: If the referenced line is not a biconditional.
    """
    if not isinstance(ast_ref, BinOp) or ast_ref.op != "↔":
        raise RuleError("↔-Elimination requires a referenced line that is an equivalence (A ↔ B).")

    left_imp = BinOp("→", ast_ref.left, ast_ref.right)
    right_imp = BinOp("→", ast_ref.right, ast_ref.left)
    return BinOp("∧", left_imp, right_imp)


def iff_intro(ast1, ast2):
    """Applies biconditional introduction (↔I).

    Combines ``A→B`` and ``B→A`` into ``A ↔ B``.

    Args:
        ast1: AST of the first implication (``A→B``).
        ast2: AST of the second implication (``B→A``).

    Returns:
        A ``BinOp("↔", A, B)`` AST node.

    Raises:
        RuleError: If the arguments are not matching converse
            implications.
    """
    if not (
        isinstance(ast1, BinOp) and ast1.op == "→" and
        isinstance(ast2, BinOp) and ast2.op == "→"
    ):
        raise RuleError("↔-Introduction requires two implications: A→B and B→A.")

    if ast1.left == ast2.right and ast1.right == ast2.left:
        return BinOp("↔", ast1.left, ast1.right)

    raise RuleError("↔-Introduction requires references of the form A→B and B→A.")


def neg_elim(ast1, ast2):
    """Applies negation elimination (¬E).

    From ``¬A→B`` and ``¬A→¬B``, concludes ``A`` (proof by
    contradiction).

    Args:
        ast1: AST of the first implication (``¬A→B``).
        ast2: AST of the second implication (``¬A→¬B``).

    Returns:
        The inner formula ``A``.

    Raises:
        RuleError: If the arguments don't satisfy ¬E conditions.
    """
    # Expect ¬A→B and ¬A→¬B, conclude A
    if not (
        isinstance(ast1, BinOp) and ast1.op == "→" and
        isinstance(ast2, BinOp) and ast2.op == "→"
    ):
        raise RuleError("¬-Elimination requires two implications: ¬A→B and ¬A→¬B.")

    # both antecedents must be ¬A
    if not (isinstance(ast1.left, Not) and isinstance(ast2.left, Not)):
        raise RuleError("¬-Elimination requires both antecedents to be negations (¬A).")

    if ast1.left.inner != ast2.left.inner:
        raise RuleError("¬-Elimination requires both implications to have the same antecedent ¬A.")

    # one consequent must be B and the other ¬B
    if isinstance(ast1.right, Not) and ast1.right.inner == ast2.right:
        return ast1.left.inner

    if isinstance(ast2.right, Not) and ast2.right.inner == ast1.right:
        return ast1.left.inner

    raise RuleError("¬-Elimination requires implications of the form ¬A→B and ¬A→¬B.")


def neg_intro(ast1, ast2):
    """Applies negation introduction (¬I).

    From ``A→B`` and ``A→¬B``, concludes ``¬A``.

    Args:
        ast1: AST of the first implication (``A→B``).
        ast2: AST of the second implication (``A→¬B``).

    Returns:
        A ``Not(A)`` AST node.

    Raises:
        RuleError: If the arguments don't satisfy ¬I conditions.
    """
    # Expect A→B and A→¬B, conclude ¬A
    if not (
        isinstance(ast1, BinOp) and ast1.op == "→" and
        isinstance(ast2, BinOp) and ast2.op == "→"
    ):
        raise RuleError("¬-Introduction requires two implications: A→B and A→¬B.")

    # same antecedent A
    if ast1.left != ast2.left:
        raise RuleError("¬-Introduction requires both implications to have the same antecedent A.")

    # one consequent must be B and the other ¬B
    if isinstance(ast1.right, Not) and ast1.right.inner == ast2.right:
        return Not(ast1.left)

    if isinstance(ast2.right, Not) and ast2.right.inner == ast1.right:
        return Not(ast1.left)

    raise RuleError("¬-Introduction requires implications of the form A→B and A→¬B.")


def reiteration(proposed_ast, resolved_ast):
    """Validates a reiteration step.

    The proposed formula must be identical to the referenced formula.

    Args:
        proposed_ast: AST of the formula the student entered.
        resolved_ast: AST of the referenced line's formula.

    Returns:
        ``True`` if the formulas match.

    Raises:
        RuleError: If the formulas do not match.
    """
    if proposed_ast != resolved_ast:
        raise RuleError(
            "REIT: the proposed formula does not match the referenced formula."
        )
    return True
