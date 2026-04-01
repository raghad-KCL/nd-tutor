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