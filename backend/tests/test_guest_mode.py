from schemas import QueueEntryCreate


def test_queue_entry_requires_only_name_and_group_size():
    entry = QueueEntryCreate(customer_name="Guest User", group_size=2)
    assert entry.customer_name == "Guest User"
    assert entry.group_size == 2


def test_queue_entry_rejects_invalid_name():
    try:
        QueueEntryCreate(customer_name="123", group_size=2)
    except ValueError:
        return
    raise AssertionError("Expected invalid customer name to be rejected")
