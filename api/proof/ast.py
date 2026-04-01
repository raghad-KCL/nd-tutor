from dataclasses import dataclass

class Formula: ...

@dataclass(frozen=True)
class Atom(Formula):
    name: str

@dataclass(frozen=True)
class Not(Formula):
    inner: Formula

@dataclass(frozen=True)
class BinOp(Formula):
    op: str   # "∧", "∨", "→", "↔"
    left: Formula
    right: Formula
