"""Pretty-printer that converts Formula AST nodes back to strings."""

from .ast import Atom, Not, BinOp, Formula

PRECEDENCE = {
    "↔": 1,
    "→": 2,
    "∨": 3,
    "∧": 4,
    "¬": 5,
    "ATOM": 6,
}


def formula_to_string(node: Formula, parent_prec: int = 0) -> str:
    """Converts a ``Formula`` AST node into a canonical string representation.

    Parentheses are inserted only when required by operator precedence.
    Implication and biconditional are right-associative; conjunction and
    disjunction are left-associative.

    Args:
        node: The AST node to print.
        parent_prec: Precedence of the enclosing operator, used to
            decide whether parentheses are needed. Callers should
            generally omit this (defaults to 0).

    Returns:
        The formula as a human-readable Unicode string.

    Raises:
        TypeError: If ``node`` is not a recognised AST type.
    """
    if isinstance(node, Atom):
        return node.name

    if isinstance(node, Not):
        inner = formula_to_string(node.inner, PRECEDENCE["¬"])
        text = f"¬{inner}"
        if PRECEDENCE["¬"] < parent_prec:
            return f"({text})"
        return text

    if isinstance(node, BinOp):
        op = node.op
        prec = PRECEDENCE[op]

        if op in ("→", "↔"):
            left = formula_to_string(node.left, prec + 1)
            right = formula_to_string(node.right, prec)
        else:
            left = formula_to_string(node.left, prec)
            right = formula_to_string(node.right, prec + 1)

        text = f"{left} {op} {right}"

        if prec < parent_prec:
            return f"({text})"
        return text

    raise TypeError(f"Unknown formula node type: {type(node).__name__}")