# Customer phone OTP endpoints.

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import create_access_token
from database import get_db
from schemas import OTPRequest, OTPVerify
from services.otp import OTPError, generate_otp, verify_otp

router = APIRouter(prefix="/otp", tags=["Customer OTP"])


@router.post("/send")
def send_otp(request: OTPRequest, db: Session = Depends(get_db)):
    try:
        generate_otp(db, request.phone_number)
    except OTPError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error
    return {"message": "OTP generated successfully", "expires_in_seconds": 300}


@router.post("/verify")
def verify(request: OTPVerify, db: Session = Depends(get_db)):
    try:
        verification = verify_otp(db, request.phone_number, request.code)
    except OTPError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    token = create_access_token(
        {
            "purpose": "phone_verification",
            "otp_phone": request.phone_number,
            "otp_verification_id": verification.id,
        },
        timedelta(minutes=10),
    )
    return {"message": "Phone verified successfully", "verification_token": token}
