"""Django models for the natural-deduction tutor API."""

from django.db import models
from django.conf import settings


class Proof(models.Model):
    """A saved natural-deduction proof belonging to a user.

    Attributes:
        user: The owning ``User`` (CASCADE on delete).
        title: Optional display title.
        premises: JSON list of premise formula strings.
        conclusion: Target conclusion formula string.
        lines: JSON list of proof-line dicts representing the current
            proof state.
        is_complete: Whether the proof has been verified as complete.
        created_at: Timestamp of initial creation.
        updated_at: Timestamp of the most recent save.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="proofs"
    )

    title = models.CharField(max_length=200, blank=True)

    premises = models.JSONField(default=list)
    conclusion = models.TextField()

    lines = models.JSONField(default=list)

    is_complete = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        """Returns the proof title, falling back to ``Proof #<id>``."""
        return self.title or f"Proof #{self.id}"