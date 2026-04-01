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

class ParseError(Exception): pass

class Parser:
    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self) -> Token:
        return self.tokens[self.i]

    def eat(self, kind: str) -> Token:
        t = self.peek()
        if t.kind != kind:
            raise ParseError(f"Expected {kind} but got {t.kind} at position {t.pos}")
        self.i += 1
        return t

    def parse(self) -> Formula:
        expr = self.parse_expr(0)
        if self.peek().kind != "EOF":
            t = self.peek()
            raise ParseError(f"Unexpected token '{t.value}' at position {t.pos}")
        return expr

    def parse_expr(self, min_prec: int) -> Formula:
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
