"""Views for CRUD operations on saved proofs."""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from ..services.proof_service import list_proofs, create_proof, get_proof, update_proof, delete_proof
from .helpers import parse_json_body, require_authenticated_user, proof_to_dict


@csrf_exempt
def proofs_collection(request):
    """Handles listing (GET) and creating (POST) proofs for the current user.

    GET returns all proofs ordered by most recently updated. POST
    creates a new proof from the provided ``title`` and ``proofState``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the proof list (GET) or the newly
        created proof (POST). Returns 401 if not authenticated.
    """
    user, auth_error = require_authenticated_user(request)
    if auth_error:
        return auth_error

    if request.method == "GET":
        proofs = list_proofs(user)
        return JsonResponse(
            {
                "ok": True,
                "proofs": [proof_to_dict(p) for p in proofs],
            },
            status=200,
        )

    if request.method == "POST":
        body, err = parse_json_body(request)
        if err:
            return err

        title = (body.get("title") or "").strip()
        proof_state = body.get("proofState") or {}

        premises = proof_state.get("premises") or []
        conclusion = (proof_state.get("conclusion") or "").strip()
        lines = proof_state.get("lines") or []

        proof = create_proof(user, title, premises, conclusion, lines)

        return JsonResponse(
            {
                "ok": True,
                "message": "Proof saved successfully.",
                "proof": proof_to_dict(proof),
            },
            status=201,
        )

    return JsonResponse(
        {"ok": False, "message": "Method not allowed."},
        status=405,
    )


@csrf_exempt
def proof_detail(request, proof_id):
    """Handles retrieving (GET), updating (PUT/PATCH), and deleting (DELETE) a single proof.

    Args:
        request: The Django ``HttpRequest``.
        proof_id: Primary key of the proof to operate on.

    Returns:
        A ``JsonResponse`` with the proof data on GET/PUT/PATCH, a
        confirmation on DELETE, or an error (401/404/405).
    """
    user, auth_error = require_authenticated_user(request)
    if auth_error:
        return auth_error

    proof = get_proof(proof_id, user)
    if proof is None:
        return JsonResponse(
            {"ok": False, "message": "Proof not found."},
            status=404,
        )

    if request.method == "GET":
        return JsonResponse(
            {
                "ok": True,
                "proof": proof_to_dict(proof),
            },
            status=200,
        )

    if request.method in ("PUT", "PATCH"):
        body, err = parse_json_body(request)
        if err:
            return err

        title = None
        premises = conclusion = lines = None

        if "title" in body:
            title = (body.get("title") or "").strip()

        if "proofState" in body:
            proof_state = body.get("proofState") or {}
            premises = proof_state.get("premises") or []
            conclusion = (proof_state.get("conclusion") or "").strip()
            lines = proof_state.get("lines") or []

        update_proof(proof, title=title, premises=premises, conclusion=conclusion, lines=lines)

        return JsonResponse(
            {
                "ok": True,
                "message": "Proof updated successfully.",
                "proof": proof_to_dict(proof),
            },
            status=200,
        )

    if request.method == "DELETE":
        delete_proof(proof)
        return JsonResponse(
            {
                "ok": True,
                "message": "Proof deleted successfully.",
            },
            status=200,
        )

    return JsonResponse(
        {"ok": False, "message": "Method not allowed."},
        status=405,
    )
