
import json
import logging
from datetime import datetime, timezone
from backend.app.database import initialize_database, save_audit_event

audit_logger = logging.getLogger("researchai.audit")
audit_logger.setLevel(logging.INFO)
audit_logger.propagate = False

if not audit_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    audit_logger.addHandler(handler)


def record_audit_event(
    *,
    user: dict,
    action: str,
    model: str,
    status: str,
    latency_seconds: float | None = None,
    prompt_tokens: int | None = None,
    generated_tokens: int | None = None,
    error_code: str | None = None,
) -> None:
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "ai_inference",
        "user_id": user.get("user_id"),
        "username": user.get("username"),
        "action": action,
        "model": model,
        "status": status,
        "latency_seconds": latency_seconds,
        "prompt_tokens": prompt_tokens,
        "generated_tokens": generated_tokens,
        "error_code": error_code,
    }

    audit_logger.info(json.dumps(event))

    initialize_database()
    save_audit_event(event)


def record_security_event(
    *,
    user: dict,
    action: str,
    resource: str,
    status: str,
    error_code: str,
) -> None:
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "security",
        "user_id": user.get("user_id"),
        "username": user.get("username"),
        "action": action,
        "model": resource,
        "status": status,
        "latency_seconds": None,
        "prompt_tokens": None,
        "generated_tokens": None,
        "error_code": error_code,
    }

    audit_logger.info(json.dumps(event))

    try:
        initialize_database()
        save_audit_event(event)
    except Exception:
        audit_logger.exception("Failed to persist security audit event")
