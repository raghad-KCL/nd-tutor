"""Abstract syntax tree nodes for propositional logic formulas."""

from dataclasses import dataclass


class Formula:
    """Base class for all propositional logic AST nodes."""

    ...


@dataclass(frozen=True)
class Atom(Formula):
    """A propositional variable (e.g. ``P``, ``Q``).

    Attributes:
        name: The variable name.
    """

    name: str


@dataclass(frozen=True)
class Not(Formula):
    """Negation of a formula (¬A).

    Attributes:
        inner: The negated sub-formula.
    """

    inner: Formula


@dataclass(frozen=True)
class BinOp(Formula):
    """Binary connective applied to two sub-formulas.

    Attributes:
        op: Unicode operator symbol — one of ``"∧"``, ``"∨"``, ``"→"``,
            ``"↔"``.
        left: Left operand.
        right: Right operand.
    """

    op: str   # "∧", "∨", "→", "↔"
    left: Formula
    right: Formula
