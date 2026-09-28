"""Local OTP generation, storage, and verification (customer phone login)."""

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models import OTPVerification


OTP_LENGTH = 6
OTP_TTL = timedelta(minutes=5)
OTP_RESEND_COOLDOWN = timedelta(seconds=60)
MAX_VERIFICATION_ATTEMPTS = 5
logger = logging.getLogger(__name__)


class OTPError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message


def _generate_code() -> str:
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


def _hash_code(code: str) -> str:
    secret = os.getenv("SECRET_KEY")
    if not secret:
        raise RuntimeError("SECRET_KEY must be configured before generating OTPs")
    return hmac.new(secret.encode(), code.encode(), hashlib.sha256).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _log_dev_otp(phone_number: str, code: str) -> None:
    # Never logged outside development, and never returned by the API.
    if os.getenv("APP_ENV", "development").lower() == "development":
        logger.warning("DEVELOPMENT ONLY OTP for %s: %s", phone_number, code)


def generate_otp(db: Session, phone_number: str) -> OTPVerification:
    now = datetime.now(timezone.utc)
    most_recent = (
        db.query(OTPVerification)
        .filter(OTPVerification.phone_number == phone_number)
        .order_by(OTPVerification.created_at.desc(), OTPVerification.id.desc())
        .first()
    )
    if most_recent and _as_utc(most_recent.created_at) >= now - OTP_RESEND_COOLDOWN:
        raise OTPError(429, "Please wait 60 seconds before requesting another OTP")

    active_verifications = db.query(OTPVerification).filter(
        OTPVerification.phone_number == phone_number,
        OTPVerification.verified.is_(False),
        OTPVerification.invalidated_at.is_(None),
    )
    active_verifications.update({OTPVerification.invalidated_at: now}, synchronize_session=False)

    code = _generate_code()
    verification = OTPVerification(
        phone_number=phone_number,
        code_hash=_hash_code(code),
        expires_at=now + OTP_TTL,
        verified=False,
        attempts=0,
    )
    db.add(verification)
    db.commit()
    db.refresh(verification)
    _log_dev_otp(phone_number, code)
    return verification


def verify_otp(db: Session, phone_number: str, code: str) -> OTPVerification:
    verification = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.phone_number == phone_number,
            OTPVerification.verified.is_(False),
            OTPVerification.invalidated_at.is_(None),
        )
        .order_by(OTPVerification.created_at.desc(), OTPVerification.id.desc())
        .first()
    )
    if not verification:
        raise OTPError(400, "Invalid or expired OTP")

    now = datetime.now(timezone.utc)
    if _as_utc(verification.expires_at) <= now:
        verification.invalidated_at = now
        db.commit()
        raise OTPError(400, "OTP has expired")

    if verification.attempts >= MAX_VERIFICATION_ATTEMPTS:
        raise OTPError(429, "Too many incorrect OTP attempts")

    supplied_hash = _hash_code(code)
    if not hmac.compare_digest(verification.code_hash, supplied_hash):
        invalidated_match = (
            db.query(OTPVerification)
            .filter(
                OTPVerification.phone_number == phone_number,
                OTPVerification.invalidated_at.is_not(None),
                OTPVerification.code_hash == supplied_hash,
            )
            .first()
        )
        if invalidated_match:
            raise OTPError(400, "Invalid or expired OTP")

        verification.attempts += 1
        db.commit()
        if verification.attempts >= MAX_VERIFICATION_ATTEMPTS:
            raise OTPError(429, "Too many incorrect OTP attempts")
        raise OTPError(400, "Invalid OTP")

    verification.verified = True
    verification.used_at = now
    db.commit()
    db.refresh(verification)
    return verification
