import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from .models import Proof

from .proof.engine import validate_step_payload, validate_task_payload, open_subproof_payload, check_proof_payload
from .proof.tokens import normalise_only


def require_authenticated_user(request):
    user = getattr(request, "user", None)
    if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
        return None, JsonResponse(
            {"ok": False, "message": "Authentication required."},
            status=401,
        )
    return user, None


def proof_to_dict(proof: Proof):
    return {
        "id": proof.id,
        "title": proof.title,
        "premises": proof.premises,
        "conclusion": proof.conclusion,
        "lines": proof.lines,
        "is_complete": proof.is_complete,
        "created_at": proof.created_at.isoformat(),
        "updated_at": proof.updated_at.isoformat(),
    }


@csrf_exempt
def proofs_collection(request):
    # user, auth_error = require_authenticated_user(request)
    # if auth_error:
        # return auth_error
    
    User = get_user_model()
    user = User.objects.first()
    if user is None:
        return JsonResponse(
            {"ok": False, "message": "No test user exists."},
            status=400,
        )

    if request.method == "GET":
        proofs = Proof.objects.filter(user=user).order_by("-updated_at")
        return JsonResponse(
            {
                "ok": True,
                "proofs": [proof_to_dict(p) for p in proofs],
            },
            status=200,
        )

    if request.method == "POST":
        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse(
                {"ok": False, "message": "Invalid JSON."},
                status=400,
            )

        title = (body.get("title") or "").strip()
        proof_state = body.get("proofState") or {}

        premises = proof_state.get("premises") or []
        conclusion = (proof_state.get("conclusion") or "").strip()
        lines = proof_state.get("lines") or []

        # Use existing global checker to set completion
        global_result = check_proof_payload({
            "proofState": {
                "premises": premises,
                "conclusion": conclusion,
                "lines": lines,
            }
        })

        proof = Proof.objects.create(
            user=user,
            title=title,
            premises=premises,
            conclusion=conclusion,
            lines=lines,
            is_complete=global_result.complete,
        )

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
    # user, auth_error = require_authenticated_user(request)
    # if auth_error:
    #     return auth_error

    User = get_user_model()
    user = User.objects.first()
    if user is None:
        return JsonResponse(
            {"ok": False, "message": "No test user exists."},
            status=400,
        )

    try:
        proof = Proof.objects.get(id=proof_id, user=user)
    except Proof.DoesNotExist:
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
        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse(
                {"ok": False, "message": "Invalid JSON."},
                status=400,
            )

        if "title" in body:
            proof.title = (body.get("title") or "").strip()

        if "proofState" in body:
            proof_state = body.get("proofState") or {}
            premises = proof_state.get("premises") or []
            conclusion = (proof_state.get("conclusion") or "").strip()
            lines = proof_state.get("lines") or []

            global_result = check_proof_payload({
                "proofState": {
                    "premises": premises,
                    "conclusion": conclusion,
                    "lines": lines,
                }
            })

            proof.premises = premises
            proof.conclusion = conclusion
            proof.lines = lines
            proof.is_complete = global_result.complete

        proof.save()

        return JsonResponse(
            {
                "ok": True,
                "message": "Proof updated successfully.",
                "proof": proof_to_dict(proof),
            },
            status=200,
        )

    if request.method == "DELETE":
        proof.delete()
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

#########################################################

@csrf_exempt
def normalise_formula(request):
    if request.method != "POST":
        return JsonResponse({"error": "Use POST"}, status=405)
    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
        s = (body.get("formula") or "").strip()
        return JsonResponse({"ok": True, "normalised": normalise_only(s)}, status=200)
    except Exception as e:
        return JsonResponse({"ok": False, "message": str(e), "normalised": ""}, status=200)

@csrf_exempt
def check_proof(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {"ok": False, "message": "Invalid JSON."},
            status=400,
        )

    result = check_proof_payload(body)

    return JsonResponse(
        {
            "ok": result.ok,
            "complete": result.complete,
            "goalReachedTopLevel": result.goal_reached_top_level,
            "goalReachedSomewhere": result.goal_reached_somewhere,
            "goalLine": result.goal_line,
            "matchingLines": result.matching_lines,
            "message": result.message,
            "progress": result.progress or [],
            "hints": result.hints or [],
        },
        status=200,
    )

@csrf_exempt
def open_subproof(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)

    try:
        body = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse(
            {"ok": False, "type": "SYNTAX", "message": "Invalid JSON."},
            status=400,
        )

    result = open_subproof_payload(body)

    status = 200 if result.ok else 400
    return JsonResponse(
        {
            "ok": result.ok,
            "type": result.type,
            "message": result.message,
            "normalised": result.normalised,
            "assumption": result.assumption,
            "goal": result.goal,
        },
        status=status,
    )

@csrf_exempt
def validate_task(request):
    if request.method != "POST":
        return JsonResponse({"error": "Use POST"}, status=405)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "message": "Invalid JSON"}, status=400)

    result = validate_task_payload(body)
    return JsonResponse(result, status=200)

@csrf_exempt
def validate_step(request):
    if request.method != "POST":
        return JsonResponse({"error": "Use POST"}, status=405)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "type": "SYNTAX", "message": "Invalid JSON", "normalised": ""}, status=400)

    result = validate_step_payload(body)

    return JsonResponse(
        {
            "ok": result.ok,
            "type": result.type,
            "message": result.message,
            "normalised": result.normalised,
        },
        status=200
    )
