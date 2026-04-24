"""Views for subproof management and line deletion operations."""

import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from ..proof.engine import open_subproof_payload, close_subproof_payload, delete_line_payload, delete_subproof_payload
from .helpers import parse_json_body


@csrf_exempt
def open_subproof(request):
    """Opens an implication-introduction (→I) subproof.

    Accepts a POST with ``formula`` and ``rule`` fields. Parses the
    implication and returns the assumption and subproof goal.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the assumption, goal, and normalised
        formula on success, or an error on failure.
    """
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
def close_subproof(request):
    """Closes a subproof and generates the →I discharge line.

    Accepts a POST with ``proofState``, ``assumptionLineIndex``, and
    ``finalLineIndex``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the generated implication formula,
        refs, and scope path on success, or an error on failure.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = parse_json_body(request)
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
def delete_line(request):
    """Deletes a proof line and returns the updated lines with cascade flags.

    Accepts a POST with ``proofState`` and ``lineIndex``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the updated line list and flagged
        (broken) line numbers on success, or an error on failure.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = parse_json_body(request)
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
    """Deletes an entire subproof atomically and returns the updated lines.

    Accepts a POST with ``proofState`` and ``assumptionLineIndex``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the updated line list and flagged
        (broken) line numbers on success, or an error on failure.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = parse_json_body(request)
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
