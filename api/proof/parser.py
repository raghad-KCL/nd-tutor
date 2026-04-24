"""Pratt parser for propositional logic formulas."""

from typing import List
from .tokens import Token
from .ast import Atom, Not, BinOp, Formula

PRECEDENCE = {
    "IFF": 1,
    "IMP": 2,
    "OR":  3,
    "AND": 4,
}

KIND_TO_OP = {"AND": "∧", "OR": "∨", "IMP": "→", "IFF": "↔"}


class ParseError(Exception):
    """Raised when a formula string cannot be parsed."""

    pass


class Parser:
    """Pratt (top-down operator precedence) parser for propositional logic.

    Converts a list of ``Token`` objects into a ``Formula`` AST.  Binary
    connectives are parsed with the precedences defined in ``PRECEDENCE``;
    implication (``→``) is right-associative while the others are
    left-associative.

    Attributes:
        tokens: The token list to parse.
        i: Current position in the token list.
    """

    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self) -> Token:
        """Returns the current token without consuming it."""
        return self.tokens[self.i]

    def eat(self, kind: str) -> Token:
        """Consumes the current token if it matches ``kind``, else raises.

        Args:
            kind: Expected token kind (e.g. ``"ATOM"``, ``"LPAREN"``).

        Returns:
            The consumed ``Token``.

        Raises:
            ParseError: If the current token's kind does not match.
        """
        t = self.peek()
        if t.kind != kind:
            raise ParseError(f"Expected {kind} but got {t.kind} at position {t.pos}")
        self.i += 1
        return t

    def parse(self) -> Formula:
        """Parses the full token list into a ``Formula`` AST.

        Returns:
            The root ``Formula`` node.

        Raises:
            ParseError: If tokens remain after the expression or the
                input is malformed.
        """
        expr = self.parse_expr(0)
        if self.peek().kind != "EOF":
            t = self.peek()
            raise ParseError(f"Unexpected token '{t.value}' at position {t.pos}")
        return expr

    def parse_expr(self, min_prec: int) -> Formula:
        """Parses an expression respecting operator precedence.

        Args:
            min_prec: Minimum precedence level for operators to bind.

        Returns:
            The parsed ``Formula`` sub-tree.
        """
        left = self.parse_prefix()

        while True:
            t = self.peek()
            if t.kind not in PRECEDENCE:
                break
            prec = PRECEDENCE[t.kind]
            if prec < min_prec:
                break

            # right-associative for implication
            next_min = prec + (0 if t.kind in ("IMP",) else 1)

            op_tok = self.eat(t.kind)
            right = self.parse_expr(next_min)
            left = BinOp(KIND_TO_OP[op_tok.kind], left, right)

        return left

    def parse_prefix(self) -> Formula:
        """Parses a prefix expression (negation, parenthesised group, or atom).

        Returns:
            The parsed ``Formula`` sub-tree.

        Raises:
            ParseError: If the current token cannot start an expression.
        """
        t = self.peek()
        if t.kind == "NOT":
            self.eat("NOT")
            return Not(self.parse_prefix())
        if t.kind == "LPAREN":
            self.eat("LPAREN")
            inner = self.parse_expr(0)
            self.eat("RPAREN")
            return inner
        if t.kind == "ATOM":
            name = self.eat("ATOM").value
            return Atom(name)
        raise ParseError(f"Unexpected token '{t.value}' at position {t.pos}")
