
import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
REALM = "researchai"

ISSUER = f"{KEYCLOAK_URL}/realms/{REALM}"
JWKS_URL = f"{ISSUER}/protocol/openid-connect/certs"

# We'll configure this audience in Keycloak before testing.
API_AUDIENCE = "researchai-api"

security = HTTPBearer(auto_error=False)
jwks_client = PyJWKClient(JWKS_URL)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    token = credentials.credentials

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=API_AUDIENCE,
            issuer=ISSUER,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )

        return {
            "username": payload.get("preferred_username"),
            "user_id": payload["sub"],
            "roles": payload.get("realm_access", {}).get("roles", []),
        }

    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token",
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable",
        )

def require_roles(*allowed_roles: str):
    def check_roles(user: dict = Depends(get_current_user)):
        user_roles = set(user["roles"])

        if not user_roles.intersection(allowed_roles):
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions",
            )

        return user

    return check_roles
