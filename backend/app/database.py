
import os
import sqlite3
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "audit.db"
DB_PATH = Path(os.getenv("AUDIT_DB_PATH", str(DEFAULT_DB_PATH)))


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(
        DB_PATH,
        timeout=10,
    )
    connection.row_factory = sqlite3.Row

    return connection


def initialize_database():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                user_id TEXT,
                username TEXT,
                action TEXT NOT NULL,
                model TEXT NOT NULL,
                status TEXT NOT NULL,
                latency_seconds REAL,
                prompt_tokens INTEGER,
                generated_tokens INTEGER,
                error_code TEXT
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp
            ON audit_events(timestamp)
        """)


def save_audit_event(event: dict):
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO audit_events (
                timestamp,
                event_type,
                user_id,
                username,
                action,
                model,
                status,
                latency_seconds,
                prompt_tokens,
                generated_tokens,
                error_code
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["timestamp"],
                event["event_type"],
                event["user_id"],
                event["username"],
                event["action"],
                event["model"],
                event["status"],
                event["latency_seconds"],
                event["prompt_tokens"],
                event["generated_tokens"],
                event["error_code"],
            ),
        )


def get_usage_analytics():
    with get_connection() as connection:

        # AI inference summary only
        summary = connection.execute("""
            SELECT
                COUNT(*) AS total_requests,
                COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),0)
                    AS successful_requests,
                COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END),0)
                    AS failed_requests,
                COALESCE(SUM(generated_tokens), 0)
                    AS total_generated_tokens,
                ROUND(AVG(
                    CASE WHEN status = 'success'
                    THEN latency_seconds END
                ), 3) AS average_latency_seconds
            FROM audit_events
            WHERE event_type = 'ai_inference'
        """).fetchone()

        # Model usage excludes security events
        model_usage = connection.execute("""
            SELECT
                model,
                COUNT(*) AS request_count,
                COALESCE(SUM(generated_tokens), 0)
                    AS generated_tokens
            FROM audit_events
            WHERE event_type = 'ai_inference'
            GROUP BY model
            ORDER BY request_count DESC
        """).fetchall()

        # Recent AI inference activity only
        recent_activity = connection.execute("""
            SELECT
                timestamp,
                username,
                action,
                model,
                status,
                latency_seconds
            FROM audit_events
            WHERE event_type = 'ai_inference'
            ORDER BY id DESC
            LIMIT 20
        """).fetchall()

    return {
        "summary": dict(summary),
        "model_usage": [dict(row) for row in model_usage],
        "recent_activity": [dict(row) for row in recent_activity],
    }


def get_security_events(limit: int = 50):
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                timestamp,
                username,
                action,
                model AS resource,
                status,
                error_code
            FROM audit_events
            WHERE event_type = 'security'
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]
