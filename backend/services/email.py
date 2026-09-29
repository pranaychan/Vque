"""Transactional email delivery for Vque.

Development uses the configured SMTP server. Production uses Resend's HTTP API.
"""

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

import resend

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when an email cannot be delivered."""


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _send_smtp(to_email: str, subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username).strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    use_ssl = _env_bool("SMTP_USE_SSL", port == 465)

    missing = [name for name, value in {
        "SMTP_HOST": host,
        "SMTP_USERNAME": username,
        "SMTP_PASSWORD": password,
        "SMTP_FROM": sender,
    }.items() if not value]
    if missing:
        raise EmailDeliveryError(f"SMTP is not fully configured; missing: {', '.join(missing)}")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    message.set_content(body)

    try:
        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=15, context=context) as server:
                server.ehlo()
                server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(username, password)
                server.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("SMTP delivery failed for %s", to_email)
        raise EmailDeliveryError("SMTP delivery failed") from exc


def _send_resend(to_email: str, subject: str, body: str) -> None:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    sender = os.getenv("EMAIL_FROM", "").strip()
    if not api_key or not sender:
        raise EmailDeliveryError("RESEND_API_KEY and EMAIL_FROM must be configured in production")

    resend.api_key = api_key
    html = (
        body.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br>")
    )
    try:
        result = resend.Emails.send({
            "from": sender,
            "to": [to_email],
            "subject": subject,
            "html": html,
        })
        if not result:
            raise EmailDeliveryError("Resend returned no response")
    except Exception as exc:
        logger.exception("Resend delivery failed for %s", to_email)
        raise EmailDeliveryError("Resend delivery failed") from exc


def send_email(to_email: str, subject: str, body: str) -> None:
    """Use SMTP locally and Resend in production."""
    environment = os.getenv("APP_ENV", "development").strip().lower()
    if environment == "production":
        _send_resend(to_email, subject, body)
    else:
        _send_smtp(to_email, subject, body)
