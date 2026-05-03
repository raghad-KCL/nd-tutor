"""Unit tests for the proof engine package.

Covers parsing, every inference rule, scope visibility, subproof
operations, line operations, and proof-completion checking.
"""

from django.test import SimpleTestCase

from api.proof.ast import Atom, BinOp, Not
from api.proof.context import ProofContext
from api.proof.engine.line_ops import (
    delete_line_payload,
    delete_subproof_payload,
)
from api.proof.engine.proof_checker import check_proof_payload
from api.proof.engine.step_validator import (
    validate_step_payload,
    validate_task_payload,
)
from api.proof.engine.subproof_ops import (
    close_subproof_payload,
    open_subproof_payload,
)
from api.proof.parser import ParseError
from api.proof.printer import formula_to_string
from api.proof.rules import (
    RuleError,
    and_elim,
    and_intro,
    iff_elim,
    iff_intro,
    imp_elim,
    imp_intro,
    neg_elim,
    neg_intro,
    or_elim,
    or_intro,
    reiteration,
)
from api.proof.tokens import normalise_only, tokenize
from api.proof.validate import parse_formula
from api.views.helpers import count_distinct_vars, parse_tree_depth


# ─── Parsing pipeline ──────────────────────────────────────────────────────────


class ParserTests(SimpleTestCase):
    """Tokenisation, normalisation, and parsing tests."""

    def test_atom_parses_to_atom_node(self):
        self.assertEqual(parse_formula("P"), Atom("P"))

    def test_conjunction_parses_to_binop_and(self):
        self.assertEqual(
            parse_formula("P and Q"),
            BinOp("∧", Atom("P"), Atom("Q")),
        )

    def test_word_operators_normalise(self):
        self.assertEqual(normalise_only("P and Q"), "P ∧ Q")
        self.assertEqual(normalise_only("P or Q"), "P ∨ Q")
        # Whole-word "not" replacement preserves the trailing space
        self.assertEqual(normalise_only("not P"), "¬ P")
        # Case-insensitive
        self.assertEqual(normalise_only("P AND Q"), "P ∧ Q")

    def test_single_char_operators_normalise(self):
        self.assertEqual(normalise_only("P & Q"), "P ∧ Q")
        self.assertEqual(normalise_only("P ^ Q"), "P ∧ Q")
        self.assertEqual(normalise_only("P | Q"), "P ∨ Q")
        self.assertEqual(normalise_only("!P"), "¬P")
        self.assertEqual(normalise_only("~P"), "¬P")

    def test_multi_char_operators_normalise(self):
        self.assertEqual(normalise_only("P -> Q"), "P → Q")
        self.assertEqual(normalise_only("P => Q"), "P → Q")
        self.assertEqual(normalise_only("P > Q").strip(), "P > Q")
        # Note: '>' alone is not a recognised operator — '->' or '=>' is required.

    def test_biconditional_normalises_correctly(self):
        # Multi-char operators must be processed before single-char ones,
        # so "<->" maps to "↔" without partial corruption.
        self.assertEqual(normalise_only("P <-> Q"), "P ↔ Q")
        self.assertEqual(normalise_only("P <=> Q"), "P ↔ Q")
        self.assertEqual(
            parse_formula("P <-> Q"),
            BinOp("↔", Atom("P"), Atom("Q")),
        )

    def test_and_binds_tighter_than_or(self):
        self.assertEqual(
            parse_formula("P and Q or R"),
            BinOp("∨", BinOp("∧", Atom("P"), Atom("Q")), Atom("R")),
        )

    def test_negation_binds_tighter_than_and(self):
        self.assertEqual(
            parse_formula("not P and Q"),
            BinOp("∧", Not(Atom("P")), Atom("Q")),
        )

    def test_implication_is_right_associative(self):
        self.assertEqual(
            parse_formula("P → Q → R"),
            BinOp("→", Atom("P"), BinOp("→", Atom("Q"), Atom("R"))),
        )

    def test_empty_formula_raises_syntax_error(self):
        with self.assertRaises((ValueError, ParseError)):
            parse_formula("")

    def test_unmatched_paren_raises_syntax_error(self):
        with self.assertRaises((ValueError, ParseError)):
            parse_formula("(P")


# ─── Helpers for rule tests ────────────────────────────────────────────────────


def _premise(formula):
    return {"formula": formula, "kind": "premise", "rule": "", "refs": [],
            "scopePath": [], "discharges": []}


def _assumption(formula, line_no):
    return {"formula": formula, "kind": "assumption", "rule": "", "refs": [],
            "scopePath": [line_no], "discharges": []}


def _derived(formula, rule, refs, scope_path=None, discharges=None):
    return {"formula": formula, "kind": "derived", "rule": rule, "refs": refs,
            "scopePath": list(scope_path or []),
            "discharges": list(discharges or [])}


def _step(rule, formula, refs, scope_path=None):
    return {"rule": rule, "formula": formula, "refs": refs,
            "scopePath": list(scope_path or [])}


def _validate(lines, step):
    return validate_step_payload({
        "proofState": {"lines": lines},
        "proposedStep": step,
    })


# ─── Inference rule tests ──────────────────────────────────────────────────────


class AndElimTests(SimpleTestCase):
    """Tests for AND_E1 and AND_E2."""

    def test_and_e1_accepts_left_conjunct(self):
        result = _validate(
            [_premise("P ∧ Q")],
            _step("AND_E1", "P", [1]),
        )
        self.assertTrue(result.ok)

    def test_and_e1_rejects_wrong_conjunct(self):
        result = _validate(
            [_premise("P ∧ Q")],
            _step("AND_E1", "Q", [1]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_and_e2_accepts_right_conjunct(self):
        result = _validate(
            [_premise("P ∧ Q")],
            _step("AND_E2", "Q", [1]),
        )
        self.assertTrue(result.ok)

    def test_and_e2_rejects_wrong_conjunct(self):
        result = _validate(
            [_premise("P ∧ Q")],
            _step("AND_E2", "P", [1]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class AndIntroTests(SimpleTestCase):
    """Tests for AND_I."""

    def test_and_i_accepts_correct_conjunction(self):
        result = _validate(
            [_premise("P"), _premise("Q")],
            _step("AND_I", "P ∧ Q", [1, 2]),
        )
        self.assertTrue(result.ok)

    def test_and_i_rejects_unrelated_conjunct(self):
        result = _validate(
            [_premise("P"), _premise("Q")],
            _step("AND_I", "P ∧ R", [1, 2]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class OrIntroTests(SimpleTestCase):
    """Tests for OR_I1 and OR_I2."""

    def test_or_i1_accepts_left_addition(self):
        result = _validate(
            [_premise("P")],
            _step("OR_I1", "P ∨ Q", [1]),
        )
        self.assertTrue(result.ok)

    def test_or_i1_rejects_when_ref_does_not_match_left(self):
        result = _validate(
            [_premise("P")],
            _step("OR_I1", "Q ∨ P", [1]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_or_i2_accepts_right_addition(self):
        result = _validate(
            [_premise("Q")],
            _step("OR_I2", "P ∨ Q", [1]),
        )
        self.assertTrue(result.ok)

    def test_or_i2_rejects_when_ref_does_not_match_right(self):
        result = _validate(
            [_premise("Q")],
            _step("OR_I2", "Q ∨ P", [1]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class OrElimTests(SimpleTestCase):
    """Tests for OR_E."""

    def test_or_e_accepts_common_consequent(self):
        result = _validate(
            [
                _premise("P → R"),
                _premise("Q → R"),
                _premise("P ∨ Q"),
            ],
            _step("OR_E", "R", [1, 2, 3]),
        )
        self.assertTrue(result.ok)

    def test_or_e_rejects_when_consequents_disagree(self):
        result = _validate(
            [
                _premise("P → R"),
                _premise("Q → S"),
                _premise("P ∨ Q"),
            ],
            _step("OR_E", "R", [1, 2, 3]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class ImpElimTests(SimpleTestCase):
    """Tests for IMP_E (modus ponens)."""

    def test_imp_e_accepts_modus_ponens(self):
        result = _validate(
            [_premise("P → Q"), _premise("P")],
            _step("IMP_E", "Q", [1, 2]),
        )
        self.assertTrue(result.ok)

    def test_imp_e_rejects_when_antecedent_does_not_match(self):
        result = _validate(
            [_premise("P → Q"), _premise("R")],
            _step("IMP_E", "Q", [1, 2]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class ImpIntroTests(SimpleTestCase):
    """Tests for IMP_I."""

    def test_imp_i_accepts_subproof_range(self):
        # Subproof: assumption P at line 1, derive P (REIT) at line 2.
        # After closing, IMP_I [1, 2] in scope=[] should yield P → P.
        lines = [
            _assumption("P", 1),
            _derived("P", "REIT", [1], scope_path=[1]),
        ]
        result = _validate(
            lines,
            _step("IMP_I", "P → P", [[1, 2]], scope_path=[]),
        )
        self.assertTrue(result.ok)

    def test_imp_i_rejects_wrong_implication(self):
        lines = [
            _assumption("P", 1),
            _derived("P", "REIT", [1], scope_path=[1]),
        ]
        result = _validate(
            lines,
            _step("IMP_I", "Q → Q", [[1, 2]], scope_path=[]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class IffElimTests(SimpleTestCase):
    """Tests for IFF_E."""

    def test_iff_e_accepts_decomposition(self):
        result = _validate(
            [_premise("P ↔ Q")],
            _step("IFF_E", "(P → Q) ∧ (Q → P)", [1]),
        )
        self.assertTrue(result.ok)

    def test_iff_e_rejects_wrong_decomposition(self):
        result = _validate(
            [_premise("P ↔ Q")],
            _step("IFF_E", "P ∧ Q", [1]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class IffIntroTests(SimpleTestCase):
    """Tests for IFF_I."""

    def test_iff_i_accepts_converse_implications(self):
        result = _validate(
            [_premise("P → Q"), _premise("Q → P")],
            _step("IFF_I", "P ↔ Q", [1, 2]),
        )
        self.assertTrue(result.ok)

    def test_iff_i_rejects_unrelated_implications(self):
        result = _validate(
            [_premise("P → Q"), _premise("R → S")],
            _step("IFF_I", "P ↔ Q", [1, 2]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class NegElimTests(SimpleTestCase):
    """Tests for NEG_E."""

    def test_neg_e_accepts_classical_contradiction(self):
        # ¬P → Q and ¬P → ¬Q lets us conclude P
        result = _validate(
            [_premise("¬P → Q"), _premise("¬P → ¬Q")],
            _step("NEG_E", "P", [1, 2]),
        )
        self.assertTrue(result.ok)

    def test_neg_e_rejects_when_antecedents_differ(self):
        result = _validate(
            [_premise("¬P → Q"), _premise("¬R → ¬Q")],
            _step("NEG_E", "P", [1, 2]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class NegIntroTests(SimpleTestCase):
    """Tests for NEG_I."""

    def test_neg_i_accepts_contradiction_pattern(self):
        # P → Q and P → ¬Q lets us conclude ¬P
        result = _validate(
            [_premise("P → Q"), _premise("P → ¬Q")],
            _step("NEG_I", "¬P", [1, 2]),
        )
        self.assertTrue(result.ok)

    def test_neg_i_rejects_wrong_negation(self):
        result = _validate(
            [_premise("P → Q"), _premise("P → ¬Q")],
            _step("NEG_I", "¬Q", [1, 2]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class ReiterationTests(SimpleTestCase):
    """Tests for REIT."""

    def test_reit_accepts_identical_formula(self):
        result = _validate(
            [_premise("P")],
            _step("REIT", "P", [1]),
        )
        self.assertTrue(result.ok)

    def test_reit_rejects_different_formula(self):
        result = _validate(
            [_premise("P")],
            _step("REIT", "Q", [1]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class AssumeTests(SimpleTestCase):
    """Tests for ASSUME."""

    def test_assume_accepts_well_formed_formula(self):
        result = _validate(
            [],
            _step("ASSUME", "P", [], scope_path=[]),
        )
        self.assertTrue(result.ok)

    def test_assume_rejects_when_refs_provided(self):
        result = _validate(
            [_premise("P")],
            _step("ASSUME", "P", [1], scope_path=[]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


# ─── Scope visibility (context.py) ─────────────────────────────────────────────


class ScopeVisibilityTests(SimpleTestCase):
    """Tests for ``ProofContext.is_visible_from`` and helpers."""

    def _ctx(self, scope_paths):
        """Build a context with one ``P`` line per scope_path."""
        lines = []
        for sp in scope_paths:
            lines.append({"formula": "P", "kind": "premise", "scopePath": list(sp)})
        return ProofContext.from_payload(lines)

    def test_top_level_visible_from_top_level(self):
        ctx = self._ctx([()])
        self.assertTrue(ctx.is_visible_from(1, ()))

    def test_top_level_visible_from_subproof(self):
        ctx = self._ctx([()])
        self.assertTrue(ctx.is_visible_from(1, (3,)))

    def test_subproof_line_not_visible_from_top_level(self):
        ctx = self._ctx([(3,)])
        self.assertFalse(ctx.is_visible_from(1, ()))

    def test_outer_subproof_visible_from_inner(self):
        ctx = self._ctx([(3,)])
        self.assertTrue(ctx.is_visible_from(1, (3, 5)))

    def test_inner_subproof_not_visible_from_outer(self):
        ctx = self._ctx([(3, 5)])
        self.assertFalse(ctx.is_visible_from(1, (3,)))

    def test_out_of_range_line_raises_rule_error(self):
        ctx = self._ctx([()])
        with self.assertRaises(RuleError):
            ctx.is_visible_from(99, ())


# ─── Subproof operations (subproof_ops.py) ─────────────────────────────────────


class OpenSubproofTests(SimpleTestCase):
    """Tests for ``open_subproof_payload``."""

    def test_open_subproof_returns_assumption_goal_and_normalised(self):
        result = open_subproof_payload({"formula": "P → Q", "rule": "IMP_I"})
        self.assertTrue(result.ok)
        self.assertEqual(result.assumption, "P")
        self.assertEqual(result.goal, "Q")
        self.assertEqual(result.normalised, "P → Q")

    def test_open_subproof_rejects_non_implication(self):
        result = open_subproof_payload({"formula": "P ∧ Q", "rule": "IMP_I"})
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class CloseSubproofTests(SimpleTestCase):
    """Tests for ``close_subproof_payload``."""

    def test_close_subproof_returns_discharge_and_parent_scope(self):
        lines = [
            _assumption("P", 1),
            _derived("P", "REIT", [1], scope_path=[1]),
        ]
        result = close_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 0,
            "finalLineIndex": 1,
        })
        self.assertTrue(result.ok)
        self.assertEqual(result.formula, "P → P")
        self.assertEqual(result.refs, [1, 2])
        self.assertEqual(result.scope_path, [])

    def test_close_subproof_with_implication_discharge(self):
        # Genuine P → Q discharge: assume P, derive Q from premise P → Q.
        lines = [
            {"formula": "P → Q", "kind": "premise", "scopePath": []},
            _assumption("P", 2),
            _derived("Q", "IMP_E", [1, 2], scope_path=[2]),
        ]
        result = close_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
            "finalLineIndex": 2,
        })
        self.assertTrue(result.ok)
        self.assertEqual(result.formula, "P → Q")
        self.assertEqual(result.refs, [2, 3])
        self.assertEqual(result.scope_path, [])


# ─── Line operations (line_ops.py) ─────────────────────────────────────────────


class DeleteLineTests(SimpleTestCase):
    """Tests for ``delete_line_payload``."""

    def test_delete_last_line_removes_it(self):
        lines = [
            _premise("P"),
            _premise("Q"),
            _derived("P ∧ Q", "AND_I", [1, 2]),
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 2,
        })
        self.assertTrue(result.ok)
        self.assertEqual(len(result.updated_lines), 2)
        self.assertEqual(result.updated_lines[0]["formula"], "P")
        self.assertEqual(result.updated_lines[1]["formula"], "Q")
        self.assertEqual(result.flagged_line_nos, [])

    def test_delete_referenced_line_flags_dependent(self):
        lines = [
            _premise("P"),
            _derived("P ∨ Q", "OR_I1", [1]),
            _derived("P ∨ Q", "REIT", [2]),
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 1,  # remove the OR_I1 line
        })
        self.assertTrue(result.ok)
        self.assertEqual(len(result.updated_lines), 2)
        # Line 2 (formerly line 3) referenced the deleted line and must be flagged.
        self.assertIn(2, result.flagged_line_nos)
        self.assertEqual(result.updated_lines[1].get("brokenRef"), 2)


class DeleteSubproofTests(SimpleTestCase):
    """Tests for ``delete_subproof_payload``."""

    def test_delete_subproof_removes_assumption_body_and_discharge(self):
        lines = [
            _premise("P"),
            _assumption("Q", 2),
            _derived("P", "REIT", [1], scope_path=[2]),
            _derived("Q → P", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),
        ]
        result = delete_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Only the original premise should remain.
        self.assertEqual(len(result.updated_lines), 1)
        self.assertEqual(result.updated_lines[0]["formula"], "P")
        self.assertEqual(result.flagged_line_nos, [])


# ─── Proof completion (proof_checker.py) ───────────────────────────────────────


class ProofCheckerTests(SimpleTestCase):
    """Tests for ``check_proof_payload``."""

    def test_complete_when_conclusion_at_top_level(self):
        result = check_proof_payload({
            "proofState": {
                "premises": ["P"],
                "conclusion": "P",
                "lines": [_premise("P")],
            }
        })
        self.assertTrue(result.complete)
        self.assertTrue(result.goal_reached_top_level)

    def test_incomplete_when_conclusion_absent(self):
        result = check_proof_payload({
            "proofState": {
                "premises": ["P"],
                "conclusion": "Q",
                "lines": [_premise("P")],
            }
        })
        self.assertFalse(result.complete)
        self.assertFalse(result.goal_reached_top_level)

    def test_incomplete_when_only_inside_subproof(self):
        # Conclusion appears only at scopePath=[1], not at top level.
        result = check_proof_payload({
            "proofState": {
                "premises": [],
                "conclusion": "Q",
                "lines": [
                    _assumption("P", 1),
                    _derived("Q", "REIT", [1], scope_path=[1]),
                ],
            }
        })
        self.assertFalse(result.complete)
        self.assertFalse(result.goal_reached_top_level)
        self.assertTrue(result.goal_reached_somewhere)

    def test_no_conclusion_returns_not_ok(self):
        result = check_proof_payload({
            "proofState": {"conclusion": "", "lines": []}
        })
        self.assertFalse(result.ok)
        self.assertFalse(result.complete)

    def test_biconditional_partial_progress_hint(self):
        # Have one direction (P → Q) but not the other; expect a hint.
        result = check_proof_payload({
            "proofState": {
                "premises": ["P → Q"],
                "conclusion": "P ↔ Q",
                "lines": [_premise("P → Q")],
            }
        })
        self.assertFalse(result.complete)
        self.assertTrue(any("Partial progress" in h for h in result.hints))

    def test_biconditional_partial_progress_other_direction(self):
        result = check_proof_payload({
            "proofState": {
                "premises": ["Q → P"],
                "conclusion": "P ↔ Q",
                "lines": [_premise("Q → P")],
            }
        })
        self.assertFalse(result.complete)
        self.assertTrue(any("Partial progress" in h for h in result.hints))

    def test_implication_partial_progress_hint(self):
        # Conclusion is atomic Q; an implication ending in Q is present.
        result = check_proof_payload({
            "proofState": {
                "premises": ["P → Q"],
                "conclusion": "Q",
                "lines": [_premise("P → Q")],
            }
        })
        self.assertFalse(result.complete)
        self.assertTrue(any("Partial progress" in h for h in result.hints))


# ─── Tokenizer error path ──────────────────────────────────────────────────────


class TokenizerErrorTests(SimpleTestCase):
    def test_unexpected_character_raises_value_error(self):
        with self.assertRaises(ValueError):
            tokenize("@")


# ─── Parser trailing-token error ───────────────────────────────────────────────


class ParserTrailingTokenTests(SimpleTestCase):
    def test_trailing_tokens_after_expression_raise_parse_error(self):
        # "P Q" tokenises to two atoms with no operator — Pratt parser should
        # raise once the first atom is consumed and the next ATOM is found.
        with self.assertRaises(ParseError):
            parse_formula("P Q")


# ─── Printer edge cases ────────────────────────────────────────────────────────


class PrinterTests(SimpleTestCase):
    def test_formula_to_string_raises_for_unknown_node_type(self):
        with self.assertRaises(TypeError):
            formula_to_string("not a formula")

    def test_negation_wraps_in_parens_when_parent_prec_above_negation(self):
        # The only way to exercise the parenthesis wrapping for ¬ is to
        # call ``formula_to_string`` with an explicit ``parent_prec`` that
        # exceeds ¬'s precedence (5).  This branch is not reachable from
        # the public API, but we exercise it directly here.
        self.assertEqual(formula_to_string(Not(Atom("P")), parent_prec=6), "(¬P)")


# ─── Direct rule-function tests ────────────────────────────────────────────────


class RuleFunctionDirectTests(SimpleTestCase):
    """Exercise each ``raise RuleError`` branch in ``rules.py`` directly."""

    def test_and_elim_rejects_non_conjunction(self):
        with self.assertRaises(RuleError):
            and_elim(Atom("P"), 1)

    def test_or_intro_rejects_non_disjunction_proposed(self):
        with self.assertRaises(RuleError):
            or_intro(Atom("P"), Atom("P"), 1)

    def test_or_elim_requires_two_implications(self):
        with self.assertRaises(RuleError):
            or_elim(
                Atom("P"),                           # not an implication
                BinOp("→", Atom("Q"), Atom("R")),
                BinOp("∨", Atom("P"), Atom("Q")),
            )

    def test_or_elim_requires_disjunction(self):
        with self.assertRaises(RuleError):
            or_elim(
                BinOp("→", Atom("P"), Atom("R")),
                BinOp("→", Atom("Q"), Atom("R")),
                Atom("P"),                           # not a disjunction
            )

    def test_or_elim_requires_matching_consequents(self):
        with self.assertRaises(RuleError):
            or_elim(
                BinOp("→", Atom("P"), Atom("R")),
                BinOp("→", Atom("Q"), Atom("S")),    # consequents differ
                BinOp("∨", Atom("P"), Atom("Q")),
            )

    def test_or_elim_requires_antecedents_to_match_disjuncts(self):
        with self.assertRaises(RuleError):
            or_elim(
                BinOp("→", Atom("X"), Atom("R")),    # antecedents X, Y
                BinOp("→", Atom("Y"), Atom("R")),
                BinOp("∨", Atom("P"), Atom("Q")),    # disjunction P, Q
            )

    def test_imp_elim_rejects_unrelated_arguments(self):
        with self.assertRaises(RuleError):
            imp_elim(Atom("P"), Atom("Q"))

    def test_iff_elim_rejects_non_biconditional(self):
        with self.assertRaises(RuleError):
            iff_elim(Atom("P"))

    def test_iff_intro_rejects_non_implications(self):
        with self.assertRaises(RuleError):
            iff_intro(Atom("P"), Atom("Q"))

    def test_iff_intro_rejects_non_converse_implications(self):
        with self.assertRaises(RuleError):
            iff_intro(
                BinOp("→", Atom("P"), Atom("Q")),
                BinOp("→", Atom("R"), Atom("S")),
            )

    def test_neg_elim_requires_two_implications(self):
        with self.assertRaises(RuleError):
            neg_elim(Atom("P"), Atom("Q"))

    def test_neg_elim_requires_negated_antecedents(self):
        with self.assertRaises(RuleError):
            neg_elim(
                BinOp("→", Atom("P"), Atom("Q")),
                BinOp("→", Atom("P"), Not(Atom("Q"))),
            )

    def test_neg_elim_requires_matching_negated_antecedents(self):
        with self.assertRaises(RuleError):
            neg_elim(
                BinOp("→", Not(Atom("P")), Atom("Q")),
                BinOp("→", Not(Atom("R")), Not(Atom("Q"))),  # ¬R, not ¬P
            )

    def test_neg_elim_requires_b_and_not_b_consequents(self):
        with self.assertRaises(RuleError):
            neg_elim(
                BinOp("→", Not(Atom("P")), Atom("Q")),
                BinOp("→", Not(Atom("P")), Atom("R")),       # not ¬Q
            )

    def test_neg_intro_requires_two_implications(self):
        with self.assertRaises(RuleError):
            neg_intro(Atom("P"), Atom("Q"))

    def test_neg_intro_requires_matching_antecedents(self):
        with self.assertRaises(RuleError):
            neg_intro(
                BinOp("→", Atom("P"), Atom("Q")),
                BinOp("→", Atom("R"), Not(Atom("Q"))),
            )

    def test_neg_intro_requires_b_and_not_b_consequents(self):
        with self.assertRaises(RuleError):
            neg_intro(
                BinOp("→", Atom("P"), Atom("Q")),
                BinOp("→", Atom("P"), Atom("R")),
            )

    def test_reiteration_rejects_mismatched_formula(self):
        with self.assertRaises(RuleError):
            reiteration(Atom("P"), Atom("Q"))

    def test_and_intro_returns_conjunction(self):
        self.assertEqual(
            and_intro(Atom("P"), Atom("Q")),
            BinOp("∧", Atom("P"), Atom("Q")),
        )

    def test_imp_intro_returns_implication(self):
        self.assertEqual(
            imp_intro(Atom("P"), Atom("Q")),
            BinOp("→", Atom("P"), Atom("Q")),
        )

    def test_or_intro_accepts_left_match(self):
        self.assertTrue(
            or_intro(
                Atom("P"),
                BinOp("∨", Atom("P"), Atom("Q")),
                1,
            )
        )


# ─── Context error paths ───────────────────────────────────────────────────────


class ContextErrorTests(SimpleTestCase):
    def test_get_line_ast_with_bad_formula_raises_rule_error(self):
        ctx = ProofContext.from_payload([
            {"formula": "(P ∧", "kind": "premise", "scopePath": []},
        ])
        with self.assertRaises(RuleError):
            ctx.get_line_ast(1)

    def test_get_visible_line_ast_rejects_invisible_line(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "assumption", "scopePath": [1]},
        ])
        with self.assertRaises(RuleError):
            ctx.get_visible_line_ast(1, ())

    def test_is_assumption_line_returns_true_for_assumption(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "assumption", "scopePath": [1]},
        ])
        self.assertTrue(ctx.is_assumption_line(1))

    def test_assumption_parent_scope_returns_parent(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "premise", "scopePath": []},
            {"formula": "Q", "kind": "assumption", "scopePath": [2]},
        ])
        self.assertEqual(ctx.assumption_parent_scope(2), ())

    def test_assumption_parent_scope_rejects_non_assumption(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "premise", "scopePath": []},
        ])
        with self.assertRaises(RuleError):
            ctx.assumption_parent_scope(1)

    def test_assumption_parent_scope_rejects_invalid_scope_path(self):
        # Scope path doesn't end with the line number.
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "assumption", "scopePath": []},
        ])
        with self.assertRaises(RuleError):
            ctx.assumption_parent_scope(1)

    def test_resolve_ref_invalid_shape_raises(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "premise", "scopePath": []},
        ])
        with self.assertRaises(RuleError):
            ctx.resolve_ref("not-a-ref", ())

    def test_resolve_ref_range_start_must_be_assumption(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "premise", "scopePath": []},
            {"formula": "Q", "kind": "premise", "scopePath": []},
        ])
        with self.assertRaises(RuleError):
            ctx.resolve_ref([1, 2], ())

    def test_resolve_ref_range_assumption_must_have_valid_scope(self):
        # Assumption with a scopePath that doesn't end with its own line.
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "assumption", "scopePath": []},
            {"formula": "Q", "kind": "derived", "rule": "REIT",
             "refs": [1], "scopePath": []},
        ])
        with self.assertRaises(RuleError):
            ctx.resolve_ref([1, 2], ())

    def test_resolve_ref_range_end_must_come_after_start(self):
        ctx = ProofContext.from_payload([
            {"formula": "X", "kind": "premise", "scopePath": []},
            {"formula": "P", "kind": "assumption", "scopePath": [2]},
        ])
        with self.assertRaises(RuleError):
            ctx.resolve_ref([2, 2], ())

    def test_resolve_ref_range_end_must_be_inside_subproof(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "assumption", "scopePath": [1]},
            {"formula": "Q", "kind": "premise", "scopePath": []},  # outside
        ])
        with self.assertRaises(RuleError):
            ctx.resolve_ref([1, 2], ())

    def test_resolve_ref_range_rejects_when_subproof_still_active(self):
        ctx = ProofContext.from_payload([
            {"formula": "P", "kind": "assumption", "scopePath": [1]},
            {"formula": "P", "kind": "derived", "rule": "REIT",
             "refs": [1], "scopePath": [1]},
        ])
        # current_scope_path still inside the subproof at [1].
        with self.assertRaises(RuleError):
            ctx.resolve_ref([1, 2], (1,))


# ─── Step validator error and edge paths ───────────────────────────────────────


class StepValidatorErrorTests(SimpleTestCase):
    def test_no_rule_returns_rule_error(self):
        result = validate_step_payload({
            "proofState": {"lines": []},
            "proposedStep": {"formula": "P", "refs": [], "scopePath": []},
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_unknown_rule_returns_rule_error(self):
        result = _validate(
            [_premise("P")],
            _step("BOGUS", "P", [1]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_and_e1_with_wrong_ref_count(self):
        result = _validate([_premise("P ∧ Q")],
                           _step("AND_E1", "P", [1, 2]))
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_and_i_with_wrong_ref_count(self):
        result = _validate([_premise("P")],
                           _step("AND_I", "P ∧ Q", [1]))
        self.assertFalse(result.ok)

    def test_and_i_proposed_must_be_conjunction(self):
        result = _validate(
            [_premise("P"), _premise("Q")],
            _step("AND_I", "P", [1, 2]),
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_or_e_with_wrong_ref_count(self):
        result = _validate(
            [_premise("P → R"), _premise("Q → R")],
            _step("OR_E", "R", [1, 2]),
        )
        self.assertFalse(result.ok)

    def test_or_i_with_wrong_ref_count(self):
        result = _validate([_premise("P")],
                           _step("OR_I1", "P ∨ Q", []))
        self.assertFalse(result.ok)

    def test_imp_e_with_wrong_ref_count(self):
        result = _validate([_premise("P → Q")],
                           _step("IMP_E", "Q", [1]))
        self.assertFalse(result.ok)

    def test_iff_e_with_wrong_ref_count(self):
        result = _validate([_premise("P ↔ Q")],
                           _step("IFF_E", "(P → Q) ∧ (Q → P)", []))
        self.assertFalse(result.ok)

    def test_iff_i_with_wrong_ref_count(self):
        result = _validate([_premise("P → Q")],
                           _step("IFF_I", "P ↔ Q", [1]))
        self.assertFalse(result.ok)

    def test_neg_e_with_wrong_ref_count(self):
        result = _validate([_premise("¬P → Q")],
                           _step("NEG_E", "P", [1]))
        self.assertFalse(result.ok)

    def test_neg_i_with_wrong_ref_count(self):
        result = _validate([_premise("P → Q")],
                           _step("NEG_I", "¬P", [1]))
        self.assertFalse(result.ok)

    def test_reit_with_wrong_ref_count(self):
        result = _validate([_premise("P")],
                           _step("REIT", "P", []))
        self.assertFalse(result.ok)

    def test_reit_rejects_inaccessible_line(self):
        # Line 1 is in a subproof; reference from top level should fail.
        lines = [_assumption("P", 1)]
        result = _validate(lines, _step("REIT", "P", [1], scope_path=[]))
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_imp_i_invalid_ref_shape(self):
        result = _validate(
            [_assumption("P", 1),
             _derived("P", "REIT", [1], scope_path=[1])],
            _step("IMP_I", "P → P", [1, [2, 3]], scope_path=[]),
        )
        self.assertFalse(result.ok)


class ImpILegacyTwoIntRefsTests(SimpleTestCase):
    """Exercise the legacy IMP_I path using two integer refs."""

    def test_legacy_two_int_refs_accept(self):
        lines = [
            _assumption("P", 1),
            _derived("P", "REIT", [1], scope_path=[1]),
        ]
        result = _validate(lines,
                           _step("IMP_I", "P → P", [1, 2], scope_path=[]))
        self.assertTrue(result.ok)

    def test_legacy_first_ref_must_be_assumption(self):
        lines = [
            _premise("P"),
            _derived("P", "REIT", [1]),
        ]
        result = _validate(lines,
                           _step("IMP_I", "P → P", [1, 2], scope_path=[]))
        self.assertFalse(result.ok)

    def test_legacy_must_be_in_parent_scope(self):
        lines = [
            _assumption("P", 1),
            _derived("P", "REIT", [1], scope_path=[1]),
        ]
        # Wrong scope: not the parent of the discharged assumption.
        result = _validate(lines,
                           _step("IMP_I", "P → P", [1, 2], scope_path=[5]))
        self.assertFalse(result.ok)

    def test_legacy_final_must_be_inside_subproof(self):
        lines = [
            _assumption("P", 1),
            _premise("Q"),  # at top-level scope, not inside subproof [1]
        ]
        result = _validate(lines,
                           _step("IMP_I", "P → Q", [1, 2], scope_path=[]))
        self.assertFalse(result.ok)

    def test_legacy_final_must_come_after_assumption(self):
        lines = [
            _premise("X"),
            _assumption("P", 2),
            _derived("P", "REIT", [2], scope_path=[2]),
        ]
        # final_no=2 == assumption_no=2.
        result = _validate(lines,
                           _step("IMP_I", "P → P", [2, 2], scope_path=[]))
        self.assertFalse(result.ok)

    def test_legacy_assumption_with_invalid_scope_path(self):
        # Assumption whose scopePath doesn't end with its own line number.
        lines = [
            {"formula": "P", "kind": "assumption", "rule": "", "refs": [],
             "scopePath": [], "discharges": []},
            {"formula": "P", "kind": "derived", "rule": "REIT",
             "refs": [1], "scopePath": [], "discharges": []},
        ]
        result = _validate(lines,
                           _step("IMP_I", "P → P", [1, 2], scope_path=[]))
        self.assertFalse(result.ok)


# ─── validate_task_payload (used by /api/validate-task/) ───────────────────────


class ValidateTaskPayloadTests(SimpleTestCase):
    def test_validate_task_returns_normalised_premises_and_conclusion(self):
        result = validate_task_payload({
            "proofState": {
                "premises": ["P and Q", "Q -> R"],
                "conclusion": "P or R",
            }
        })
        self.assertTrue(result["ok"])
        self.assertEqual(result["premises"], ["P ∧ Q", "Q → R"])
        self.assertEqual(result["conclusion"], "P ∨ R")

    def test_validate_task_reports_premise_syntax_error(self):
        result = validate_task_payload({
            "proofState": {"premises": ["(P ∧"], "conclusion": "P"}
        })
        self.assertFalse(result["ok"])
        self.assertEqual(result["type"], "SYNTAX")

    def test_validate_task_reports_conclusion_syntax_error(self):
        result = validate_task_payload({
            "proofState": {"premises": ["P"], "conclusion": "(Q ∧"}
        })
        self.assertFalse(result["ok"])
        self.assertEqual(result["type"], "SYNTAX")


# ─── Subproof operations: open and close edge cases ────────────────────────────


class OpenSubproofErrorTests(SimpleTestCase):
    def test_no_formula_returns_syntax_error(self):
        result = open_subproof_payload({"formula": "", "rule": "IMP_I"})
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "SYNTAX")

    def test_wrong_rule_returns_rule_error(self):
        result = open_subproof_payload({"formula": "P → Q", "rule": "AND_I"})
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_syntax_error_in_formula(self):
        result = open_subproof_payload({"formula": "(P →", "rule": "IMP_I"})
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "SYNTAX")


class CloseSubproofErrorTests(SimpleTestCase):
    def test_missing_indices_returns_rule_error(self):
        result = close_subproof_payload({
            "proofState": {"lines": [_assumption("P", 1)]},
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_no_lines_returns_rule_error(self):
        result = close_subproof_payload({
            "proofState": {"lines": []},
            "assumptionLineIndex": 0,
            "finalLineIndex": 0,
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_target_not_an_assumption(self):
        lines = [_premise("P"), _derived("P", "REIT", [1])]
        result = close_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 0,
            "finalLineIndex": 1,
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_assumption_with_invalid_scope_path(self):
        lines = [
            {"formula": "P", "kind": "assumption", "rule": "", "refs": [],
             "scopePath": [], "discharges": []},
            {"formula": "P", "kind": "derived", "rule": "REIT", "refs": [1],
             "scopePath": [], "discharges": []},
        ]
        result = close_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 0,
            "finalLineIndex": 1,
        })
        self.assertFalse(result.ok)

    def test_final_line_must_come_after_assumption(self):
        lines = [
            _assumption("P", 1),
            _derived("P", "REIT", [1], scope_path=[1]),
        ]
        result = close_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 0,
            "finalLineIndex": 0,  # same line
        })
        self.assertFalse(result.ok)

    def test_final_line_must_be_inside_subproof(self):
        lines = [
            _assumption("P", 1),
            _premise("Q"),  # outside the subproof scope
        ]
        result = close_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 0,
            "finalLineIndex": 1,
        })
        self.assertFalse(result.ok)

    def test_out_of_range_index_returns_rule_error(self):
        lines = [_assumption("P", 1)]
        result = close_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 5,
            "finalLineIndex": 6,
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


# ─── delete_line_payload edge and cascade tests ────────────────────────────────


class DeleteLineErrorTests(SimpleTestCase):
    def test_missing_line_index_returns_input_error(self):
        result = delete_line_payload({
            "proofState": {"lines": [_premise("P")]},
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "INPUT")

    def test_line_index_out_of_range_returns_input_error(self):
        result = delete_line_payload({
            "proofState": {"lines": [_premise("P")]},
            "lineIndex": 99,
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "INPUT")

    def test_cannot_delete_premise(self):
        result = delete_line_payload({
            "proofState": {"lines": [_premise("P")]},
            "lineIndex": 0,
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_cascade_propagates_through_chain(self):
        # Delete a derived line referenced by another derived line which
        # is in turn referenced by a third — both downstream lines flag.
        lines = [
            _premise("P"),
            _derived("P ∨ Q", "OR_I1", [1]),    # references 1
            _derived("P ∨ Q", "REIT", [2]),     # references 2 — direct break
            _derived("P ∨ Q", "REIT", [3]),     # references 3 — cascade
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Both downstream lines (now at new line numbers 2 and 3) flagged.
        self.assertIn(2, result.flagged_line_nos)
        self.assertIn(3, result.flagged_line_nos)

    def test_delete_line_referenced_by_range_flags_imp_i(self):
        # Deleting a line inside a discharged subproof should auto-remove
        # the IMP_I line that depended on it.
        lines = [
            _premise("P → Q"),                                  # 1
            _assumption("P", 2),                                # 2
            _derived("Q", "IMP_E", [1, 2], scope_path=[2]),     # 3
            _derived("P → Q", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),            # 4
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 2,  # remove the Q line inside the subproof
        })
        self.assertTrue(result.ok)
        # The IMP_I line auto-removed; only the premise and the lingering
        # assumption remain.
        formulae = [ln["formula"] for ln in result.updated_lines]
        self.assertNotIn("P → Q", formulae[1:])  # IMP_I gone (only premise)
        self.assertEqual(formulae[0], "P → Q")
        self.assertEqual(formulae[1], "P")

    def test_cascade_through_discharge_dependency(self):
        # Build a proof where another line references the IMP_I via REIT,
        # then delete from inside the subproof — the IMP_I line is auto-
        # removed and the REIT line cascades as broken.
        lines = [
            _premise("P → Q"),                                  # 1
            _assumption("P", 2),                                # 2
            _derived("Q", "IMP_E", [1, 2], scope_path=[2]),     # 3
            _derived("P → Q", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),            # 4
            _derived("P → Q", "REIT", [4]),                     # 5
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 2,
        })
        self.assertTrue(result.ok)
        # The REIT line should now be flagged as cascade-broken.
        self.assertTrue(result.flagged_line_nos)


# ─── delete_subproof_payload edge tests ────────────────────────────────────────


class DeleteSubproofErrorTests(SimpleTestCase):
    def test_missing_assumption_index_returns_input_error(self):
        result = delete_subproof_payload({
            "proofState": {"lines": [_assumption("P", 1)]},
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "INPUT")

    def test_assumption_index_out_of_range_returns_input_error(self):
        result = delete_subproof_payload({
            "proofState": {"lines": [_assumption("P", 1)]},
            "assumptionLineIndex": 5,
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "INPUT")

    def test_target_must_be_assumption(self):
        result = delete_subproof_payload({
            "proofState": {"lines": [_premise("P")]},
            "assumptionLineIndex": 0,
        })
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_delete_subproof_with_external_dependent_flags_it(self):
        # An external REIT line references the discharge IMP_I line.
        lines = [
            _premise("P → Q"),                                  # 1
            _assumption("P", 2),                                # 2
            _derived("Q", "IMP_E", [1, 2], scope_path=[2]),     # 3
            _derived("P → Q", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),            # 4
            _derived("P → Q", "REIT", [4]),                     # 5
        ]
        result = delete_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Only the original premise remains, and the dangling REIT is flagged.
        self.assertEqual(len(result.updated_lines), 2)
        self.assertEqual(result.updated_lines[0]["formula"], "P → Q")
        self.assertEqual(result.updated_lines[1]["formula"], "P → Q")
        self.assertTrue(result.flagged_line_nos)


# ─── helpers tests ─────────────────────────────────────────────────────────────


class HelpersTests(SimpleTestCase):
    def test_count_distinct_vars_collects_atoms(self):
        ast = parse_formula("(P ∧ Q) ∨ (R → P)")
        self.assertEqual(count_distinct_vars([ast]), {"P", "Q", "R"})

    def test_count_distinct_vars_with_negation(self):
        ast = parse_formula("¬P")
        self.assertEqual(count_distinct_vars([ast]), {"P"})

    def test_parse_tree_depth_atom_is_one(self):
        self.assertEqual(parse_tree_depth(Atom("P")), 1)

    def test_parse_tree_depth_negation_adds_one(self):
        self.assertEqual(parse_tree_depth(Not(Atom("P"))), 2)

    def test_parse_tree_depth_binop_uses_deeper_branch(self):
        # ((P ∧ Q) → R) — left depth 2, right depth 1 → 1 + max(2, 1) = 3
        ast = parse_formula("(P ∧ Q) → R")
        self.assertEqual(parse_tree_depth(ast), 3)

    def test_parse_tree_depth_unknown_type_returns_one(self):
        # Fallback branch for non-AST inputs.
        self.assertEqual(parse_tree_depth("not an ast"), 1)


# ─── Coverage-targeted edge cases ──────────────────────────────────────────────


class StepValidatorIncorrectResultTests(SimpleTestCase):
    """The rule succeeds at the engine layer but the proposed formula
    does not match the expected result."""

    def test_or_e_incorrect_result(self):
        result = _validate(
            [_premise("P → R"), _premise("Q → R"), _premise("P ∨ Q")],
            _step("OR_E", "S", [1, 2, 3]),  # expected R, proposed S
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_imp_e_incorrect_result(self):
        result = _validate(
            [_premise("P → Q"), _premise("P")],
            _step("IMP_E", "S", [1, 2]),  # expected Q, proposed S
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_iff_i_incorrect_result(self):
        result = _validate(
            [_premise("P → Q"), _premise("Q → P")],
            _step("IFF_I", "R ↔ S", [1, 2]),  # expected P↔Q, proposed R↔S
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")

    def test_neg_e_incorrect_result(self):
        result = _validate(
            [_premise("¬P → Q"), _premise("¬P → ¬Q")],
            _step("NEG_E", "S", [1, 2]),  # expected P, proposed S
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.type, "RULE")


class RuleAlternateBranchTests(SimpleTestCase):
    """Hit the second-case branches in MP / ¬E / ¬I that swap argument order."""

    def test_imp_elim_swapped_argument_order(self):
        # imp_elim(A, A→B) — exercises the second case.
        self.assertEqual(
            imp_elim(Atom("P"), BinOp("→", Atom("P"), Atom("Q"))),
            Atom("Q"),
        )

    def test_neg_elim_first_case_when_ast1_right_is_negated(self):
        # ast1=¬P→¬Q, ast2=¬P→Q ⇒ first branch (ast1.right is Not) fires.
        self.assertEqual(
            neg_elim(
                BinOp("→", Not(Atom("P")), Not(Atom("Q"))),
                BinOp("→", Not(Atom("P")), Atom("Q")),
            ),
            Atom("P"),
        )

    def test_neg_intro_first_case_when_ast1_right_is_negated(self):
        # ast1=P→¬Q, ast2=P→Q ⇒ first branch fires.
        self.assertEqual(
            neg_intro(
                BinOp("→", Atom("P"), Not(Atom("Q"))),
                BinOp("→", Atom("P"), Atom("Q")),
            ),
            Not(Atom("P")),
        )


class GetVisibleLineAstHappyPathTests(SimpleTestCase):
    def test_returns_ast_for_visible_line(self):
        ctx = ProofContext.from_payload([
            {"formula": "P ∧ Q", "kind": "premise", "scopePath": []},
        ])
        ast = ctx.get_visible_line_ast(1, ())
        self.assertEqual(ast, BinOp("∧", Atom("P"), Atom("Q")))


class ProofCheckerExceptionPathsTests(SimpleTestCase):
    def test_top_level_line_with_syntax_error_is_skipped(self):
        # Conclusion parses fine and is atomic; one top-level line is
        # malformed — its ``parse_formula`` fails and is skipped silently.
        result = check_proof_payload({
            "proofState": {
                "premises": [],
                "conclusion": "Q",
                "lines": [
                    {"formula": "P", "kind": "premise", "scopePath": []},
                    {"formula": "(P ∧", "kind": "premise", "scopePath": []},
                ],
            }
        })
        self.assertFalse(result.complete)

    def test_malformed_conclusion_in_partial_progress_swallowed(self):
        # Conclusion fails to parse — the outer try/except in the
        # partial-progress block silently swallows the error.
        result = check_proof_payload({
            "proofState": {
                "premises": [],
                "conclusion": "(P",
                "lines": [{"formula": "P", "kind": "premise", "scopePath": []}],
            }
        })
        self.assertFalse(result.complete)


class DeleteLineCascadeTests(SimpleTestCase):
    """Exercise the cascade-via-refs and cascade-via-discharges branches."""

    def test_cascade_through_discharges_field(self):
        # Line 3 directly breaks when line 2 is deleted; line 4 has a
        # ``discharges`` field referencing the (now-broken) line 3 — the
        # cascade marks line 4 via the discharges branch.
        lines = [
            _premise("P"),                                     # 1
            _derived("P", "REIT", [1]),                        # 2 — to delete
            _derived("P", "REIT", [2]),                        # 3 — direct break
            {"formula": "P", "kind": "derived", "rule": "REIT",
             "refs": [1], "scopePath": [], "discharges": [3]}, # 4 — discharges→3
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Line 4 (now line 3) is flagged via the discharges cascade.
        self.assertIn(3, result.flagged_line_nos)

    def test_range_ref_triggers_cascade_via_ref_is_broken(self):
        # Line 4 directly breaks; line 5 has a range ref [[3, 4]] that
        # overlaps line 4 — the cascade marks line 5 via the range-aware
        # ``ref_is_broken`` branch.
        lines = [
            _premise("P"),                                          # 1
            _derived("P", "REIT", [1]),                             # 2 — to delete
            _assumption("P", 3),                                    # 3
            _derived("P", "REIT", [2], scope_path=[3]),             # 4 — direct break
            _derived("P → P", "IMP_I", [[3, 4]],
                     scope_path=[], discharges=[3]),                # 5 — range over 3..4
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Cascade flagged the IMP_I and it was auto-removed; the
        # remaining lines should reflect that.
        self.assertTrue(result.flagged_line_nos or len(result.updated_lines) < 4)


class DeleteSubproofCascadeTests(SimpleTestCase):
    """Exercise cascade branches inside ``delete_subproof_payload``."""

    def test_cascade_via_refs_in_delete_subproof(self):
        lines = [
            _premise("P → Q"),                                       # 1
            _assumption("P", 2),                                     # 2
            _derived("Q", "IMP_E", [1, 2], scope_path=[2]),          # 3
            _derived("P → Q", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),                 # 4
            _derived("P → Q", "REIT", [4]),                          # 5 — direct
            _derived("P → Q", "REIT", [5]),                          # 6 — cascade
        ]
        result = delete_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Both downstream lines flagged.
        self.assertEqual(len(result.flagged_line_nos), 2)

    def test_cascade_via_discharges_in_delete_subproof(self):
        lines = [
            _premise("P → Q"),                                       # 1
            _assumption("P", 2),                                     # 2
            _derived("Q", "IMP_E", [1, 2], scope_path=[2]),          # 3
            _derived("P → Q", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),                 # 4
            _derived("P → Q", "REIT", [4]),                          # 5 — direct
            {"formula": "X", "kind": "derived", "rule": "REIT",
             "refs": [1], "scopePath": [], "discharges": [5]},       # 6 — discharges→5
        ]
        result = delete_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Line 6 (now at new line 3) flagged via discharges cascade.
        self.assertIn(3, result.flagged_line_nos)

    def test_imp_i_removal_renumbers_kept_line_with_range_refs(self):
        # During IMP_I auto-removal a kept (non-IMP_I) line carries a
        # range ref that is unaffected by the removal — exercises the
        # ``_rr`` and ``_touches`` helpers for range refs.
        lines = [
            _premise("P"),                                              # 1
            _assumption("P", 2),                                        # 2
            _derived("P", "REIT", [1], scope_path=[2]),                 # 3
            _derived("P → P", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),                    # 4
            {"formula": "X", "kind": "derived", "rule": "REIT",
             "refs": [[1, 1]], "scopePath": [], "discharges": []},      # 5
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 2,  # delete the body line, breaks IMP_I
        })
        self.assertTrue(result.ok)
        # The IMP_I is auto-removed; the standalone REIT with the range
        # ref survives unbroken.
        formulae = [ln["formula"] for ln in result.updated_lines]
        self.assertIn("X", formulae)

    def test_imp_i_removal_with_kept_line_having_int_refs(self):
        # Same shape but the surviving line has an integer ref —
        # exercises the int branch of ``_touches`` inside the
        # IMP_I auto-removal block.
        lines = [
            _premise("P"),                                              # 1
            _assumption("P", 2),                                        # 2
            _derived("P", "REIT", [1], scope_path=[2]),                 # 3
            _derived("P → P", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),                    # 4
            {"formula": "X", "kind": "derived", "rule": "REIT",
             "refs": [1], "scopePath": [], "discharges": []},           # 5
        ]
        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 2,
        })
        self.assertTrue(result.ok)
        formulae = [ln["formula"] for ln in result.updated_lines]
        self.assertIn("X", formulae)

    def test_range_cascade_in_delete_subproof(self):
        lines = [
            _premise("P"),                                           # 1
            _assumption("Q", 2),                                     # 2
            _derived("Q", "REIT", [2], scope_path=[2]),              # 3
            _derived("Q → Q", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),                 # 4
            _derived("Q → Q", "REIT", [4]),                          # 5 — direct
            {"formula": "foo", "kind": "derived", "rule": "REIT",
             "refs": [[5, 5]], "scopePath": [], "discharges": []},   # 6 — range
        ]
        result = delete_subproof_payload({
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertTrue(result.ok)
        # Both line 5 (direct) and line 6 (range cascade) end up flagged.
        self.assertEqual(len(result.flagged_line_nos), 2)


class TestLineOps(SimpleTestCase):
    """Targeted coverage tests for the inner re-cascade in
    ``delete_line_payload``'s Step 3 IMP_I auto-removal block."""

    def test_delete_line_cascade_through_broken_impi(self):
        # Line 1: A             (premise,    scope=[])
        # Line 2: A → B         (premise,    scope=[])
        # Line 3: A             (assumption, scope=[3])
        # Line 4: B             (IMP_E [2,3], scope=[3])
        # Line 5: A → B         (IMP_I [3,4] discharges=[3], scope=[])
        # Line 6: C             (REIT [5], scope=[])
        lines = [
            _premise("A"),
            _premise("A → B"),
            _assumption("A", 3),
            _derived("B", "IMP_E", [2, 3], scope_path=[3]),
            _derived("A → B", "IMP_I", [3, 4],
                     scope_path=[], discharges=[3]),
            _derived("C", "REIT", [5]),
        ]

        result = delete_line_payload({
            "proofState": {"lines": lines},
            "lineIndex": 3,  # delete line 4 (the IMP_E body)
        })

        self.assertTrue(result.ok)

        # Lines 4 (the IMP_E body) and 5 (the broken →I) are gone — the
        # IMP_I auto-removed in Step 3, and the deleted body was the
        # explicit target.
        formulae = [ln["formula"] for ln in result.updated_lines]
        self.assertEqual(formulae, ["A", "A → B", "A", "C"])

        # Line 6 (the REIT) survives but is flagged as cascade-broken
        # because it referenced the now-vanished →I.
        c_line = result.updated_lines[-1]
        self.assertEqual(c_line["formula"], "C")
        self.assertIsNotNone(c_line.get("brokenRef"))
        self.assertEqual(c_line.get("brokenKind"), "cascade")
