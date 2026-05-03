"""End-to-end proof construction flows exercised via the API."""

import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from api.models import Proof


User = get_user_model()


def _post(client, path, payload):
    return client.post(
        path,
        data=json.dumps(payload),
        content_type="application/json",
    )


def _premise(formula):
    return {"formula": formula, "kind": "premise", "rule": "", "refs": [],
            "scopePath": [], "discharges": []}


# ─── Flow 1 — Build a complete proof through the API ──────────────────────────


class CompleteProofFlowTests(TestCase):
    """Build P → Q, Q → R ⊢ P → R end-to-end through the API."""

    def test_complete_proof_via_api(self):
        client = Client()

        # Initial proof state (premises only).
        lines = [
            _premise("P → Q"),
            _premise("Q → R"),
        ]
        conclusion = "P → R"

        # Step 1 — open the →I subproof.
        resp = _post(client, "/api/open-subproof",
                     {"formula": "P → R", "rule": "IMP_I"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["assumption"], "P")
        self.assertEqual(data["goal"], "R")

        # Step 2 — assume P at the new subproof scope.
        resp = _post(client, "/api/validate-step", {
            "proofState": {"lines": lines},
            "proposedStep": {
                "rule": "ASSUME",
                "formula": "P",
                "refs": [],
                "scopePath": [],
            },
        })
        self.assertTrue(resp.json()["ok"])
        # Frontend appends the assumption line at the new subproof scope.
        lines.append({
            "formula": "P", "kind": "assumption", "rule": "",
            "refs": [], "scopePath": [3], "discharges": [],
        })

        # Step 3 — derive Q via IMP_E from lines 1 (P → Q) and 3 (P).
        resp = _post(client, "/api/validate-step", {
            "proofState": {"lines": lines},
            "proposedStep": {
                "rule": "IMP_E",
                "formula": "Q",
                "refs": [1, 3],
                "scopePath": [3],
            },
        })
        self.assertTrue(resp.json()["ok"])
        lines.append({
            "formula": "Q", "kind": "derived", "rule": "IMP_E",
            "refs": [1, 3], "scopePath": [3], "discharges": [],
        })

        # Step 4 — derive R via IMP_E from lines 2 (Q → R) and 4 (Q).
        resp = _post(client, "/api/validate-step", {
            "proofState": {"lines": lines},
            "proposedStep": {
                "rule": "IMP_E",
                "formula": "R",
                "refs": [2, 4],
                "scopePath": [3],
            },
        })
        self.assertTrue(resp.json()["ok"])
        lines.append({
            "formula": "R", "kind": "derived", "rule": "IMP_E",
            "refs": [2, 4], "scopePath": [3], "discharges": [],
        })

        # Step 5 — close the subproof to discharge P → R.
        resp = _post(client, "/api/close-subproof", {
            "proofState": {"lines": lines},
            "assumptionLineIndex": 2,  # line 3 → index 2
            "finalLineIndex": 4,       # line 5 → index 4
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["formula"], "P → R")
        self.assertEqual(data["refs"], [3, 5])
        self.assertEqual(data["scopePath"], [])
        # Frontend appends the discharge line at the parent scope.
        lines.append({
            "formula": "P → R", "kind": "derived", "rule": "IMP_I",
            "refs": [[3, 5]], "scopePath": [], "discharges": [3],
        })

        # Step 6 — confirm proof completion.
        resp = _post(client, "/api/check-proof", {
            "proofState": {
                "premises": ["P → Q", "Q → R"],
                "conclusion": conclusion,
                "lines": lines,
            }
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["complete"])


# ─── Flow 2 — Save and retrieve through the proofs API ────────────────────────


class SaveAndRetrieveFlowTests(TestCase):
    """Register a user, save a proof, and read it back."""

    def test_save_and_retrieve(self):
        client = Client()

        # Register and (the registration view) login the user.
        resp = _post(client, "/api/auth/register",
                     {"username": "alice", "password": "StrongPass!9k"})
        self.assertEqual(resp.status_code, 201)

        # Build a minimal complete proof (P ⊢ P).
        complete_lines = [_premise("P")]

        save_resp = _post(client, "/api/proofs/", {
            "title": "Trivial",
            "proofState": {
                "premises": ["P"],
                "conclusion": "P",
                "lines": complete_lines,
            },
        })
        self.assertEqual(save_resp.status_code, 201)
        proof_id = save_resp.json()["proof"]["id"]

        # Retrieve and assert it round-trips.
        get_resp = client.get(f"/api/proofs/{proof_id}/")
        self.assertEqual(get_resp.status_code, 200)
        retrieved = get_resp.json()["proof"]
        self.assertEqual(retrieved["title"], "Trivial")
        self.assertEqual(retrieved["premises"], ["P"])
        self.assertEqual(retrieved["conclusion"], "P")
        self.assertEqual(retrieved["lines"], complete_lines)
        self.assertTrue(retrieved["is_complete"])


# ─── Flow 3 — Ownership scoping ───────────────────────────────────────────────


class OwnershipScopingFlowTests(TestCase):
    """Ensure proofs are isolated to the user that saved them."""

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", password="StrongPass!9k"
        )
        self.bob = User.objects.create_user(
            username="bob", password="StrongPass!9k"
        )

    def _save(self, client, title):
        return _post(client, "/api/proofs/", {
            "title": title,
            "proofState": {
                "premises": ["P"],
                "conclusion": "P",
                "lines": [_premise("P")],
            },
        }).json()["proof"]

    def test_user_cannot_get_update_or_delete_other_users_proof(self):
        alice_client = Client()
        alice_client.login(username="alice", password="StrongPass!9k")
        bob_client = Client()
        bob_client.login(username="bob", password="StrongPass!9k")

        alice_proof = self._save(alice_client, "Alices")
        bob_proof = self._save(bob_client, "Bobs")

        # Alice tries Bob's proof.
        get_resp = alice_client.get(f"/api/proofs/{bob_proof['id']}/")
        self.assertEqual(get_resp.status_code, 404)

        update_resp = alice_client.put(
            f"/api/proofs/{bob_proof['id']}/",
            data=json.dumps({"title": "Hijacked"}),
            content_type="application/json",
        )
        self.assertEqual(update_resp.status_code, 404)

        delete_resp = alice_client.delete(f"/api/proofs/{bob_proof['id']}/")
        self.assertEqual(delete_resp.status_code, 404)

        # Bob's proof is still intact and untouched.
        self.assertTrue(Proof.objects.filter(id=bob_proof["id"]).exists())
        bob_get = bob_client.get(f"/api/proofs/{bob_proof['id']}/")
        self.assertEqual(bob_get.json()["proof"]["title"], "Bobs")

        # Sanity: Alice still sees her own proof.
        alice_get = alice_client.get(f"/api/proofs/{alice_proof['id']}/")
        self.assertEqual(alice_get.status_code, 200)


# ─── Subproof-deletion modal flows (Figure 7.5) ───────────────────────────────


def _assumption(formula, line_no):
    return {"formula": formula, "kind": "assumption", "rule": "", "refs": [],
            "scopePath": [line_no], "discharges": []}


def _derived(formula, rule, refs, scope_path=None, discharges=None):
    return {"formula": formula, "kind": "derived", "rule": rule, "refs": refs,
            "scopePath": list(scope_path or []),
            "discharges": list(discharges or [])}


def _build_imp_i_proof():
    """Builds the canonical 4-line proof discussed in Chapter 7:

      1. P → Q                           (premise)
      2. P                               (assumption,  scope=[2])
      3. Q                               (IMP_E [1,2], scope=[2])
      4. P → Q                           (IMP_I [[2,3]] discharges=[2])
    """
    return [
        _premise("P → Q"),
        _assumption("P", 2),
        _derived("Q", "IMP_E", [1, 2], scope_path=[2]),
        _derived("P → Q", "IMP_I", [[2, 3]],
                 scope_path=[], discharges=[2]),
    ]


class SubproofDeletionModalFlowTests(TestCase):
    """Models the two explicit choices presented by ``DeleteSubproofModal``
    when the user attempts to remove an →I closing line, plus the
    surrounding constraints documented in §7's *Destructive Line
    Operations* section."""

    # The frontend predicate that fires the modal.
    @staticmethod
    def _is_imp_i_closure(line):
        return line.get("rule") == "IMP_I" and bool(line.get("discharges"))

    def test_modal_predicate_detects_imp_i_closure_lines(self):
        # The thesis: "detected by inspecting the line's rule field and
        # discharges list".
        lines = _build_imp_i_proof()
        self.assertFalse(self._is_imp_i_closure(lines[0]))   # premise
        self.assertFalse(self._is_imp_i_closure(lines[1]))   # assumption
        self.assertFalse(self._is_imp_i_closure(lines[2]))   # body
        self.assertTrue(self._is_imp_i_closure(lines[3]))    # →I closure

    def test_premises_are_never_removable(self):
        # "Top-level premises are the only additional exception and are
        # never removable."
        resp = _post(Client(), "/api/delete-line", {
            "proofState": {"lines": _build_imp_i_proof()},
            "lineIndex": 0,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["type"], "RULE")

    def test_modal_choice_a_remove_impi_and_conclusion_only(self):
        """Option A: 'Remove →I + conclusion only — Reopens the scope.'

        Frontend deletes the conclusion line; the cascade auto-removes
        the now-broken →I line. The assumption survives at scope=[2],
        leaving the subproof open for re-derivation.
        """
        lines = _build_imp_i_proof()
        # The conclusion line is the body line that the IMP_I closes
        # over (range end). Deleting it triggers IMP_I auto-removal.
        resp = _post(Client(), "/api/delete-line", {
            "proofState": {"lines": lines},
            "lineIndex": 2,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        updated = data["updatedLines"]
        # Two lines remain: the original premise and the assumption.
        self.assertEqual(len(updated), 2)
        self.assertEqual(updated[0]["formula"], "P → Q")
        self.assertEqual(updated[0]["kind"], "premise")
        self.assertEqual(updated[1]["formula"], "P")
        self.assertEqual(updated[1]["kind"], "assumption")
        # Crucially the assumption's scopePath is preserved so the
        # subproof remains *open* — the user can re-enter it.
        self.assertEqual(updated[1]["scopePath"], [2])
        # No external lines, so nothing else flagged.
        self.assertEqual(data["flaggedLineNos"], [])

    def test_modal_choice_b_delete_entire_subproof(self):
        """Option B: 'Delete entire subproof (3 lines)' — removes the
        assumption, every body line, and the →I closure atomically."""
        lines = _build_imp_i_proof()
        resp = _post(Client(), "/api/delete-subproof", {
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        updated = data["updatedLines"]
        # Only the original premise remains.
        self.assertEqual(len(updated), 1)
        self.assertEqual(updated[0]["formula"], "P → Q")
        # No external lines, so nothing flagged.
        self.assertEqual(data["flaggedLineNos"], [])

    def test_choice_a_preserves_intermediate_steps_in_reopened_scope(self):
        """When the body has intermediate lines, Option A keeps them so
        the student can pick up where they left off — only the *final*
        conclusion line and the →I are removed."""
        lines = [
            _premise("P → Q"),                                       # 1
            _premise("Q → R"),                                       # 2
            _assumption("P", 3),                                     # 3
            _derived("Q", "IMP_E", [1, 3], scope_path=[3]),          # 4 — intermediate
            _derived("R", "IMP_E", [2, 4], scope_path=[3]),          # 5 — conclusion
            _derived("P → R", "IMP_I", [[3, 5]],
                     scope_path=[], discharges=[3]),                 # 6 — →I closure
        ]
        resp = _post(Client(), "/api/delete-line", {
            "proofState": {"lines": lines},
            "lineIndex": 4,  # delete the conclusion (line 5)
        })
        self.assertEqual(resp.status_code, 200)
        updated = resp.json()["updatedLines"]
        # Premises + assumption + intermediate stay; conclusion + →I gone.
        self.assertEqual(len(updated), 4)
        self.assertEqual([ln["formula"] for ln in updated],
                         ["P → Q", "Q → R", "P", "Q"])
        # Intermediate Q stays inside the (now-reopened) scope=[3].
        self.assertEqual(updated[3]["scopePath"], [3])

    def test_choice_b_flags_external_lines_that_referenced_the_subproof(self):
        """If any line *outside* the subproof references its →I, Option B
        leaves them in the proof but flags them so the UI can warn the
        student that the deletion broke a downstream step."""
        lines = _build_imp_i_proof() + [
            _derived("P → Q", "REIT", [4]),  # external dependent on the →I
        ]
        resp = _post(Client(), "/api/delete-subproof", {
            "proofState": {"lines": lines},
            "assumptionLineIndex": 1,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # The premise + the external REIT remain.
        self.assertEqual(len(data["updatedLines"]), 2)
        # The downstream REIT is flagged as broken.
        self.assertEqual(data["flaggedLineNos"], [2])
        broken = data["updatedLines"][1]
        self.assertEqual(broken.get("brokenRef"), 4)
        self.assertEqual(broken.get("brokenKind"), "deleted")
