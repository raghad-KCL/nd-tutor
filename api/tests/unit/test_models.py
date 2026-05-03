"""Unit tests for the Proof Django model."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from api.models import Proof


User = get_user_model()


class ProofModelTests(TestCase):
    """Tests for the ``Proof`` model defined in ``api/models.py``."""

    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="StrongPass!9k")
        self.other = User.objects.create_user(username="bob", password="StrongPass!9k")

    def test_create_proof_with_required_fields_succeeds(self):
        proof = Proof.objects.create(
            user=self.user,
            title="Sample",
            premises=["P"],
            conclusion="P",
            lines=[{"formula": "P", "kind": "premise", "scopePath": []}],
        )
        self.assertIsNotNone(proof.pk)
        self.assertEqual(proof.user, self.user)
        self.assertEqual(proof.title, "Sample")
        self.assertEqual(proof.premises, ["P"])
        self.assertEqual(proof.conclusion, "P")

    def test_is_complete_defaults_to_false(self):
        proof = Proof.objects.create(
            user=self.user,
            premises=[],
            conclusion="P",
            lines=[],
        )
        self.assertFalse(proof.is_complete)

    def test_user_foreign_key_scopes_proof_to_owner(self):
        proof = Proof.objects.create(
            user=self.user,
            premises=[],
            conclusion="P",
            lines=[],
        )
        self.assertEqual(proof.user.pk, self.user.pk)
        self.assertNotEqual(proof.user.pk, self.other.pk)
        self.assertIn(proof, self.user.proofs.all())
        self.assertNotIn(proof, self.other.proofs.all())

    def test_lines_json_field_round_trips_a_list(self):
        sample_lines = [
            {"formula": "P ∧ Q", "kind": "premise", "scopePath": []},
            {"formula": "P", "kind": "derived", "rule": "AND_E1", "refs": [1], "scopePath": []},
        ]
        proof = Proof.objects.create(
            user=self.user,
            premises=["P ∧ Q"],
            conclusion="P",
            lines=sample_lines,
        )
        proof.refresh_from_db()
        self.assertEqual(proof.lines, sample_lines)
        self.assertIsInstance(proof.lines, list)

    def test_created_at_and_updated_at_set_automatically(self):
        proof = Proof.objects.create(
            user=self.user,
            premises=[],
            conclusion="P",
            lines=[],
        )
        self.assertIsNotNone(proof.created_at)
        self.assertIsNotNone(proof.updated_at)
        original_updated = proof.updated_at
        proof.title = "Renamed"
        proof.save()
        proof.refresh_from_db()
        self.assertGreaterEqual(proof.updated_at, original_updated)

    def test_str_returns_title_when_set(self):
        proof = Proof.objects.create(
            user=self.user,
            title="My Proof",
            premises=[],
            conclusion="P",
            lines=[],
        )
        self.assertEqual(str(proof), "My Proof")

    def test_str_falls_back_to_proof_id_when_title_blank(self):
        proof = Proof.objects.create(
            user=self.user,
            title="",
            premises=[],
            conclusion="P",
            lines=[],
        )
        self.assertEqual(str(proof), f"Proof #{proof.id}")
