from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from .validate import parse_formula
from .parser import ParseError
from .rules import RuleError


@dataclass
class ProofLine:
    line_no: int
    formula: str
    kind: str
    rule: str
    refs: List[int]
    scope_path: Tuple[int, ...]
    discharges: Tuple[int, ...]


@dataclass
class ProofContext:
    lines: List[ProofLine]

    @classmethod
    def from_payload(cls, raw_lines: List[Dict[str, Any]]):
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
        idx = line_no - 1
        if idx < 0 or idx >= len(self.lines):
            raise RuleError(f"Referenced line {line_no} does not exist.")
        return self.lines[idx]

    def get_line_ast(self, line_no: int):
        line = self.get_line(line_no)
        try:
            return parse_formula(line.formula)
        except (ValueError, ParseError) as e:
            raise RuleError(f"Referenced line {line_no} has syntax error: {e}")

    def is_visible_from(self, ref_line_no: int, current_scope_path: Tuple[int, ...]) -> bool:
        ref = self.get_line(ref_line_no)
        ref_path = ref.scope_path
        return ref_path == current_scope_path[: len(ref_path)]

    def get_visible_line_ast(self, line_no: int, current_scope_path: Tuple[int, ...]):
        if not self.is_visible_from(line_no, current_scope_path):
            raise RuleError(
                f"Referenced line {line_no} is not visible from the current scope."
            )
        return self.get_line_ast(line_no)

    def is_assumption_line(self, line_no: int) -> bool:
        return self.get_line(line_no).kind == "assumption"

    def assumption_parent_scope(self, line_no: int) -> Tuple[int, ...]:
        line = self.get_line(line_no)

        if line.kind != "assumption":
            raise RuleError(f"Line {line_no} is not an assumption line.")

        if not line.scope_path or line.scope_path[-1] != line_no:
            raise RuleError(
                f"Assumption line {line_no} has invalid scopePath; expected it to end with its own line number."
            )

        return line.scope_path[:-1]