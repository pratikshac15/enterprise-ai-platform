
import pytest

from backend.app import database


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    test_db = tmp_path / "test_audit.db"

    monkeypatch.setattr(database, "DB_PATH", test_db)

    database.initialize_database()

    yield
