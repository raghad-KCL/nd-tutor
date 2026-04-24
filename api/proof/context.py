from dataclasses import dataclass
from typing import Any, Dict, List, Tuple, Union

from .validate import parse_formula
from .parser import ParseError
from .rules import RuleError
from .ast import BinOp


@dataclass
class ProofLine:
    """A single parsed line from a proof payload.

    Attributes:
        line_no: 1-based line number.
        formula: Raw formula string (stripped of whitespace).
        kind: Line category — ``"premise"``, ``"assumption"``, or
            ``"derived"``.
        rule: Inference rule applied (e.g. ``"AND_E1"``), or ``""`` for
            premises/assumptions.
        refs: Line-number references used by the rule.
        scope_path: Tuple of assumption line numbers defining the
            nesting scope this line belongs to.
        discharges: Tuple of assumption line numbers discharged by
            this line (relevant for →I lines).
    """

    line_no: int
    formula: str
    kind: str
    rule: str
    refs: List[int]
    scope_path: Tuple[int, ...]
    discharges: Tuple[int, ...]


@dataclass
class ProofContext:
    """Indexed view of a proof's lines, providing scope-aware lookups.

    Attributes:
        lines: Ordered list of parsed ``ProofLine`` objects.
    """

    lines: List[ProofLine]

    @classmethod
    def from_payload(cls, raw_lines: List[Dict[str, Any]]):
        """Creates a ``ProofContext`` from raw proof-line dicts.

        Args:
            raw_lines: List of line dicts as received from the frontend,
                each containing keys like ``formula``, ``kind``,
                ``rule``, ``refs``, ``scopePath``, and ``discharges``.

        Returns:
            A new ``ProofContext`` instance with 1-based line numbering.
        """
        parsed: List[ProofLine] = []

        for i, raw in enumerate(raw_lines, start=1):
            parsed.append(
                ProofLine(
                    line_no=i,
                    formula=(raw.get("formula") or "").strip(),
                    kind=raw.get("kind") or "derived",
                    rule=raw.get("rule") or "",
                    refs=list(raw.get("refs") or []),
                    scope_path=tuple(raw.get("scopePath") or []),
                    discharges=tuple(raw.get("discharges") or []),
                )
            )

        return cls(lines=parsed)

    def get_line(self, line_no: int) -> ProofLine:
        """Returns the ``ProofLine`` at the given 1-based line number.

        Args:
            line_no: 1-based line number.

        Returns:
            The corresponding ``ProofLine``.

        Raises:
            RuleError: If the line number is out of range.
        """
        idx = line_no - 1
        if idx < 0 or idx >= len(self.lines):
            raise RuleError(f"Referenced line {line_no} does not exist.")
        return self.lines[idx]

    def get_line_ast(self, line_no: int):
        """Parses and returns the AST of the formula at the given line.

        Args:
            line_no: 1-based line number.

        Returns:
            The parsed ``Formula`` AST node.

        Raises:
            RuleError: If the line doesn't exist or its formula has a
                syntax error.
        """
        line = self.get_line(line_no)
        try:
            return parse_formula(line.formula)
        except (ValueError, ParseError) as e:
            raise RuleError(f"Referenced line {line_no} has syntax error: {e}")

    def is_visible_from(self, ref_line_no: int, current_scope_path: Tuple[int, ...]) -> bool:
        """Checks whether a line is visible from the given scope.

        A line is visible if its scope path is a prefix of (or equal to)
        the current scope path.

        Args:
            ref_line_no: 1-based line number of the referenced line.
            current_scope_path: Scope path of the line being validated.

        Returns:
            ``True`` if the referenced line is accessible, ``False``
            otherwise.
        """
        ref = self.get_line(ref_line_no)
        ref_path = ref.scope_path
        return ref_path == current_scope_path[: len(ref_path)]

    def get_visible_line_ast(self, line_no: int, current_scope_path: Tuple[int, ...]):
        """Returns the AST of a line after verifying scope visibility.

        Args:
            line_no: 1-based line number of the referenced line.
            current_scope_path: Scope path of the line being validated.

        Returns:
            The parsed ``Formula`` AST node.

        Raises:
            RuleError: If the line is not visible from the current scope
                or has a syntax error.
        """
        if not self.is_visible_from(line_no, current_scope_path):
            raise RuleError(
                f"Referenced line {line_no} is not visible from the current scope."
            )
        return self.get_line_ast(line_no)

    def is_assumption_line(self, line_no: int) -> bool:
        """Checks whether the given line is an assumption.

        Args:
            line_no: 1-based line number.

        Returns:
            ``True`` if the line's kind is ``"assumption"``.
        """
        return self.get_line(line_no).kind == "assumption"

    def assumption_parent_scope(self, line_no: int) -> Tuple[int, ...]:
        """Returns the parent scope path of an assumption line.

        The parent scope is the assumption's scope path with the final
        element (its own line number) removed.

        Args:
            line_no: 1-based line number of the assumption.

        Returns:
            The parent scope path as a tuple of ints.

        Raises:
            RuleError: If the line is not an assumption or has an
                invalid scope path.
        """
        line = self.get_line(line_no)

        if line.kind != "assumption":
            raise RuleError(f"Line {line_no} is not an assumption line.")

        if not line.scope_path or line.scope_path[-1] != line_no:
            raise RuleError(
                f"Assumption line {line_no} has invalid scopePath; expected it to end with its own line number."
            )

        return line.scope_path[:-1]

    def resolve_ref(
        self,
        ref: Union[int, List[int]],
        current_scope_path: Tuple[int, ...],
    ):
        """
        Resolve a ref to an AST node.

        - int ref  → formula AST of that line (unchanged behaviour).
        - [i, j]   → validates the subproof and returns
                      BinOp("→", assumption_formula(i), formula(j)).

        Validation for range refs:
          • line i must have kind="assumption" with scopePath ending in i
          • j > i and line j's scopePath is prefixed by i's scope
          • the subproof is closed: i's scope is NOT a prefix of current_scope_path
        """
        if isinstance(ref, int):
            return self.get_line_ast(ref)

        if not (isinstance(ref, (list, tuple)) and len(ref) == 2):
            raise RuleError(
                f"Invalid ref {ref!r}: must be an integer or a two-element range [i, j]."
            )

        start, end = int(ref[0]), int(ref[1])

        assumption_line = self.get_line(start)
        if assumption_line.kind != "assumption":
            raise RuleError(
                f"Subproof range start (line {start}) must be an assumption, "
                f"got kind={assumption_line.kind!r}."
            )

        if not assumption_line.scope_path or assumption_line.scope_path[-1] != start:
            raise RuleError(
                f"Assumption line {start} has an invalid scopePath."
            )

        if end <= start:
            raise RuleError(
                f"Subproof range end ({end}) must come after start ({start})."
            )

        conclusion_line = self.get_line(end)
        subproof_scope = assumption_line.scope_path  # scope INSIDE the box

        if conclusion_line.scope_path[: len(subproof_scope)] != subproof_scope:
            raise RuleError(
                f"Line {end} is not inside the subproof opened at line {start}."
            )

        # Closed means: the subproof's own scope is no longer active.
        # i.e. current_scope_path must NOT start with subproof_scope.
        if current_scope_path[: len(subproof_scope)] == subproof_scope:
            raise RuleError(
                f"Subproof opened at line {start} is still active; "
                f"close it before referencing it as a range."
            )

        assumption_ast = self.get_line_ast(start)
        conclusion_ast = self.get_line_ast(end)
        return BinOp("→", assumption_ast, conclusion_ast)