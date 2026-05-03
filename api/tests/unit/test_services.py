"""Unit tests for the proof_service module."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from api.models import Proof
from api.services.proof_service import (
    compute_completion,
    create_proof,
    delete_proof,
    get_proof,
    list_proofs,
    update_proof,
)


User = get_user_model()


def _trivial_complete_state():
    """Returns (premises, conclusion, lines) for a trivially complete proof."""
    return (
        ["P"],
        "P",
        [{"formula": "P", "kind": "premise", "scopePath": []}],
    )


class ComputeCompletionTests(TestCase):
    """Tests for ``compute_completion``."""

    def test_complete_proof_returns_true(self):
        premises, conclusion, lines = _trivial_complete_state()
        self.assertTrue(compute_completion(premises, conclusion, lines))

    def test_incomplete_proof_returns_false(self):
        # Conclusion never appears in any line.
        self.assertFalse(
            compute_completion(
                ["P"],
                "Q",
                [{"formula": "P", "kind": "premise", "scopePath": []}],
            )
        )

    def test_conclusion_only_inside_subproof_returns_false(self):
        lines = [
            {"formula": "P", "kind": "assumption", "scopePath": [1]},
            # Goal "Q" appears only inside the subproof scope, not at top level.
            {"formula": "Q", "kind": "derived", "rule": "REIT",
             "refs": [1], "scopePath": [1]},
        ]
        self.assertFalse(compute_completion([], "Q", lines))


class CreateProofTests(TestCase):
    """Tests for ``create_proof``."""

    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="StrongPass!9k")

    def test_create_proof_marks_complete_when_complete(self):
        premises, conclusion, lines = _trivial_complete_state()
        proof = create_proof(self.user, "Title", premises, conclusion, lines)
        self.assertTrue(proof.is_complete)
        self.assertEqual(proof.user, self.user)
        self.assertEqual(proof.title, "Title")

    def test_create_proof_marks_incomplete_when_incomplete(self):
        proof = create_proof(
            self.user,
            "Title",
            ["P"],
            "Q",
            [{"formula": "P", "kind": "premise", "scopePath": []}],
        )
        self.assertFalse(proof.is_complete)


class UpdateProofTests(TestCase):
    """Tests for ``update_proof``."""

    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="StrongPass!9k")
        self.proof = create_proof(
            self.user,
            "Initial",
            ["P"],
            "Q",
            [{"formula": "P", "kind": "premise", "scopePath": []}],
        )
        self.assertFalse(self.proof.is_complete)

    def test_update_recomputes_completion_when_full_state_supplied(self):
        premises, conclusion, lines = _trivial_complete_state()
        update_proof(
            self.proof,
            premises=premises,
            conclusion=conclusion,
            lines=lines,
        )
        self.proof.refresh_from_db()
        self.assertTrue(self.proof.is_complete)

    def test_update_does_not_recompute_when_only_title_changes(self):
        update_proof(self.proof, title="Renamed")
        self.proof.refresh_from_db()
        # is_complete remains False — no completion recompute on title-only update
        self.assertFalse(self.proof.is_complete)
        self.assertEqual(self.proof.title, "Renamed")


class ListProofsTests(TestCase):
    """Tests for ``list_proofs``."""

    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="StrongPass!9k")
        self.bob = User.objects.create_user(username="bob", password="StrongPass!9k")

    def test_list_returns_only_callers_proofs_ordered_by_updated_desc(self):
        a1 = create_proof(self.alice, "A1", [], "P", [])
        b1 = create_proof(self.bob, "B1", [], "P", [])
        a2 = create_proof(self.alice, "A2", [], "P", [])
        # Touch a1 last so it should be first in the result.
        a1.title = "A1-renamed"
        a1.save()

        results = list(list_proofs(self.alice))
        self.assertNotIn(b1, results)
        self.assertEqual([p.id for p in results], [a1.id, a2.id])


class GetProofTests(TestCase):
    """Tests for ``get_proof``."""

    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="StrongPass!9k")
        self.bob = User.objects.create_user(username="bob", password="StrongPass!9k")

    def test_returns_none_when_proof_belongs_to_other_user(self):
        bob_proof = create_proof(self.bob, "Bobs", [], "P", [])
        self.assertIsNone(get_proof(bob_proof.id, self.alice))

    def test_returns_proof_when_owner_matches(self):
        alice_proof = create_proof(self.alice, "Alices", [], "P", [])
        self.assertEqual(get_proof(alice_proof.id, self.alice), alice_proof)


class DeleteProofTests(TestCase):
    """Tests for ``delete_proof``."""

    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="StrongPass!9k")

    def test_delete_removes_proof_from_database(self):
        proof = create_proof(self.user, "Title", [], "P", [])
        proof_id = proof.id
        delete_proof(proof)
        self.assertFalse(Proof.objects.filter(id=proof_id).exists())
