"""SMTP email delivery for restaurant verification and password reset flows."""

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when an email cannot be delivered."""


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def send_email(to_email: str, subject: str, body: str) -> None:
    """Send an email through configured SMTP, or log it in development mode."""
    if _env_bool("EMAIL_DEV_MODE", True):
        logger.warning("EMAIL_DEV_MODE=true; email to %s was not sent. Subject: %s", to_email, subject)
        return

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
