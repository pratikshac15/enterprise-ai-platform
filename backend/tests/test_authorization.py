
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.auth import get_current_user

client = TestClient(app)


def test_admin_can_access_analytics():
    app.dependency_overrides[get_current_user] = lambda: {
        "username": "alice.admin",
        "user_id": "test-admin",
        "roles": ["platform-admin"],
    }

    try:
        response = client.get("/admin/analytics")
        assert response.status_code == 200
        assert "summary" in response.json()
    finally:
        app.dependency_overrides.clear()


def test_faculty_cannot_access_analytics():
    app.dependency_overrides[get_current_user] = lambda: {
        "username": "bob.researcher",
        "user_id": "test-faculty",
        "roles": ["Faculty"],
    }

    try:
        response = client.get("/admin/analytics")
        assert response.status_code == 403
        assert response.json()["detail"] == "Insufficient permissions"
    finally:
        app.dependency_overrides.clear()
