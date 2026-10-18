import os
import time

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.audit import record_audit_event
from backend.app.database import get_usage_analytics, get_security_events
from backend.app.auth import get_current_user, require_roles
app = FastAPI(
    title="Enterprise AI Platform",
    description="AI Gateway for ResearchAI Labs",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")


class ChatRequest(BaseModel):
    model: str
    prompt: str = Field(min_length=1)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-gateway"}


@app.get("/models")
async def list_models(
    user: dict = Depends(
        require_roles("Student", "Faculty", "platform-admin")
    ),
):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail="Ollama is unavailable",
        ) from exc



@app.post("/chat")
async def chat(
    request: ChatRequest,
    user: dict = Depends(
        require_roles("Student", "Faculty", "platform-admin")
    ),
):
    start = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": request.model,
                    "prompt": request.prompt,
                    "stream": False,
                    "think": False,
                },
            )
            response.raise_for_status()
            result = response.json()

    except httpx.HTTPStatusError as exc:
        record_audit_event(
            user=user,
            action="chat",
            model=request.model,
            status="error",
            latency_seconds=round(time.perf_counter() - start, 3),
            error_code=f"OLLAMA_HTTP_{exc.response.status_code}",
        )
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned HTTP {exc.response.status_code}",
        ) from exc

    except httpx.HTTPError as exc:
        record_audit_event(
            user=user,
            action="chat",
            model=request.model,
            status="error",
            latency_seconds=round(time.perf_counter() - start, 3),
            error_code="OLLAMA_CONNECTION_ERROR",
        )
        raise HTTPException(
            status_code=503,
            detail="Unable to communicate with Ollama",
        ) from exc

    latency = round(time.perf_counter() - start, 3)
    prompt_tokens = result.get("prompt_eval_count", 0)
    generated_tokens = result.get("eval_count", 0)

    record_audit_event(
        user=user,
        action="chat",
        model=request.model,
        status="success",
        latency_seconds=latency,
        prompt_tokens=prompt_tokens,
        generated_tokens=generated_tokens,
    )

    return {
        "model": request.model,
        "response": result.get("response", ""),
        "latency_seconds": latency,
        "prompt_tokens": prompt_tokens,
        "generated_tokens": generated_tokens,
    }

class CompareRequest(BaseModel):
    models: list[str] = Field(min_length=2)
    prompt: str = Field(min_length=1)



@app.post("/compare")
async def compare(
    request: CompareRequest,
    user: dict = Depends(
        require_roles("Faculty", "platform-admin")
    ),
):
    results = []

    for model in request.models:
        start = time.perf_counter()

        try:
            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": model,
                        "prompt": request.prompt,
                        "stream": False,
                        "think": False,
                    },
                )
                response.raise_for_status()
                data = response.json()

            elapsed = round(time.perf_counter() - start, 3)
            tokens = data.get("eval_count", 0)
            eval_duration = data.get("eval_duration", 0)
            prompt_tokens = data.get("prompt_eval_count", 0)

            record_audit_event(
                user=user,
                action="compare",
                model=model,
                status="success",
                latency_seconds=elapsed,
                prompt_tokens=prompt_tokens,
                generated_tokens=tokens,
            )

            results.append({
                "model": model,
                "response": data.get("response", ""),
                "latency_seconds": elapsed,
                "prompt_tokens": prompt_tokens,
                "generated_tokens": tokens,
                "tokens_per_second": round(
                    tokens / (eval_duration / 1e9), 2
                ) if eval_duration else 0,
                "status": "success",
            })

        except httpx.HTTPStatusError as exc:
            record_audit_event(
                user=user,
                action="compare",
                model=model,
                status="error",
                latency_seconds=round(time.perf_counter() - start, 3),
                error_code=f"OLLAMA_HTTP_{exc.response.status_code}",
            )

            results.append({
                "model": model,
                "status": "error",
                "error": f"Ollama returned HTTP {exc.response.status_code}",
            })

        except httpx.HTTPError:
            record_audit_event(
                user=user,
                action="compare",
                model=model,
                status="error",
                latency_seconds=round(time.perf_counter() - start, 3),
                error_code="OLLAMA_CONNECTION_ERROR",
            )

            results.append({
                "model": model,
                "status": "error",
                "error": "Unable to communicate with Ollama",
            })

    return {
        "prompt": request.prompt,
        "results": results,
    }


@app.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {
        "message": "Authentication successful",
        "user": user,
    }


@app.get("/student/dashboard")
async def student_dashboard(
    user: dict = Depends(
        require_roles("Student", "Faculty", "platform-admin")
    ),
):
    return {
        "message": "Student dashboard access granted",
        "username": user["username"],
    }


@app.get("/faculty/dashboard")
async def faculty_dashboard(
    user: dict = Depends(
        require_roles("Faculty", "platform-admin")
    ),
):
    return {
        "message": "Faculty dashboard access granted",
        "username": user["username"],
    }


@app.get("/admin/dashboard")
async def admin_dashboard(
    user: dict = Depends(require_roles("platform-admin")),
):
    return {
        "message": "Admin dashboard access granted",
        "username": user["username"],
    }


@app.get("/admin/analytics")
async def admin_analytics(
    user: dict = Depends(require_roles("platform-admin")),
):
    return get_usage_analytics()


@app.get("/admin/security-events")
async def admin_security_events(
    user: dict = Depends(require_roles("platform-admin")),
):
    return {
        "total": len(get_security_events()),
        "events": get_security_events(),
    }
