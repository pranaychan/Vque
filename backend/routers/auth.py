# Authentication endpoints

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import create_access_token, hash_password, verify_password
from database import get_db
from models import Location, Queue, QueueEntry, Restaurant
from schemas import (
    EmailCodeVerify,
    ForgotPasswordRequest,
    RestaurantCreate,
    RestaurantLogin,
    ResendVerification,
    ResetPasswordRequest,
)
from services.email import EmailDeliveryError, send_email

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)
EMAIL_CODE_TTL = timedelta(minutes=10)
EMAIL_RESEND_COOLDOWN = timedelta(seconds=60)
PASSWORD_RESET_COOLDOWN = timedelta(minutes=5)
MAX_EMAIL_VERIFICATION_ATTEMPTS = 5


def hash_value(value: str) -> str:
    secret = os.getenv("SECRET_KEY")
    if not secret:
        raise RuntimeError("SECRET_KEY must be configured")
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def create_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_dev_email() -> bool:
    return os.getenv("EMAIL_DEV_MODE", "true").strip().lower() == "true"


def _send_or_raise(to_email: str, subject: str, body: str) -> None:
    try:
        send_email(to_email, subject, body)
    except EmailDeliveryError as exc:
        logger.error("Email delivery error for %s: %s", to_email, exc)
        raise HTTPException(status_code=503, detail="Email service is temporarily unavailable") from exc

DEMO_EMAIL = "demo@vque.app"
DEMO_TOKEN_TTL = timedelta(hours=2)


def _reset_demo_restaurant(db: Session) -> Restaurant:
    restaurant = db.query(Restaurant).filter(Restaurant.email == DEMO_EMAIL).first()
    if not restaurant:
        restaurant = Restaurant(
            name="Vque Demo Restaurant",
            email=DEMO_EMAIL,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            email_verified=True,
            is_demo=True,
        )
        db.add(restaurant)
        db.flush()
    else:
        restaurant.is_demo = True
        db.query(QueueEntry).filter(
            QueueEntry.queue_id.in_(db.query(Queue.id).join(Location, Queue.location_id == Location.id).filter(Location.restaurant_id == restaurant.id))
        ).delete(synchronize_session=False)
        db.query(Queue).filter(
            Queue.location_id.in_(db.query(Location.id).filter(Location.restaurant_id == restaurant.id))
        ).delete(synchronize_session=False)
        db.query(Location).filter(Location.restaurant_id == restaurant.id).delete(synchronize_session=False)

    location = Location(
        restaurant_id=restaurant.id,
        name="Downtown Demo",
        address="12 Demo Street",
        city="Bengaluru",
    )
    db.add(location)
    db.flush()

    queues = [
        Queue(location_id=location.id, name="Main Dining", status="open"),
        Queue(location_id=location.id, name="Walk-ins", status="open"),
    ]
    db.add_all(queues)
    db.flush()

    db.add_all([
        QueueEntry(queue_id=queues[0].id, customer_name="Alex", phone_number=None, is_guest=True, group_size=2, status="waiting"),
        QueueEntry(queue_id=queues[0].id, customer_name="Maya", phone_number=None, is_guest=True, group_size=4, status="waiting"),
        QueueEntry(queue_id=queues[0].id, customer_name="Rahul", phone_number=None, is_guest=True, group_size=2, status="called"),
        QueueEntry(queue_id=queues[1].id, customer_name="Priya", phone_number=None, is_guest=True, group_size=3, status="waiting"),
    ])
    db.commit()
    db.refresh(restaurant)
    return restaurant


@router.post("/demo-login")
def demo_login(db: Session = Depends(get_db)):
    if os.getenv("DEMO_MODE_ENABLED", "true").strip().lower() != "true":
        raise HTTPException(status_code=404, detail="Demo mode is disabled")

    restaurant = _reset_demo_restaurant(db)
    access_token = create_access_token(
        data={"sub": str(restaurant.id), "purpose": "restaurant_access", "demo": True},
        expires_delta=DEMO_TOKEN_TTL,
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "demo": True,
        "expires_in": int(DEMO_TOKEN_TTL.total_seconds()),
    }


@router.post("/signup")
def signup(restaurant: RestaurantCreate, db: Session = Depends(get_db)):
    existing_restaurant = db.query(Restaurant).filter(Restaurant.email == restaurant.email).first()
    if existing_restaurant:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    code = create_email_code()
    now = _now()
    new_restaurant = Restaurant(
        name=restaurant.name,
        email=restaurant.email,
        password_hash=hash_password(restaurant.password),
        email_verified=False,
        email_verification_code_hash=hash_value(code),
        email_verification_expires_at=now + EMAIL_CODE_TTL,
        email_verification_attempts=0,
        email_verification_sent_at=now,
    )
    db.add(new_restaurant)
    db.commit()
    db.refresh(new_restaurant)

    _send_or_raise(
        new_restaurant.email,
        "Verify your Vque email",
        f"Your Vque email verification code is {code}. It expires in 10 minutes.",
    )
    if _is_dev_email():
        logger.warning("DEVELOPMENT ONLY email verification code for %s: %s", new_restaurant.email, code)
    return {
        "message": "Restaurant registered. Verify your email before logging in.",
        "restaurant_id": new_restaurant.id,
    }


@router.post("/verify-email")
def verify_email(request: EmailCodeVerify, db: Session = Depends(get_db)):
    restaurant = db.query(Restaurant).filter(Restaurant.email == request.email).first()
    if not restaurant:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    if restaurant.email_verified:
        return {"message": "Email is already verified"}

    now = _now()
    if restaurant.email_verification_attempts >= MAX_EMAIL_VERIFICATION_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many incorrect verification attempts. Request a new code.")
    if not restaurant.email_verification_expires_at or restaurant.email_verification_expires_at < now:
        raise HTTPException(status_code=400, detail="Verification code has expired")

    if not hmac.compare_digest(restaurant.email_verification_code_hash or "", hash_value(request.code)):
        restaurant.email_verification_attempts += 1
        if restaurant.email_verification_attempts >= MAX_EMAIL_VERIFICATION_ATTEMPTS:
            restaurant.email_verification_code_hash = None
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code")

    restaurant.email_verified = True
    restaurant.email_verification_code_hash = None
    restaurant.email_verification_expires_at = None
    restaurant.email_verification_attempts = 0
    restaurant.email_verification_sent_at = None
    db.commit()
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
def resend_verification(request: ResendVerification, db: Session = Depends(get_db)):
    restaurant = db.query(Restaurant).filter(Restaurant.email == request.email).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Email is not registered")
    if restaurant.email_verified:
        return {"message": "Email is already verified"}

    now = _now()
    if restaurant.email_verification_sent_at and restaurant.email_verification_sent_at > now - EMAIL_RESEND_COOLDOWN:
        raise HTTPException(status_code=429, detail="Please wait 60 seconds before requesting another verification email")

    code = create_email_code()
    restaurant.email_verification_code_hash = hash_value(code)
    restaurant.email_verification_expires_at = now + EMAIL_CODE_TTL
    restaurant.email_verification_attempts = 0
    restaurant.email_verification_sent_at = now
    db.commit()

    _send_or_raise(
        restaurant.email,
        "Your new Vque verification code",
        f"Your Vque email verification code is {code}. It expires in 10 minutes.",
    )
    if _is_dev_email():
        logger.warning("DEVELOPMENT ONLY email verification code for %s: %s", restaurant.email, code)
    return {"message": "Verification code sent"}


@router.post("/login")
def login(restaurant: RestaurantLogin, db: Session = Depends(get_db)):
    existing_restaurant = db.query(Restaurant).filter(Restaurant.email == restaurant.email).first()
    if not existing_restaurant or not verify_password(restaurant.password, existing_restaurant.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not existing_restaurant.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email before logging in")

    access_token = create_access_token(data={"sub": str(existing_restaurant.id), "purpose": "restaurant_access"})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    restaurant = db.query(Restaurant).filter(Restaurant.email == request.email).first()
    response = {"message": "If the email exists, a password reset link has been sent."}
    if not restaurant:
        return response

    now = _now()
    if restaurant.password_reset_requested_at and restaurant.password_reset_requested_at > now - PASSWORD_RESET_COOLDOWN:
        return response

    token = secrets.token_urlsafe(32)
    restaurant.password_reset_token_hash = hash_value(token)
    restaurant.password_reset_expires_at = now + timedelta(minutes=30)
    restaurant.password_reset_requested_at = now
    db.commit()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5175").rstrip("/")
    reset_url = f"{frontend_url}/reset-password?token={token}"
    _send_or_raise(
        restaurant.email,
        "Reset your Vque password",
        f"Reset your Vque password using this link:\n\n{reset_url}\n\nThis link expires in 30 minutes.",
    )
    if _is_dev_email():
        logger.warning("DEVELOPMENT ONLY password reset URL for %s: %s", restaurant.email, reset_url)
    return response


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    restaurant = db.query(Restaurant).filter(Restaurant.password_reset_token_hash == hash_value(request.token)).first()
    now = _now()
    if not restaurant or not restaurant.password_reset_expires_at or restaurant.password_reset_expires_at < now:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    restaurant.password_hash = hash_password(request.password)
    restaurant.password_reset_token_hash = None
    restaurant.password_reset_expires_at = None
    restaurant.password_reset_requested_at = None
    db.commit()
    return {"message": "Password reset successfully"}
