"""Authentication views: registration, login, logout, and session check."""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError

from .helpers import parse_json_body


@csrf_exempt
def register_view(request):
    """Registers a new user account and logs them in.

    Accepts a POST with JSON body ``{"username": "...", "password": "..."}``.
    Validates the username format, uniqueness, and password strength.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the created username (201) on success,
        or an error message (400/405) on failure.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = parse_json_body(request)
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
    """Authenticates a user and creates a session.

    Accepts a POST with JSON body ``{"username": "...", "password": "..."}``.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A ``JsonResponse`` with the username (200) on success, or an
        error message (401/405) on failure.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    body, err = parse_json_body(request)
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
    """Logs out the current user and destroys the session.

    Args:
        request: The Django ``HttpRequest`` (POST only).

    Returns:
        A ``JsonResponse`` confirming logout (200), or 405 if not POST.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "message": "POST required."}, status=405)
    logout(request)
    return JsonResponse({"ok": True}, status=200)


@csrf_exempt
def me_view(request):
    """Returns the currently authenticated user's username.

    Args:
        request: The Django ``HttpRequest`` (GET only).

    Returns:
        A ``JsonResponse`` with ``username`` set to the user's name if
        authenticated, or ``None`` if anonymous.
    """
    if request.method != "GET":
        return JsonResponse({"ok": False, "message": "GET required."}, status=405)
    if request.user and request.user.is_authenticated:
        return JsonResponse({"ok": True, "username": request.user.username}, status=200)
    return JsonResponse({"ok": True, "username": None}, status=200)
