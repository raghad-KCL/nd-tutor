from ..models import Proof
from ..proof.engine import check_proof_payload


def compute_completion(premises, conclusion, lines):
    """Checks whether a proof is complete using the engine's proof checker.

    Args:
        premises: List of premise formula strings.
        conclusion: Target conclusion formula string.
        lines: List of proof-line dicts representing the current proof state.

    Returns:
        ``True`` if the target conclusion has been derived at the top-level
        scope, ``False`` otherwise.
    """
    result = check_proof_payload({
        "proofState": {
            "premises": premises,
            "conclusion": conclusion,
            "lines": lines,
        }
    })
    return result.complete


def list_proofs(user):
    """Returns all proofs for a user, ordered by most recently updated.

    Args:
        user: The Django ``User`` instance whose proofs to retrieve.

    Returns:
        A Django ``QuerySet`` of ``Proof`` objects ordered by
        ``-updated_at``.
    """
    return Proof.objects.filter(user=user).order_by("-updated_at")


def create_proof(user, title, premises, conclusion, lines):
    """Creates and persists a new proof, auto-computing completion status.

    Args:
        user: The Django ``User`` who owns the proof.
        title: Display title for the proof.
        premises: List of premise formula strings.
        conclusion: Target conclusion formula string.
        lines: List of proof-line dicts representing the initial state.

    Returns:
        The newly created ``Proof`` model instance.
    """
    is_complete = compute_completion(premises, conclusion, lines)
    return Proof.objects.create(
        user=user,
        title=title,
        premises=premises,
        conclusion=conclusion,
        lines=lines,
        is_complete=is_complete,
    )


def get_proof(proof_id, user):
    """Retrieves a single proof owned by the given user.

    Args:
        proof_id: Primary key of the proof to retrieve.
        user: The Django ``User`` who must own the proof.

    Returns:
        The ``Proof`` instance if found, or ``None`` if it does not exist
        or belongs to a different user.
    """
    try:
        return Proof.objects.get(id=proof_id, user=user)
    except Proof.DoesNotExist:
        return None


def update_proof(proof, title=None, premises=None, conclusion=None, lines=None):
    """Updates proof fields and re-computes completion if proof state changed.

    Only re-computes ``is_complete`` when all three of ``premises``,
    ``conclusion``, and ``lines`` are provided together.

    Args:
        proof: The ``Proof`` model instance to update.
        title: New display title, or ``None`` to leave unchanged.
        premises: Updated premise list, or ``None`` to skip.
        conclusion: Updated conclusion string, or ``None`` to skip.
        lines: Updated proof-line list, or ``None`` to skip.

    Returns:
        The saved ``Proof`` instance.
    """
    if title is not None:
        proof.title = title

    if premises is not None and conclusion is not None and lines is not None:
        proof.premises = premises
        proof.conclusion = conclusion
        proof.lines = lines
        proof.is_complete = compute_completion(premises, conclusion, lines)

    proof.save()
    return proof


def delete_proof(proof):
    """Deletes a proof from the database.

    Args:
        proof: The ``Proof`` model instance to delete.
    """
    proof.delete()
