from dataclasses import dataclass
from typing import Any, Dict, Optional, List


@dataclass
class DeleteLineResult:
    """Result of deleting a single proof line with cascade invalidation.

    Attributes:
        ok: Whether the deletion succeeded.
        type: Error category on failure (``"INPUT"`` or ``"RULE"``).
        message: Human-readable description on failure.
        updated_lines: The proof lines after deletion, renumbering, and
            cascade-flagging. Each transitively invalidated line has its
            ``brokenRef`` and ``brokenKind`` fields set.
        flagged_line_nos: Sorted 1-based line numbers (after renumbering)
            of every line marked as broken.
    """

    ok: bool
    type: Optional[str] = None
    message: str = ""
    updated_lines: List[Dict] = None
    flagged_line_nos: List[int] = None  # 1-based, after renumbering


def delete_line_payload(body: Dict[str, Any]) -> "DeleteLineResult":
    """
    Delete a proof line and compute full transitive cascade invalidation.

    Expects:
      - proofState.lines: current proof lines
      - lineIndex: 0-based index of the line to delete

    Returns the updated line list (with ``brokenRef`` set on every
    transitively invalidated line) plus the sorted set of 1-based line
    numbers (after renumbering) that were flagged.
    """
    proof = body.get("proofState") or {}
    lines_raw = proof.get("lines") or []
    line_index = body.get("lineIndex")

    if line_index is None:
        return DeleteLineResult(ok=False, type="INPUT", message="lineIndex is required.")
    if not (0 <= line_index < len(lines_raw)):
        return DeleteLineResult(ok=False, type="INPUT", message="lineIndex out of range.")

    target = lines_raw[line_index]
    if (target or {}).get("kind") == "premise":
        return DeleteLineResult(ok=False, type="RULE", message="Cannot delete premise lines.")

    removed_line_no = line_index + 1  # 1-based

    def renumber_no(n: int) -> int:
        return n - 1 if n > removed_line_no else n

    def renumber_ref(ref):
        if isinstance(ref, (list, tuple)):
            return [renumber_no(ref[0]), renumber_no(ref[1])]
        return renumber_no(ref)

    def ref_touches_deleted(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return ref[0] <= removed_line_no <= ref[1]
        return ref == removed_line_no

    # ── Step 1: remove the target line and renumber all remaining lines ───────
    updated: List[Dict] = []
    for i, ln in enumerate(lines_raw):
        if i == line_index:
            continue
        refs = ln.get("refs") or []
        discharges = ln.get("discharges") or []
        scope_path = ln.get("scopePath") or []

        has_direct_broken = any(ref_touches_deleted(r) for r in refs) or any(
            d == removed_line_no for d in discharges
        )

        new_ln = dict(ln)
        new_ln["scopePath"] = [renumber_no(x) for x in scope_path]
        new_ln["refs"] = [renumber_ref(r) for r in refs]
        new_ln["discharges"] = [renumber_no(d) for d in discharges]

        if has_direct_broken:
            # Attribute the brokenRef to the original deleted line number
            new_ln["brokenRef"] = removed_line_no
            new_ln["brokenKind"] = "deleted"

        updated.append(new_ln)

    # ── Step 2: cascade – propagate brokenRef to transitive dependents ────────
    broken_new_nos: set = {i + 1 for i, ln in enumerate(updated) if ln.get("brokenRef")}

    def ref_is_broken(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return any(n in broken_new_nos for n in range(ref[0], ref[1] + 1))
        return ref in broken_new_nos

    changed = True
    while changed:
        changed = False
        for i, ln in enumerate(updated):
            if i + 1 in broken_new_nos:
                continue
            refs = ln.get("refs") or []
            discharges = ln.get("discharges") or []

            broken_dep = None
            for r in refs:
                if ref_is_broken(r):
                    broken_dep = r[0] if isinstance(r, (list, tuple)) else r
                    break
            if broken_dep is None:
                for d in discharges:
                    if d in broken_new_nos:
                        broken_dep = d
                        break

            if broken_dep is not None:
                broken_new_nos.add(i + 1)
                new_ln = dict(ln)
                new_ln["brokenRef"] = broken_dep
                new_ln["brokenKind"] = "cascade"
                updated[i] = new_ln
                changed = True

    # ── Step 3: auto-remove broken →I lines ──────────────────────────────────
    # A →I line is a live consequence of its subproof. If it becomes broken,
    # remove it automatically and cascade to anything that depended on it.
    # Loop until no more broken →I lines remain (handles nested subproofs).
    while True:
        broken_impi = [
            i for i, ln in enumerate(updated)
            if (i + 1) in broken_new_nos
            and ln.get("rule") == "IMP_I"
            and ln.get("discharges")
        ]
        if not broken_impi:
            break

        to_remove = {i + 1 for i in broken_impi}  # 1-based

        def _rn(n: int, _tr=to_remove) -> int:
            return n - sum(1 for r in _tr if r < n)

        def _rr(ref, _tr=to_remove):
            if isinstance(ref, (list, tuple)):
                return [_rn(ref[0], _tr), _rn(ref[1], _tr)]
            return _rn(ref, _tr)

        new_updated: List[Dict] = []
        for i, ln in enumerate(updated):
            if (i + 1) in to_remove:
                continue
            new_ln = dict(ln)
            new_ln["scopePath"] = [_rn(x) for x in (ln.get("scopePath") or [])]
            new_ln["refs"] = [_rr(r) for r in (ln.get("refs") or [])]
            new_ln["discharges"] = [_rn(d) for d in (ln.get("discharges") or [])]
            new_updated.append(new_ln)

        updated = new_updated
        broken_new_nos = {i + 1 for i, ln in enumerate(updated) if ln.get("brokenRef")}

    return DeleteLineResult(
        ok=True,
        updated_lines=updated,
        flagged_line_nos=sorted(broken_new_nos),
    )


@dataclass
class DeleteSubproofResult:
    """Result of atomically deleting an entire subproof.

    Attributes:
        ok: Whether the deletion succeeded.
        type: Error category on failure (``"INPUT"`` or ``"RULE"``).
        message: Human-readable description on failure.
        updated_lines: The proof lines after removal, renumbering, and
            cascade-flagging.
        flagged_line_nos: Sorted 1-based line numbers (after renumbering)
            of every line marked as broken.
    """

    ok: bool
    type: Optional[str] = None
    message: str = ""
    updated_lines: List[Dict] = None
    flagged_line_nos: List[int] = None


def delete_subproof_payload(body: Dict[str, Any]) -> "DeleteSubproofResult":
    """
    Delete an entire subproof atomically:
      - The assumption line
      - All lines whose scopePath begins with the assumption's scopePath
      - The →I line that discharges this assumption (if it exists)

    Cascade-flags any external lines that referenced the removed lines.

    Expects:
      - proofState.lines: current proof lines
      - assumptionLineIndex: 0-based index of the assumption line
    """
    proof = body.get("proofState") or {}
    lines_raw = proof.get("lines") or []
    assumption_idx = body.get("assumptionLineIndex")

    if assumption_idx is None:
        return DeleteSubproofResult(ok=False, type="INPUT", message="assumptionLineIndex is required.")
    if not (0 <= assumption_idx < len(lines_raw)):
        return DeleteSubproofResult(ok=False, type="INPUT", message="assumptionLineIndex out of range.")

    assumption_line = lines_raw[assumption_idx]
    if (assumption_line or {}).get("kind") != "assumption":
        return DeleteSubproofResult(ok=False, type="RULE", message="Target line is not an assumption.")

    assumption_no = assumption_idx + 1  # 1-based
    scope_path = list(assumption_line.get("scopePath") or [])

    def is_in_subproof(ln) -> bool:
        lsp = ln.get("scopePath") or []
        return (
            len(lsp) >= len(scope_path)
            and lsp[: len(scope_path)] == scope_path
        )

    def is_impi_closing(ln) -> bool:
        return ln.get("rule") == "IMP_I" and assumption_no in (ln.get("discharges") or [])

    remove_indices = {
        i for i, ln in enumerate(lines_raw)
        if is_in_subproof(ln) or is_impi_closing(ln)
    }
    removed_nos = sorted(i + 1 for i in remove_indices)
    removed_nos_set = set(removed_nos)

    def rn(n: int) -> int:
        return n - sum(1 for r in removed_nos if r < n)

    def rr(ref):
        if isinstance(ref, (list, tuple)):
            return [rn(ref[0]), rn(ref[1])]
        return rn(ref)

    def touches(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return any(n in removed_nos_set for n in range(ref[0], ref[1] + 1))
        return ref in removed_nos_set

    updated: List[Dict] = []
    for i, ln in enumerate(lines_raw):
        if i in remove_indices:
            continue
        new_ln = dict(ln)
        old_refs = ln.get("refs") or []
        old_discharges = ln.get("discharges") or []
        new_ln["scopePath"] = [rn(x) for x in (ln.get("scopePath") or [])]
        new_ln["refs"] = [rr(r) for r in old_refs]
        new_ln["discharges"] = [rn(d) for d in old_discharges]
        if any(touches(r) for r in old_refs) or any(d in removed_nos_set for d in old_discharges):
            broken_src = next(
                (r[0] if isinstance(r, (list, tuple)) else r for r in old_refs if touches(r)),
                next((d for d in old_discharges if d in removed_nos_set), None),
            )
            new_ln["brokenRef"] = broken_src
            new_ln["brokenKind"] = "deleted"
        updated.append(new_ln)

    # Cascade
    broken_new_nos: set = {i + 1 for i, ln in enumerate(updated) if ln.get("brokenRef")}

    def ref_broken(ref) -> bool:
        if isinstance(ref, (list, tuple)):
            return any(n in broken_new_nos for n in range(ref[0], ref[1] + 1))
        return ref in broken_new_nos

    changed = True
    while changed:
        changed = False
        for i, ln in enumerate(updated):
            if i + 1 in broken_new_nos:
                continue
            broken_dep = None
            for r in (ln.get("refs") or []):
                if ref_broken(r):
                    broken_dep = r[0] if isinstance(r, (list, tuple)) else r
                    break
            if broken_dep is None:
                for d in (ln.get("discharges") or []):
                    if d in broken_new_nos:
                        broken_dep = d
                        break
            if broken_dep is not None:
                broken_new_nos.add(i + 1)
                new_ln = dict(ln)
                new_ln["brokenRef"] = broken_dep
                new_ln["brokenKind"] = "cascade"
                updated[i] = new_ln
                changed = True

    return DeleteSubproofResult(
        ok=True,
        updated_lines=updated,
        flagged_line_nos=sorted(broken_new_nos),
    )
