"""Integration tests for every API view module.

URLs are taken verbatim from ``api/urls.py``.  Note that the auth
endpoints live under ``/api/auth/...`` and the formula normaliser is
exposed at ``/api/normalise/`` (not ``/api/normalise-formula/``).
"""

import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from api.models import Proof
from api.services.proof_service import create_proof


User = get_user_model()


# ─── Helpers ───────────────────────────────────────────────────────────────────


def _post(client, path, payload):
    return client.post(
        path,
        data=json.dumps(payload),
        content_type="application/json",
    )


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


# ─── Auth views ────────────────────────────────────────────────────────────────


class AuthViewTests(TestCase):
    """Tests for register, login, logout, and me endpoints."""

    REGISTER_URL = "/api/auth/register"
    LOGIN_URL = "/api/auth/login"
    LOGOUT_URL = "/api/auth/logout"
    ME_URL = "/api/auth/me"

    def test_register_creates_user_and_returns_201(self):
        client = Client()
        resp = _post(
            client,
            self.REGISTER_URL,
            {"username": "alice", "password": "StrongPass!9k"},
        )
        # Django's create flow returns 201 on success.
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["username"], "alice")
        self.assertTrue(User.objects.filter(username="alice").exists())

    def test_login_with_correct_credentials_returns_200(self):
        User.objects.create_user(username="alice", password="StrongPass!9k")
        client = Client()
        resp = _post(
            client,
            self.LOGIN_URL,
            {"username": "alice", "password": "StrongPass!9k"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["username"], "alice")

    def test_login_with_wrong_password_is_rejected(self):
        User.objects.create_user(username="alice", password="StrongPass!9k")
        client = Client()
        resp = _post(
            client,
            self.LOGIN_URL,
            {"username": "alice", "password": "wrong"},
        )
        # ``login_view`` returns 401 for bad credentials.
        self.assertEqual(resp.status_code, 401)
        self.assertFalse(resp.json()["ok"])

    def test_logout_clears_session(self):
        User.objects.create_user(username="alice", password="StrongPass!9k")
        client = Client()
        client.login(username="alice", password="StrongPass!9k")

        # Confirm session is established before logout.
        me = client.get(self.ME_URL)
        self.assertEqual(me.json()["username"], "alice")

        resp = _post(client, self.LOGOUT_URL, {})
        self.assertEqual(resp.status_code, 200)

        me_after = client.get(self.ME_URL)
        self.assertIsNone(me_after.json()["username"])

    def test_me_returns_username_when_authenticated(self):
        User.objects.create_user(username="alice", password="StrongPass!9k")
        client = Client()
        client.login(username="alice", password="StrongPass!9k")
        resp = client.get(self.ME_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["username"], "alice")

    def test_me_returns_null_username_when_unauthenticated(self):
        # The current implementation returns 200 with username=None for
        # anonymous callers (rather than 401).  We assert the actual
        # contract.
        client = Client()
        resp = client.get(self.ME_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["username"])


# ─── Validation views ──────────────────────────────────────────────────────────


class ValidationViewTests(TestCase):
    """Tests for validate-step, normalise, and check-proof endpoints."""

    VALIDATE_STEP_URL = "/api/validate-step"
    NORMALISE_URL = "/api/normalise/"
    CHECK_PROOF_URL = "/api/check-proof"

    def test_valid_step_returns_ok_with_normalised_formula(self):
        payload = {
            "proofState": {"lines": [_premise("P ∧ Q")]},
            "proposedStep": {
                "rule": "AND_E1", "formula": "P", "refs": [1], "scopePath": [],
            },
        }
        resp = _post(Client(), self.VALIDATE_STEP_URL, payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertIn("normalised", data)
        self.assertEqual(data["normalised"], "P")

    def test_invalid_rule_application_returns_rule_error(self):
        payload = {
            "proofState": {"lines": [_premise("P ∧ Q")]},
            "proposedStep": {
                "rule": "AND_E1", "formula": "Q", "refs": [1], "scopePath": [],
            },
        }
        resp = _post(Client(), self.VALIDATE_STEP_URL, payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["ok"])
        self.assertEqual(data["type"], "RULE")

    def test_malformed_references_return_rule_error(self):
        # A reference that does not point to an existing line is
        # surfaced as a RULE error by the engine (RuleError("Referenced
        # line N does not exist.")).
        payload = {
            "proofState": {"lines": [_premise("P ∧ Q")]},
            "proposedStep": {
                "rule": "AND_E1", "formula": "P", "refs": [99], "scopePath": [],
            },
        }
        resp = _post(Client(), self.VALIDATE_STEP_URL, payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["ok"])
        self.assertEqual(data["type"], "RULE")

    def test_syntax_error_in_formula_returns_syntax_error(self):
        payload = {
            "proofState": {"lines": [_premise("P ∧ Q")]},
            "proposedStep": {
                "rule": "AND_E1", "formula": "(P ∧", "refs": [1], "scopePath": [],
            },
        }
        resp = _post(Client(), self.VALIDATE_STEP_URL, payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["ok"])
        self.assertEqual(data["type"], "SYNTAX")

    def test_normalise_returns_canonical_unicode_form(self):
        resp = _post(Client(), self.NORMALISE_URL, {"formula": "P and Q"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["normalised"], "P ∧ Q")

    def test_check_proof_returns_complete_when_at_top_level(self):
        payload = {
            "proofState": {
                "premises": ["P"],
                "conclusion": "P",
                "lines": [_premise("P")],
            }
        }
        resp = _post(Client(), self.CHECK_PROOF_URL, payload)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["complete"])

    def test_check_proof_returns_incomplete_when_goal_missing(self):
        payload = {
            "proofState": {
                "premises": ["P"],
                "conclusion": "Q",
                "lines": [_premise("P")],
            }
        }
        resp = _post(Client(), self.CHECK_PROOF_URL, payload)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["complete"])


# ─── Operations views ──────────────────────────────────────────────────────────


class OperationsViewTests(TestCase):
    """Tests for open-subproof, close-subproof, and delete-line endpoints."""

    OPEN_URL = "/api/open-subproof"
    CLOSE_URL = "/api/close-subproof"
    DELETE_LINE_URL = "/api/delete-line"

    def test_open_subproof_returns_assumption_goal_and_scope_path(self):
        resp = _post(Client(), self.OPEN_URL, {"formula": "P → Q", "rule": "IMP_I"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["assumption"], "P")
        self.assertEqual(data["goal"], "Q")
        self.assertEqual(data["normalised"], "P → Q")

    def test_close_subproof_returns_discharge_and_parent_scope(self):
        lines = [
            _assumption("P", 1),
            _derived("P", "REIT", [1], scope_path=[1]),
        ]
        resp = _post(Client(), self.CLOSE_URL, {
            "proofState": {"lines": lines},
            "assumptionLineIndex": 0,
            "finalLineIndex": 1,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["formula"], "P → P")
        self.assertEqual(data["refs"], [1, 2])
        self.assertEqual(data["scopePath"], [])

    def test_delete_line_returns_updated_lines_and_flagged_line_nos(self):
        lines = [
            _premise("P"),
            _derived("P ∨ Q", "OR_I1", [1]),
            _derived("P ∨ Q", "REIT", [2]),
        ]
        resp = _post(Client(), self.DELETE_LINE_URL, {
            "proofState": {"lines": lines},
            "lineIndex": 1,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["updatedLines"]), 2)
        self.assertIn("flaggedLineNos", data)
        self.assertIn(2, data["flaggedLineNos"])


# ─── Proofs views ──────────────────────────────────────────────────────────────


class ProofsViewTests(TestCase):
    """Tests for /api/proofs/ collection and detail endpoints."""

    LIST_URL = "/api/proofs/"

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", password="StrongPass!9k"
        )
        self.bob = User.objects.create_user(
            username="bob", password="StrongPass!9k"
        )

    def test_unauthenticated_get_returns_401(self):
        resp = Client().get(self.LIST_URL)
        self.assertEqual(resp.status_code, 401)

    def test_authenticated_user_can_create_a_proof(self):
        client = Client()
        client.login(username="alice", password="StrongPass!9k")
        payload = {
            "title": "Trivial",
            "proofState": {
                "premises": ["P"],
                "conclusion": "P",
                "lines": [_premise("P")],
            },
        }
        resp = _post(client, self.LIST_URL, payload)
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["proof"]["title"], "Trivial")
        self.assertTrue(Proof.objects.filter(user=self.alice).exists())

    def test_authenticated_user_can_retrieve_own_proof(self):
        proof = create_proof(
            self.alice,
            "Mine",
            ["P"],
            "P",
            [_premise("P")],
        )
        client = Client()
        client.login(username="alice", password="StrongPass!9k")
        resp = client.get(f"/api/proofs/{proof.id}/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["proof"]["id"], proof.id)
        self.assertEqual(data["proof"]["title"], "Mine")

    def test_authenticated_user_cannot_retrieve_other_users_proof(self):
        bob_proof = create_proof(self.bob, "Bobs", ["P"], "P", [_premise("P")])
        client = Client()
        client.login(username="alice", password="StrongPass!9k")
        resp = client.get(f"/api/proofs/{bob_proof.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_authenticated_user_can_delete_own_proof(self):
        proof = create_proof(self.alice, "Mine", ["P"], "P", [_premise("P")])
        client = Client()
        client.login(username="alice", password="StrongPass!9k")
        resp = client.delete(f"/api/proofs/{proof.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Proof.objects.filter(id=proof.id).exists())

    def test_is_complete_set_correctly_on_save(self):
        client = Client()
        client.login(username="alice", password="StrongPass!9k")

        complete_payload = {
            "title": "Complete",
            "proofState": {
                "premises": ["P"],
                "conclusion": "P",
                "lines": [_premise("P")],
            },
        }
        resp = _post(client, self.LIST_URL, complete_payload)
        self.assertTrue(resp.json()["proof"]["is_complete"])

        incomplete_payload = {
            "title": "Incomplete",
            "proofState": {
                "premises": ["P"],
                "conclusion": "Q",
                "lines": [_premise("P")],
            },
        }
        resp = _post(client, self.LIST_URL, incomplete_payload)
        self.assertFalse(resp.json()["proof"]["is_complete"])


# ─── Problems view ─────────────────────────────────────────────────────────────


class ProblemsViewTests(TestCase):
    """Tests for the /api/random-task/ endpoint."""

    URL = "/api/random-task/"

    def test_returns_problem_with_required_fields(self):
        resp = Client().get(self.URL)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        for key in ("premises", "conclusion", "difficulty"):
            self.assertIn(key, data)

    def test_easy_difficulty_filter(self):
        resp = Client().get(self.URL + "?difficulty=easy")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["difficulty"], "easy")

    def test_hard_difficulty_filter(self):
        resp = Client().get(self.URL + "?difficulty=hard")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["difficulty"], "hard")

    def test_post_returns_405(self):
        resp = Client().post(self.URL)
        self.assertEqual(resp.status_code, 405)

    def test_invalid_difficulty_returns_400(self):
        resp = Client().get(self.URL + "?difficulty=mythic")
        self.assertEqual(resp.status_code, 400)


# ─── Auth view edge cases ──────────────────────────────────────────────────────


class AuthEdgeTests(TestCase):
    """Non-POST methods, malformed JSON, invalid input, etc."""

    REGISTER_URL = "/api/auth/register"
    LOGIN_URL = "/api/auth/login"
    LOGOUT_URL = "/api/auth/logout"
    ME_URL = "/api/auth/me"

    def test_register_get_returns_405(self):
        resp = Client().get(self.REGISTER_URL)
        self.assertEqual(resp.status_code, 405)

    def test_register_invalid_json_returns_400(self):
        resp = Client().post(
            self.REGISTER_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_register_missing_fields_returns_400(self):
        resp = _post(Client(), self.REGISTER_URL, {"username": "alice"})
        self.assertEqual(resp.status_code, 400)

    def test_register_invalid_username_returns_400(self):
        resp = _post(
            Client(),
            self.REGISTER_URL,
            {"username": "no spaces!", "password": "StrongPass!9k"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_register_taken_username_returns_400(self):
        User.objects.create_user(username="alice", password="StrongPass!9k")
        resp = _post(
            Client(),
            self.REGISTER_URL,
            {"username": "alice", "password": "StrongPass!9k"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_register_weak_password_returns_400(self):
        resp = _post(
            Client(),
            self.REGISTER_URL,
            {"username": "newuser", "password": "1234"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_login_get_returns_405(self):
        resp = Client().get(self.LOGIN_URL)
        self.assertEqual(resp.status_code, 405)

    def test_login_invalid_json_returns_400(self):
        resp = Client().post(
            self.LOGIN_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_logout_get_returns_405(self):
        resp = Client().get(self.LOGOUT_URL)
        self.assertEqual(resp.status_code, 405)

    def test_me_post_returns_405(self):
        resp = Client().post(self.ME_URL)
        self.assertEqual(resp.status_code, 405)


# ─── Validation views — non-happy paths ────────────────────────────────────────


class ValidationViewEdgeTests(TestCase):
    VALIDATE_STEP_URL = "/api/validate-step"
    VALIDATE_TASK_URL = "/api/validate-task/"
    NORMALISE_URL = "/api/normalise/"
    CHECK_PROOF_URL = "/api/check-proof"

    def test_validate_step_get_returns_405(self):
        resp = Client().get(self.VALIDATE_STEP_URL)
        self.assertEqual(resp.status_code, 405)

    def test_validate_step_invalid_json_returns_400(self):
        resp = Client().post(
            self.VALIDATE_STEP_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_normalise_get_returns_405(self):
        resp = Client().get(self.NORMALISE_URL)
        self.assertEqual(resp.status_code, 405)

    def test_normalise_invalid_json_returns_200_with_error_payload(self):
        # The view catches JSON errors and returns 200 with ok=False.
        resp = Client().post(
            self.NORMALISE_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["ok"])

    def test_check_proof_get_returns_405(self):
        resp = Client().get(self.CHECK_PROOF_URL)
        self.assertEqual(resp.status_code, 405)

    def test_check_proof_invalid_json_returns_400(self):
        resp = Client().post(
            self.CHECK_PROOF_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_validate_task_returns_normalised_payload(self):
        resp = _post(
            Client(),
            self.VALIDATE_TASK_URL,
            {"proofState": {"premises": ["P and Q"], "conclusion": "P or Q"}},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["premises"], ["P ∧ Q"])
        self.assertEqual(data["conclusion"], "P ∨ Q")

    def test_validate_task_get_returns_405(self):
        resp = Client().get(self.VALIDATE_TASK_URL)
        self.assertEqual(resp.status_code, 405)

    def test_validate_task_invalid_json_returns_400(self):
        resp = Client().post(
            self.VALIDATE_TASK_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_validate_task_syntax_error_returns_400(self):
        resp = _post(
            Client(),
            self.VALIDATE_TASK_URL,
            {"proofState": {"premises": ["(P ∧"], "conclusion": "P"}},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["type"], "SYNTAX")

    def test_validate_task_too_many_distinct_vars_returns_400(self):
        resp = _post(
            Client(),
            self.VALIDATE_TASK_URL,
            {"proofState": {
                "premises": ["A ∧ B ∧ C ∧ D ∧ E ∧ F"],
                "conclusion": "A",
            }},
        )
        self.assertEqual(resp.status_code, 400)

    def test_validate_task_too_deeply_nested_returns_400(self):
        # Depth > 5: nest implications six deep.
        deep = "((((((P → Q) → Q) → Q) → Q) → Q) → Q)"
        resp = _post(
            Client(),
            self.VALIDATE_TASK_URL,
            {"proofState": {"premises": [deep], "conclusion": "P"}},
        )
        self.assertEqual(resp.status_code, 400)


# ─── Operations views — non-happy paths and delete-subproof ───────────────────


class OperationsViewEdgeTests(TestCase):
    OPEN_URL = "/api/open-subproof"
    CLOSE_URL = "/api/close-subproof"
    DELETE_LINE_URL = "/api/delete-line"
    DELETE_SUBPROOF_URL = "/api/delete-subproof"

    def test_open_subproof_get_returns_405(self):
        self.assertEqual(Client().get(self.OPEN_URL).status_code, 405)

    def test_open_subproof_invalid_json_returns_400(self):
        resp = Client().post(
            self.OPEN_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_open_subproof_non_implication_returns_400(self):
        resp = _post(Client(), self.OPEN_URL,
                     {"formula": "P ∧ Q", "rule": "IMP_I"})
        self.assertEqual(resp.status_code, 400)

    def test_close_subproof_get_returns_405(self):
        self.assertEqual(Client().get(self.CLOSE_URL).status_code, 405)

    def test_close_subproof_invalid_json_returns_400(self):
        resp = Client().post(
            self.CLOSE_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_close_subproof_invalid_payload_returns_400(self):
        # Missing assumptionLineIndex / finalLineIndex.
        resp = _post(Client(), self.CLOSE_URL, {"proofState": {"lines": []}})
        self.assertEqual(resp.status_code, 400)

    def test_delete_line_get_returns_405(self):
        self.assertEqual(Client().get(self.DELETE_LINE_URL).status_code, 405)

    def test_delete_line_invalid_json_returns_400(self):
        resp = Client().post(
            self.DELETE_LINE_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_delete_line_premise_returns_400(self):
        resp = _post(Client(), self.DELETE_LINE_URL, {
            "proofState": {"lines": [_premise("P")]},
            "lineIndex": 0,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()["ok"])

    def test_delete_subproof_happy_path(self):
        lines = [
            _premise("P"),
            _assumption("Q", 2),
            _derived("P", "REIT", [1], scope_path=[2]),
            _derived("Q → P", "IMP_I", [[2, 3]],
                     scope_path=[], discharges=[2]),
        ]
        resp = _post(Client(), self.DELETE_SUBPROOF_URL, {
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["updatedLines"]), 1)

    def test_delete_subproof_get_returns_405(self):
        self.assertEqual(
            Client().get(self.DELETE_SUBPROOF_URL).status_code, 405,
        )

    def test_delete_subproof_invalid_json_returns_400(self):
        resp = Client().post(
            self.DELETE_SUBPROOF_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_delete_subproof_target_not_assumption_returns_400(self):
        resp = _post(Client(), self.DELETE_SUBPROOF_URL, {
            "proofState": {"lines": [_premise("P")]},
            "assumptionLineIndex": 0,
        })
        self.assertEqual(resp.status_code, 400)


# ─── Proofs views — additional flows ───────────────────────────────────────────


class ProofsViewEdgeTests(TestCase):
    LIST_URL = "/api/proofs/"

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", password="StrongPass!9k"
        )

    def _login(self):
        client = Client()
        client.login(username="alice", password="StrongPass!9k")
        return client

    def test_authenticated_get_list_returns_user_proofs(self):
        create_proof(self.alice, "First", [], "P", [_premise("P")])
        create_proof(self.alice, "Second", [], "P", [_premise("P")])
        resp = self._login().get(self.LIST_URL)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        titles = [p["title"] for p in data["proofs"]]
        self.assertIn("First", titles)
        self.assertIn("Second", titles)

    def test_collection_invalid_json_returns_400(self):
        resp = self._login().post(
            self.LIST_URL,
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_collection_method_not_allowed(self):
        # Only GET and POST are accepted on /api/proofs/.
        resp = self._login().delete(self.LIST_URL)
        self.assertEqual(resp.status_code, 405)

    def test_detail_unauthenticated_returns_401(self):
        proof = create_proof(self.alice, "Mine", [], "P", [_premise("P")])
        resp = Client().get(f"/api/proofs/{proof.id}/")
        self.assertEqual(resp.status_code, 401)

    def test_detail_method_not_allowed(self):
        proof = create_proof(self.alice, "Mine", [], "P", [_premise("P")])
        resp = self._login().post(f"/api/proofs/{proof.id}/")
        self.assertEqual(resp.status_code, 405)

    def test_put_updates_proof_state_and_recomputes_completion(self):
        proof = create_proof(
            self.alice,
            "Initial",
            ["P"],
            "Q",
            [_premise("P")],
        )
        self.assertFalse(proof.is_complete)
        client = self._login()
        resp = client.put(
            f"/api/proofs/{proof.id}/",
            data=json.dumps({
                "title": "Updated",
                "proofState": {
                    "premises": ["P"],
                    "conclusion": "P",
                    "lines": [_premise("P")],
                },
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["proof"]["is_complete"])
        self.assertEqual(data["proof"]["title"], "Updated")

    def test_put_with_only_title_preserves_completion_state(self):
        proof = create_proof(
            self.alice, "Initial", ["P"], "P", [_premise("P")],
        )
        self.assertTrue(proof.is_complete)
        client = self._login()
        resp = client.put(
            f"/api/proofs/{proof.id}/",
            data=json.dumps({"title": "Only Title"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        proof.refresh_from_db()
        self.assertEqual(proof.title, "Only Title")
        self.assertTrue(proof.is_complete)

    def test_put_invalid_json_returns_400(self):
        proof = create_proof(self.alice, "P", [], "P", [_premise("P")])
        resp = self._login().put(
            f"/api/proofs/{proof.id}/",
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
