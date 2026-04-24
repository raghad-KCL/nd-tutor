"""View for serving random proof practice problems."""

import random

from django.http import JsonResponse

from ..proof.problems import PROBLEMS


def random_task(request):
    """Returns a random proof problem, optionally filtered by difficulty.

    Accepts a GET with an optional ``difficulty`` query parameter
    (``"easy"``, ``"medium"``, or ``"hard"``).

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the problem's premises, conclusion,
        difficulty, and score.
    """
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
