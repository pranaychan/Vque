# Database models for Vque

from datetime import datetime, timezone
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String
from database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Restaurant(Base):
    __tablename__ = "restaurants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    password_hash = Column(String(255), nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_code_hash = Column(String(255), nullable=True)
    email_verification_expires_at = Column(DateTime(timezone=True), nullable=True)
    email_verification_attempts = Column(Integer, default=0, nullable=False)
    email_verification_sent_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_token_hash = Column(String(255), nullable=True)
    password_reset_expires_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_requested_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    name = Column(String(100), nullable=False)
    address = Column(String(255), nullable=False)
    city = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Queue(Base):
    __tablename__ = "queues"
    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    name = Column(String(100), nullable=False)
    status = Column(String(20), default="open", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (CheckConstraint("status IN ('open', 'paused', 'closed')", name="ck_queues_status"),)


class QueueEntry(Base):
    __tablename__ = "queue_entries"
    id = Column(Integer, primary_key=True, index=True)
    queue_id = Column(Integer, ForeignKey("queues.id"), nullable=False)
    customer_name = Column(String(100), nullable=False)
    phone_number = Column(String(10), nullable=True)
    is_guest = Column(Boolean, default=False, nullable=False)
    group_size = Column(Integer, nullable=False)
    status = Column(String(20), default="waiting", nullable=False)
    joined_at = Column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (
        CheckConstraint("group_size BETWEEN 1 AND 20", name="ck_queue_entries_group_size"),
        CheckConstraint("status IN ('waiting', 'called', 'serving', 'completed', 'cancelled', 'skipped')", name="ck_queue_entries_status"),
        CheckConstraint("(is_guest = TRUE AND phone_number IS NULL) OR (is_guest = FALSE AND phone_number IS NOT NULL)", name="ck_queue_entries_guest_contact"),
    )


class OTPVerification(Base):
    __tablename__ = "otp_verifications"
    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(10), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    verified = Column(Boolean, default=False, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    invalidated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
