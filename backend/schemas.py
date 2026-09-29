# Data definition for API data validation

import re

from pydantic import BaseModel, EmailStr, Field, field_validator

COMMON_PASSWORDS = {"password123!", "password123", "qwerty123!", "admin123!"}


def check_password_strength(value: str) -> str:
    """Shared password rule used at signup and at password reset."""
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if value.lower() in COMMON_PASSWORDS:
        raise ValueError("Choose a less common password")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must contain an uppercase letter")
    if not re.search(r"[a-z]", value):
        raise ValueError("Password must contain a lowercase letter")
    if not re.search(r"[0-9]", value):
        raise ValueError("Password must contain a number")
    if not re.search(r"[^A-Za-z0-9]", value):
        raise ValueError("Password must contain a special character")
    if re.search(r"(.)\1\1", value):
        raise ValueError("Password cannot contain three repeated characters")
    return value


class RestaurantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        value = " ".join(value.strip().split())
        if not re.fullmatch(r"[A-Za-z0-9 .&'_-]{2,100}", value):
            raise ValueError("Name contains invalid characters")
        return value

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value):
        return check_password_strength(value)


class RestaurantLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=64)

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower()


class EmailCodeVerify(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^[0-9]{6}$")

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower()


class ResendVerification(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower()


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=500)
    password: str = Field(min_length=8, max_length=64)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value):
        return check_password_strength(value)


class LocationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    address: str = Field(min_length=5, max_length=255)
    city: str = Field(min_length=2, max_length=100)

    @field_validator("name", "address", "city")
    @classmethod
    def clean_text(cls, value):
        value = " ".join(value.strip().split())
        if not value:
            raise ValueError("This field cannot be empty")
        return value


class QueueCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = " ".join(value.strip().split())
        if not value:
            raise ValueError("Queue name cannot be empty")
        return value


class QueueStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value):
        if value not in {"open", "paused", "closed"}:
            raise ValueError("Status must be open, paused, or closed")
        return value


class QueueEntryCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100)
    group_size: int = Field(ge=1, le=20)

    @field_validator("customer_name")
    @classmethod
    def clean_customer_name(cls, value):
        value = " ".join(value.strip().split())
        if not re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,99}", value):
            raise ValueError("Enter a valid customer name")
        return value

