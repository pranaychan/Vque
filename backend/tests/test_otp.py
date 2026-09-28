from datetime import datetime, timedelta, timezone

import pytest

import services.otp as otp
from services.otp import MAX_VERIFICATION_ATTEMPTS, OTPError


def use_fixed_code(monkeypatch, code="654321"):
    """Make OTP generation deterministic so tests don't need to guess the code."""
    monkeypatch.setattr(otp, "_generate_code", lambda: code)


def test_generates_a_secure_six_digit_code_and_stores_only_a_hash(db_session, monkeypatch):
    use_fixed_code(monkeypatch, "654321")
    verification = otp.generate_otp(db_session, "9876543210")

    assert verification.code_hash != "654321"
    assert verification.expires_at > verification.created_at
    assert verification.verified is False


def test_verifies_once_and_rejects_reuse(db_session, monkeypatch):
    use_fixed_code(monkeypatch, "654321")
    verification = otp.generate_otp(db_session, "9876543210")
    verified = otp.verify_otp(db_session, "9876543210", "654321")

    assert verified.id == verification.id
    assert verified.verified is True
    assert verified.used_at is not None
    with pytest.raises(OTPError, match="Invalid or expired OTP"):
        otp.verify_otp(db_session, "9876543210", "654321")


def test_incorrect_code_tracks_attempts_and_locks_after_limit(db_session, monkeypatch):
    use_fixed_code(monkeypatch, "654321")
    verification = otp.generate_otp(db_session, "9876543210")
    incorrect_code = "000000"

    for _ in range(MAX_VERIFICATION_ATTEMPTS - 1):
        with pytest.raises(OTPError, match="Invalid OTP"):
            otp.verify_otp(db_session, "9876543210", incorrect_code)
    with pytest.raises(OTPError, match="Too many incorrect OTP attempts"):
        otp.verify_otp(db_session, "9876543210", incorrect_code)

    db_session.refresh(verification)
    assert verification.attempts == MAX_VERIFICATION_ATTEMPTS


def test_expired_code_is_rejected_and_invalidated(db_session, monkeypatch):
    use_fixed_code(monkeypatch, "654321")
    verification = otp.generate_otp(db_session, "9876543210")
    verification.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    with pytest.raises(OTPError, match="OTP has expired"):
        otp.verify_otp(db_session, "9876543210", "654321")

    db_session.refresh(verification)
    assert verification.invalidated_at is not None


def test_new_code_invalidates_previous_code(db_session, monkeypatch):
    use_fixed_code(monkeypatch, "111111")
    first = otp.generate_otp(db_session, "9876543210")
    first.created_at = datetime.now(timezone.utc) - timedelta(minutes=2)
    db_session.commit()

    use_fixed_code(monkeypatch, "222222")
    second = otp.generate_otp(db_session, "9876543210")

    db_session.refresh(first)
    assert first.invalidated_at is not None
    assert second.invalidated_at is None
    with pytest.raises(OTPError, match="Invalid or expired OTP"):
        otp.verify_otp(db_session, "9876543210", "111111")
    assert otp.verify_otp(db_session, "9876543210", "222222").id == second.id


def test_generation_is_rate_limited_per_phone_number(db_session, monkeypatch):
    use_fixed_code(monkeypatch, "654321")
    otp.generate_otp(db_session, "9876543210")

    with pytest.raises(OTPError, match="Please wait 60 seconds") as error:
        otp.generate_otp(db_session, "9876543210")
    assert error.value.status_code == 429


def test_dev_mode_logs_the_otp_but_production_does_not(db_session, monkeypatch, caplog):
    use_fixed_code(monkeypatch, "654321")

    monkeypatch.setenv("APP_ENV", "development")
    otp.generate_otp(db_session, "9876543210")
    assert "654321" in caplog.text

    caplog.clear()
    monkeypatch.setenv("APP_ENV", "production")
    otp.generate_otp(db_session, "9111111111")
    assert "654321" not in caplog.text


def test_send_endpoint_never_returns_the_otp(db_session):
    from routers.otp import send_otp
    from schemas import OTPRequest

    response = send_otp(OTPRequest(phone_number="9876543210"), db_session)
    assert response == {"message": "OTP generated successfully", "expires_in_seconds": 300}


def test_existing_password_and_jwt_auth_helpers_work(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    from auth import create_access_token, hash_password, verify_access_token, verify_password

    password_hash = hash_password("ValidPass1!")
    assert verify_password("ValidPass1!", password_hash)
    assert verify_access_token(create_access_token({"sub": "1"}))["sub"] == "1"
