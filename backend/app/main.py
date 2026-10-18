import os
import time

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi import Depends
from backend.app.auth import get_current_user
from fastapi.middleware.cors import CORSMiddleware
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
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned HTTP {exc.response.status_code}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to communicate with Ollama",
        ) from exc

    return {
        "model": request.model,
        "response": result.get("response", ""),
        "latency_seconds": round(time.perf_counter() - start, 3),
        "prompt_tokens": result.get("prompt_eval_count", 0),
        "generated_tokens": result.get("eval_count", 0),
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

            elapsed = time.perf_counter() - start
            tokens = data.get("eval_count", 0)
            eval_duration = data.get("eval_duration", 0)

            results.append({
                "model": model,
                "response": data.get("response", ""),
                "latency_seconds": round(elapsed, 3),
                "prompt_tokens": data.get("prompt_eval_count", 0),
                "generated_tokens": tokens,
                "tokens_per_second": round(
                    tokens / (eval_duration / 1e9), 2
                ) if eval_duration else 0,
                "status": "success",
            })

        except httpx.HTTPError as exc:
            results.append({
                "model": model,
                "status": "error",
                "error": str(exc),
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
