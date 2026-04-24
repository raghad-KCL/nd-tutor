"""Views for formula normalisation, proof-step validation, and proof checking."""

import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from ..proof.engine import validate_step_payload, validate_task_payload, check_proof_payload
from ..proof.tokens import normalise_only
from ..proof.validate import parse_formula
from .helpers import parse_json_body, count_distinct_vars, parse_tree_depth


@csrf_exempt
def normalise_formula(request):
    """Normalises a formula string's operators to Unicode.

    Accepts a POST with JSON body ``{"formula": "..."}``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` containing the normalised formula string.
    """
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
    """Checks whether a proof has reached its target conclusion.

    Accepts a POST with a ``proofState`` payload and delegates to
    ``check_proof_payload``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with completeness status, matching lines,
        progress observations, and hints.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = parse_json_body(request)
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
def validate_task(request):
    """Validates and normalises the premises and conclusion of a proof task.

    Also enforces complexity limits (at most 5 distinct variables and
    maximum nesting depth of 5).

    Args:
        request: The Django ``HttpRequest`` (POST with JSON body).

    Returns:
        A ``JsonResponse`` with normalised premises and conclusion on
        success, or an error message on failure.
    """
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

@csrf_exempt
def validate_step(request):
    """Validates a single proposed proof step against inference rules.

    Accepts a POST with ``proofState`` and ``proposedStep`` and
    delegates to ``validate_step_payload``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` indicating whether the step is valid, with
        the normalised formula and any error details.
    """
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
