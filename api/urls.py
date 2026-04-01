from django.urls import path
from .views import validate_step, normalise_formula, validate_task, open_subproof, check_proof, proofs_collection, proof_detail


urlpatterns = [
    path("validate-step", validate_step, name="validate-step"),
    path("validate-task/", validate_task),
    path("normalise/", normalise_formula),
    path("open-subproof", open_subproof),
    path("check-proof", check_proof),

    path("proofs/", proofs_collection),
    path("proofs/<int:proof_id>/", proof_detail),
]
