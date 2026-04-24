"""View layer for the natural-deduction tutor API."""

from .auth import register_view, login_view, logout_view, me_view
from .proofs import proofs_collection, proof_detail
from .validation import validate_step, validate_task, check_proof, normalise_formula
from .operations import open_subproof, close_subproof, delete_line, delete_subproof
from .problems import random_task

__all__ = [
    "register_view",
    "login_view",
    "logout_view",
    "me_view",
    "proofs_collection",
    "proof_detail",
    "validate_step",
    "validate_task",
    "check_proof",
    "normalise_formula",
    "open_subproof",
    "close_subproof",
    "delete_line",
    "delete_subproof",
    "random_task",
]
