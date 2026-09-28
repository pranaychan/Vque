from schemas import QueueEntryCreate


def test_guest_queue_entry_does_not_require_phone_or_verification_token():
    entry = QueueEntryCreate(
        customer_name="Guest User",
        group_size=2,
        guest_mode=True,
    )
    assert entry.phone_number is None
    assert entry.verification_token is None
    assert entry.guest_mode is True


def test_verified_queue_entry_requires_phone_fields_at_api_boundary():
    entry = QueueEntryCreate(
        customer_name="Verified User",
        phone_number="9876543210",
        group_size=2,
        verification_token="a" * 20,
        guest_mode=False,
    )
    assert entry.phone_number == "9876543210"
    assert entry.guest_mode is False
