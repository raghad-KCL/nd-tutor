import json
import random
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError
from .models import Proof

from .proof.engine import validate_step_payload, validate_task_payload, open_subproof_payload, check_proof_payload, close_subproof_payload, delete_line_payload, delete_subproof_payload
from .proof.tokens import normalise_only
from .proof.ast import Atom, Not, BinOp
from .proof.validate import parse_formula
from .proof.problems import PROBLEMS


def _parse_json_body(request):
    """Return (body_dict, None) on success, or (None, error_response) on bad JSON."""
    try:
        return json.loads(request.body.decode("utf-8") or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"ok": False, "message": "Invalid JSON."}, status=400)


def count_distinct_vars(ast_list):
    vars_seen = set()
    def collect(node):
        if isinstance(node, Atom):
            vars_seen.add(node.name)
        elif isinstance(node, Not):
            collect(node.inner)
        elif isinstance(node, BinOp):
            collect(node.left)
            collect(node.right)
    for ast in ast_list:
        collect(ast)
    return vars_seen


def parse_tree_depth(ast):
    if isinstance(ast, Atom):
        return 1
    elif isinstance(ast, Not):
        return 1 + parse_tree_depth(ast.inner)
    elif isinstance(ast, BinOp):
        return 1 + max(parse_tree_depth(ast.left), parse_tree_depth(ast.right))
    return 1


def require_authenticated_user(request):
    user = getattr(request, "user", None)
    if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
        return None, JsonResponse(
            {"ok": False, "message": "Authentication required."},
            status=401,
        )
    return user, None


# ── Auth views ────────────────────────────────────────────────────────────────

@csrf_exempt
def register_view(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = _parse_json_body(request)
    if err:
        return err

    username = (body.get("username") or "").strip()
    password = body.get("password") or ""

    if not username or not password:
        return JsonResponse({"ok": False, "message": "Username and password are required."}, status=400)

    try:
        UnicodeUsernameValidator()(username)
    except ValidationError as e:
        return JsonResponse({"ok": False, "message": e.messages[0]}, status=400)

    User = get_user_model()
    if User.objects.filter(username=username).exists():
        return JsonResponse({"ok": False, "message": "Username already taken."}, status=400)

    try:
        validate_password(password)
    except ValidationError as e:
        return JsonResponse({"ok": False, "message": e.messages[0]}, status=400)

    user = User.objects.create_user(username=username, password=password)
    login(request, user)
    return JsonResponse({"ok": True, "username": user.username}, status=201)


@csrf_exempt
def login_view(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = _parse_json_body(request)
    if err:
        return err

    username = (body.get("username") or "").strip()
    password = body.get("password") or ""

    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({"ok": False, "message": "Invalid username or password."}, status=401)

    login(request, user)
    return JsonResponse({"ok": True, "username": user.username}, status=200)


@csrf_exempt
def logout_view(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    logout(request)
    return JsonResponse({"ok": True}, status=200)


@csrf_exempt
def me_view(request):
    if request.method != "GET":
        return JsonResponse({"ok": False, "message": "GET required."}, status=405)
    if request.user and request.user.is_authenticated:
        return JsonResponse({"ok": True, "username": request.user.username}, status=200)
    return JsonResponse({"ok": True, "username": None}, status=200)


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
    user, auth_error = require_authenticated_user(request)
    if auth_error:
        return auth_error

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
        body, err = _parse_json_body(request)
        if err:
            return err

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
    user, auth_error = require_authenticated_user(request)
    if auth_error:
        return auth_error

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
        body, err = _parse_json_body(request)
        if err:
            return err

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
    body, err = _parse_json_body(request)
    if err:
        return err

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
def close_subproof(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = _parse_json_body(request)
    if err:
        return err

    result = close_subproof_payload(body)

    return JsonResponse(
        {
            "ok": result.ok,
            "type": result.type,
            "message": result.message,
            "formula": result.formula,
            "refs": result.refs,
            "scopePath": result.scope_path,
        },
        status=200 if result.ok else 400,
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

    if not result.get("ok"):
        return JsonResponse(result, status=400)

    # Complexity checks on the normalised ASTs
    try:
        ast_list = [parse_formula(p) for p in result["premises"]]
        ast_list.append(parse_formula(result["conclusion"]))

        distinct_vars = count_distinct_vars(ast_list)
        if len(distinct_vars) > 5:
            return JsonResponse({
                "ok": False,
                "message": "Too many propositional variables. Please use at most 5 distinct variables (e.g. P, Q, R, S, T).",
            }, status=400)

        for ast in ast_list:
            if parse_tree_depth(ast) > 5:
                return JsonResponse({
                    "ok": False,
                    "message": "Formula is too deeply nested. Please keep formulas to a maximum nesting depth of 5.",
                }, status=400)
    except Exception:
        pass

    return JsonResponse(result, status=200)

def random_task(request):
    if request.method != "GET":
        return JsonResponse({"ok": False, "message": "GET required."}, status=405)

    difficulty = (request.GET.get("difficulty") or "").strip().lower()
    valid_difficulties = {"easy", "medium", "hard"}

    if difficulty and difficulty not in valid_difficulties:
        return JsonResponse(
            {"ok": False, "message": f"Invalid difficulty. Choose from: easy, medium, hard."},
            status=400,
        )

    pool = [p for p in PROBLEMS if p["difficulty"] == difficulty] if difficulty else PROBLEMS
    problem = random.choice(pool)

    return JsonResponse({
        "ok": True,
        "premises": problem["premises"],
        "conclusion": problem["conclusion"],
        "difficulty": problem["difficulty"],
        "score": problem["score"],
    }, status=200)


@csrf_exempt
def delete_line(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = _parse_json_body(request)
    if err:
        return err

    result = delete_line_payload(body)

    if not result.ok:
        return JsonResponse(
            {"ok": False, "type": result.type, "message": result.message},
            status=400,
        )

    return JsonResponse(
        {
            "ok": True,
            "updatedLines": result.updated_lines,
            "flaggedLineNos": result.flagged_line_nos,
            "flaggedCount": len(result.flagged_line_nos),
        },
        status=200,
    )


@csrf_exempt
def delete_subproof(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = _parse_json_body(request)
    if err:
        return err

    result = delete_subproof_payload(body)

    if not result.ok:
        return JsonResponse(
            {"ok": False, "type": result.type, "message": result.message},
            status=400,
        )

    return JsonResponse(
        {
            "ok": True,
            "updatedLines": result.updated_lines,
            "flaggedLineNos": result.flagged_line_nos,
            "flaggedCount": len(result.flagged_line_nos),
        },
        status=200,
    )


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
