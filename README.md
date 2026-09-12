# Remi

Remi is an AI Engineering Brain that learns from engineering problems, incidents, decisions, and proven solutions, then uses that organizational memory to help developers solve problems.

## Architecture

GitHub + Manual Engineering Knowledge
↓
Remi
↓
Local AI Inference
Dell GB10
↓
Precedent Memory
↓
Remi Frontend

## Local setup

### 1) Create and activate the virtual environment

```bash
cd /Users/rexpeter/Projects/remi-1
python3 -m venv .venv
source .venv/bin/activate
```

### 2) Install backend dependencies

```bash
cd /Users/rexpeter/Projects/remi-1
pip install -r backend/requirements.txt
```

### 3) Start the backend

```bash
cd /Users/rexpeter/Projects/remi-1/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001
```

### 4) Start the frontend

Open a second terminal:

```bash
cd /Users/rexpeter/Projects/remi-1/frontend
python3 -m http.server 8000
```

### 5) Open the app

```text
http://localhost:8000/
```

## Environment configuration

The project uses a local `.env` file for GitHub OAuth.

Required values:

```env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=http://localhost:8001/api/auth/github/callback
FRONTEND_URL=http://localhost:8000/
```

## Notes

This repository currently contains the shared project skeleton plus a working local GitHub OAuth onboarding flow for organization and repository selection.

The final AI inference must run locally on the Dell Pro Max with GB10 using the required NemoClaw + OpenClaw + OpenShell stack.
