
from backend.app.audit import record_security_event
from backend.app.database import get_usage_analytics, get_security_events


def test_security_events_excluded_from_ai_analytics():
    test_user = {
        "user_id": "test-faculty",
        "username": "bob.researcher",
        "roles": ["Faculty"],
    }

    # Record an access-denied security event.
    record_security_event(
        user=test_user,
        action="access_denied",
        resource="/admin/analytics",
        status="denied",
        error_code="403",
    )

    # Security event should be stored.
    security_events = get_security_events()
    assert len(security_events) == 1

    # But it must not count as an AI inference request.
    analytics = get_usage_analytics()

    assert analytics["summary"]["total_requests"] == 0
    assert analytics["summary"]["successful_requests"] == 0
    assert analytics["summary"]["failed_requests"] == 0
    assert analytics["summary"]["total_generated_tokens"] == 0

    assert analytics["model_usage"] == []
    assert analytics["recent_activity"] == []
