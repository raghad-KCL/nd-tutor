"""Shared helper utilities for the API view layer."""

import json

from django.http import JsonResponse
from django.contrib.auth.models import AnonymousUser

from ..models import Proof
from ..proof.ast import Atom, Not, BinOp


def parse_json_body(request):
    """Parses the JSON body of an HTTP request.

    Args:
        request: The Django ``HttpRequest`` whose body should be decoded.

    Returns:
        A two-tuple ``(body_dict, None)`` on success, or
        ``(None, JsonResponse)`` with a 400 error on malformed JSON.
    """
    try:
        return json.loads(request.body.decode("utf-8") or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"ok": False, "message": "Invalid JSON."}, status=400)


def require_authenticated_user(request):
    """Extracts the authenticated user from the request.

    Args:
        request: The Django ``HttpRequest``.

    Returns:
        A two-tuple ``(user, None)`` when authenticated, or
        ``(None, JsonResponse)`` with a 401 error otherwise.
    """
    user = getattr(request, "user", None)
    if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
        return None, JsonResponse(
            {"ok": False, "message": "Authentication required."},
            status=401,
        )
    return user, None


def proof_to_dict(proof: Proof):
    """Serialises a ``Proof`` model instance to a JSON-safe dict.

    Args:
        proof: The ``Proof`` instance to serialise.

    Returns:
        A dict containing the proof's id, title, premises, conclusion,
        lines, completion status, and ISO-formatted timestamps.
    """
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


def count_distinct_vars(ast_list):
    """Collects all distinct propositional variable names from a list of ASTs.

    Args:
        ast_list: Iterable of ``Formula`` AST nodes to inspect.

    Returns:
        A set of variable name strings found across all ASTs.
    """
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
    """Computes the depth of a formula AST.

    Atoms have depth 1; each connective adds one level.

    Args:
        ast: A ``Formula`` AST node.

    Returns:
        The integer depth of the deepest path in the tree.
    """
    if isinstance(ast, Atom):
        return 1
    elif isinstance(ast, Not):
        return 1 + parse_tree_depth(ast.inner)
    elif isinstance(ast, BinOp):
        return 1 + max(parse_tree_depth(ast.left), parse_tree_depth(ast.right))
    return 1
