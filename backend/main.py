"""FastAPI entry point for Remi.

This local backend provides a real GitHub OAuth authentication/session
flow for the developer onboarding experience.
"""

from __future__ import annotations

import json
import os
import ssl
import uuid
from typing import Any, Dict, Optional
from urllib import parse, request

import certifi

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

app = FastAPI(title="Remi Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
GITHUB_REDIRECT_URI = os.getenv(
    "GITHUB_REDIRECT_URI",
    "http://localhost:8001/api/auth/github/callback",
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000/frontend/")

SESSIONS: Dict[str, Dict[str, Any]] = {}
STATE_STORE: Dict[str, str] = {}


class SignInRequest(BaseModel):
    provider: str = "github"


class SelectOrganizationRequest(BaseModel):
    organizationName: str


class SelectRepositoriesRequest(BaseModel):
    repositories: list[str]


class GitHubTokenExchangeError(Exception):
    pass


def get_session(session_id: Optional[str]) -> Dict[str, Any]:
    if not session_id:
        raise HTTPException(status_code=401, detail="Missing session id")

    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return session


def github_json_request(url: str, headers: Dict[str, str], method: str = "GET", payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    req = request.Request(url, data=data, headers=headers, method=method)

    try:
        with request.urlopen(req, context=SSL_CONTEXT) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GitHub request failed: {exc}") from exc


def exchange_code_for_token(code: str) -> Dict[str, Any]:
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )

    data = parse.urlencode(
        {
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": GITHUB_REDIRECT_URI,
        }
    ).encode("utf-8")

    req = request.Request(
        "https://github.com/login/oauth/access_token",
        data=data,
        headers={"Accept": "application/json"},
    )

    try:
        with request.urlopen(req, context=SSL_CONTEXT) as response:
            body = response.read().decode("utf-8")
            token_data = json.loads(body) if body else {}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to exchange GitHub code: {exc}") from exc

    if "access_token" not in token_data:
        raise HTTPException(
            status_code=401,
            detail=token_data.get("error_description", "GitHub OAuth exchange failed"),
        )

    return token_data


def create_session_from_github(access_token: str) -> Dict[str, Any]:
    headers = {
        "Authorization": f"token {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    user = github_json_request("https://api.github.com/user", headers)
    orgs = github_json_request("https://api.github.com/user/orgs", headers)

    organizations = []
    for organization in orgs:
        org_name = organization.get("login")
        if not org_name:
            continue

        repos = github_json_request(
            f"https://api.github.com/orgs/{org_name}/repos",
            headers,
        )
        organizations.append(
            {
                "name": org_name,
                "repositories": [repo.get("name") for repo in repos if repo.get("name")],
            }
        )

    selected_organization = organizations[0]["name"] if organizations else None
    selected_repositories = organizations[0]["repositories"][:3] if organizations and organizations[0]["repositories"] else []

    return {
        "user": {
            "name": user.get("name") or user.get("login"),
            "githubUsername": user.get("login"),
        },
        "organizations": organizations,
        "selectedOrganization": selected_organization,
        "selectedRepositories": selected_repositories,
    }


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/github/login")
def github_login() -> RedirectResponse:
    if not GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Missing GITHUB_CLIENT_ID. Add your GitHub OAuth app client id to the environment.",
        )

    state = uuid.uuid4().hex
    STATE_STORE[state] = "valid"

    params = parse.urlencode(
        {
            "client_id": GITHUB_CLIENT_ID,
            "redirect_uri": GITHUB_REDIRECT_URI,
            "scope": "read:user,read:org,repo",
            "state": state,
        }
    )

    github_url = f"https://github.com/login/oauth/authorize?{params}"
    return RedirectResponse(url=github_url)


@app.get("/api/auth/github/callback")
def github_callback(code: Optional[str] = None, state: Optional[str] = None) -> RedirectResponse:
    if not code:
        raise HTTPException(status_code=400, detail="Missing GitHub authorization code")

    if state and state in STATE_STORE:
        STATE_STORE.pop(state, None)
    elif state:
        raise HTTPException(status_code=400, detail="Invalid GitHub OAuth state")

    token_data = exchange_code_for_token(code)
    session_data = create_session_from_github(token_data["access_token"])

    session_id = uuid.uuid4().hex
    SESSIONS[session_id] = session_data

    return RedirectResponse(
        url=f"{FRONTEND_URL}?sessionId={session_id}",
        status_code=302,
    )


@app.post("/api/auth/signin")
def sign_in(payload: SignInRequest) -> Dict[str, Any]:
    if payload.provider != "github":
        raise HTTPException(status_code=400, detail="Only GitHub sign-in is supported right now")

    if not GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )

    return {
        "redirectUrl": f"http://localhost:8001/api/auth/github/login",
        "provider": "github",
    }


@app.get("/api/auth/session")
def get_session_data(x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id")) -> Dict[str, Any]:
    session = get_session(x_session_id)
    return {
        "user": session["user"],
        "organizations": session["organizations"],
        "selectedOrganization": session["selectedOrganization"],
        "selectedRepositories": session["selectedRepositories"],
    }


@app.get("/api/auth/organizations")
def get_organizations(x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id")) -> Dict[str, Any]:
    session = get_session(x_session_id)
    return {"organizations": session["organizations"]}


@app.get("/api/auth/organizations/{organization_name}/repositories")
def get_repositories(
    organization_name: str,
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id"),
) -> Dict[str, Any]:
    session = get_session(x_session_id)

    organization = next(
        (item for item in session["organizations"] if item["name"] == organization_name),
        None,
    )

    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    return {"organization": organization["name"], "repositories": organization["repositories"]}


@app.post("/api/auth/select-organization")
def select_organization(
    payload: SelectOrganizationRequest,
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id"),
) -> Dict[str, Any]:
    session = get_session(x_session_id)

    organization = next(
        (item for item in session["organizations"] if item["name"] == payload.organizationName),
        None,
    )

    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    session["selectedOrganization"] = payload.organizationName
    session["selectedRepositories"] = organization["repositories"][:3]

    return {
        "selectedOrganization": session["selectedOrganization"],
        "selectedRepositories": session["selectedRepositories"],
    }


@app.post("/api/auth/select-repositories")
def select_repositories(
    payload: SelectRepositoriesRequest,
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id"),
) -> Dict[str, Any]:
    session = get_session(x_session_id)

    organization_name = session["selectedOrganization"]
    organization = next(
        (item for item in session["organizations"] if item["name"] == organization_name),
        None,
    )

    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    available_repositories = set(organization["repositories"])
    selected_repositories = [repo for repo in payload.repositories if repo in available_repositories]

    session["selectedRepositories"] = selected_repositories

    return {
        "selectedOrganization": session["selectedOrganization"],
        "selectedRepositories": session["selectedRepositories"],
    }


@app.post("/api/auth/signout")
def sign_out(x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id")) -> Dict[str, str]:
    if x_session_id:
        SESSIONS.pop(x_session_id, None)

    return {"status": "signed_out"}
