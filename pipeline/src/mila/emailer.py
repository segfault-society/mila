"""Email delivery through Resend (provisioned via the Vercel Marketplace; key in RESEND_API_KEY)."""

from __future__ import annotations

import os

import resend

# Until a sending domain is verified in Resend, only the shared onboarding sender is allowed, and it can only
# deliver to the Resend account's own address. Set MILA_EMAIL_FROM once a domain is verified.
DEFAULT_FROM = "Mila <onboarding@resend.dev>"


def email_enabled() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def send_email(to: str, subject: str, text: str, html: str) -> str:
    """Send one email. Returns Resend's message id; raises on failure."""
    resend.api_key = os.environ["RESEND_API_KEY"]
    params: resend.Emails.SendParams = {
        "from": os.environ.get("MILA_EMAIL_FROM", DEFAULT_FROM),
        "to": [to],
        "subject": subject,
        "text": text,
        "html": html,
        "tags": [{"name": "kind", "value": "digest"}],
    }
    return resend.Emails.send(params)["id"]
