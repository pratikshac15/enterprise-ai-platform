
from backend.app.audit import record_security_event
from backend.app.database import get_security_events


def test_security_event_persistence():
    test_user = {
        "user_id": "test-user-123",
        "username": "test.researcher",
        "roles": ["Faculty"],
    }

    record_security_event(
        user=test_user,
        action="access_denied",
        resource="/admin/analytics",
        status="denied",
        error_code="403",
    )

    events = get_security_events()

    assert len(events) == 1

    event = events[0]

    assert event["username"] == "test.researcher"
    assert event["action"] == "access_denied"
    assert event["resource"] == "/admin/analytics"
    assert event["status"] == "denied"
    assert event["error_code"] == "403"
