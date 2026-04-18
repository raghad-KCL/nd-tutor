from django.urls import path
from .views import (
    validate_step, normalise_formula, validate_task, open_subproof, close_subproof, check_proof,
    delete_line, delete_subproof,
    proofs_collection, proof_detail,
    register_view, login_view, logout_view, me_view,
    random_task,
)


urlpatterns = [
    path("validate-step", validate_step, name="validate-step"),
    path("validate-task/", validate_task),
    path("random-task/", random_task),
    path("normalise/", normalise_formula),
    path("open-subproof", open_subproof),
    path("close-subproof", close_subproof),
    path("check-proof", check_proof),
    path("delete-line", delete_line),
    path("delete-subproof", delete_subproof),

    path("proofs/", proofs_collection),
    path("proofs/<int:proof_id>/", proof_detail),

    path("auth/register", register_view),
    path("auth/login", login_view),
    path("auth/logout", logout_view),
    path("auth/me", me_view),
]
