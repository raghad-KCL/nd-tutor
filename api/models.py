from django.db import models
from django.conf import settings


# Create your models here.

class Proof(models.Model):
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
        return self.title or f"Proof #{self.id}"