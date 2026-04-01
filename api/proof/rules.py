from .ast import BinOp, Not

class RuleError(Exception): pass

def and_elim(ast_of_ref_line, which: int):
    # which = 1 or 2
    if not isinstance(ast_of_ref_line, BinOp) or ast_of_ref_line.op != "∧":
        raise RuleError("∧-Elimination requires a referenced line that is a conjunction (A ∧ B).")
    return ast_of_ref_line.left if which == 1 else ast_of_ref_line.right


def and_intro(ast_left, ast_right):
    # Build the expected conjunction AST
    return BinOp("∧", ast_left, ast_right)


def or_intro(ast_ref, proposed_ast, side: int):
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
    return BinOp("→", assumption_ast, final_ast)


def iff_elim(ast_ref):
    if not isinstance(ast_ref, BinOp) or ast_ref.op != "↔":
        raise RuleError("↔-Elimination requires a referenced line that is an equivalence (A ↔ B).")

    left_imp = BinOp("→", ast_ref.left, ast_ref.right)
    right_imp = BinOp("→", ast_ref.right, ast_ref.left)
    return BinOp("∧", left_imp, right_imp)


def iff_intro(ast1, ast2):
    if not (
        isinstance(ast1, BinOp) and ast1.op == "→" and
        isinstance(ast2, BinOp) and ast2.op == "→"
    ):
        raise RuleError("↔-Introduction requires two implications: A→B and B→A.")

    if ast1.left == ast2.right and ast1.right == ast2.left:
        return BinOp("↔", ast1.left, ast1.right)

    raise RuleError("↔-Introduction requires references of the form A→B and B→A.")


def neg_elim(ast1, ast2):
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
