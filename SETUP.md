# RouteRescue — Setup & Installation Guide

This document provides step-by-step instructions to install, configure, verify, and run the complete RouteRescue application across local development and production-like environments.

---

## 1. System Requirements

| Component | Minimum Requirement | Recommended | Tested Version |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 10/11, macOS 12+, Ubuntu 20.04+ | Windows 11 / macOS 14 / Linux | Windows 11 (PowerShell) |
| **Python** | 3.10+ | 3.11+ | Python 3.11.9 |
| **Node.js** | 18.0.0+ | 20.0.0+ | Node.js 24.3.0 |
| **npm** | 9.0.0+ | 10.0.0+ | npm 10.8.2 |
| **RAM** | 4 GB | 8 GB+ | 16 GB |
| **Disk Space** | 500 MB free | 1 GB free | ~300 MB |

---

## 2. Repository Structure

```
RouteRescue/
├── .env.example                 # Root environment template
├── firestore.rules              # Production Cloud Firestore security rules
├── README.md                    # System architecture & sprint overview
├── SETUP.md                     # Installation and configuration guide (this file)
├── API_DOCUMENTATION.md         # Complete REST API endpoint reference
├── DATA_SOURCES.md              # Live, cached, disabled, and synthetic feeds matrix
├── LIMITATIONS.md               # Engineering boundaries & epistemic disclosures
├── DEMO_SCRIPT.md               # Evaluator testing walkthrough
├── backend/                     # Python FastAPI REST backend
│   ├── .env.example             # Backend configuration template
│   ├── pytest.ini               # Test configuration
│   ├── requirements.txt         # Production dependencies
│   ├── requirements-dev.txt     # Test & development dependencies
│   ├── app/
│   │   ├── main.py              # FastAPI application entrypoint & routing
│   │   ├── config.py            # Pydantic settings & environment loader
│   │   ├── models.py            # Incident, verification & health schemas
│   │   ├── security.py          # Admin API key validation & HTML sanitization
│   │   ├── storage.py           # Dual storage engine (Firestore + Demo memory)
│   │   ├── verification.py      # Rule-based verification & duplicate engine
│   │   ├── ingestion/           # Source-independent external feed adapters
│   │   └── routing/             # Dijkstra & A* hazard-aware routing engine
│   └── tests/                   # 63 automated unit & integration tests
└── frontend/                    # React 19 + Vite web client
    ├── index.html               # Main entry HTML with OpenStreetMap styling
    ├── package.json             # Frontend dependencies & scripts
    ├── vite.config.js           # Vite dev and build pipeline
    └── src/
        ├── App.jsx              # Root application component & polling manager
        ├── index.css            # Design system tokens & Leaflet map styling
        ├── components/          # Map, incidents, planner, ingestion, report views
        ├── constants/           # Demo datasets, status tokens & palettes
        └── services/            # REST API client services
```

---

## 3. Environment Configuration

### 3.1 Backend Configuration (`backend/.env`)

Copy the template from `backend/.env.example` into `backend/.env`:

```bash
# On Windows PowerShell:
Copy-Item backend\.env.example backend\.env

# On macOS / Linux:
cp backend/.env.example backend/.env
```

Review and configure the variables in `backend/.env`:

```ini
# ============================================================================
# ROUTERESCUE BACKEND CONFIGURATION
# ============================================================================

# Environment: "development", "staging", or "production"
ENVIRONMENT=development

# Privileged Administrative API Key
# Required for PATCH /api/incidents/{id}/status, evidence additions, and duplicate reviews
ADMIN_API_KEY=dev-admin-secret-key-change-in-production

# Storage Engine Configuration
# When USE_FIRESTORE=False (default), runs in zero-dependency in-memory Demo mode
USE_FIRESTORE=False
FIRESTORE_PROJECT_ID=routerescue-emergency
FIRESTORE_COLLECTION=incidents
# Optional path to service account JSON (only required when USE_FIRESTORE=True)
# GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Verification & Freshness Limits (Sprint 3)
FRESHNESS_STALE_HOURS=6.0
DUPLICATE_PROXIMITY_METERS=150.0
DUPLICATE_TIME_WINDOW_HOURS=2.0
DUPLICATE_TEXT_SIMILARITY_THRESHOLD=0.45
CONFLICT_PROXIMITY_METERS=250.0

# External Data Feeds Configuration (Sprint 5)
ENABLE_DEMO_FEED=True
ENABLE_NWS_ALERTS=True
NWS_USER_AGENT=RouteRescueEmergencyApp/1.0 (contact@routerescue.local)

# Social Media Authorized APIs (Sprint 5)
# Keep empty to leave Twitter/Reddit adapters safely DISABLED
ENABLE_TWITTER_FEED=False
TWITTER_BEARER_TOKEN=

ENABLE_REDDIT_FEED=False
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=RouteRescueHazardBot/1.0
```

> [!IMPORTANT]
> **Secret Handling:** All secrets (`ADMIN_API_KEY`, `TWITTER_BEARER_TOKEN`, `REDDIT_CLIENT_SECRET`, service account credentials) are backend-only. Never expose these variables in frontend code or commit `.env` to version control.

### 3.2 Frontend Configuration (`frontend/.env`)

The frontend defaults to connecting to the local backend on port `8000`. If you run the backend on a custom host or port, create `frontend/.env`:

```ini
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## 4. Backend Installation & Startup

### Step 1: Create and Activate Python Virtual Environment

```powershell
# Navigate to backend directory
cd backend

# Create virtual environment (Python 3.10+)
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Windows Command Prompt:
.\.venv\Scripts\activate.bat
# macOS / Linux:
source .venv/bin/activate
```

### Step 2: Install Dependencies

```powershell
pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### Step 3: Run Backend Test Suite

Before running the server, verify the installation by running the automated tests:

```powershell
python -m pytest -v
```

Expected result: **63 passed tests in ~1.3 seconds**.

### Step 4: Start FastAPI Server

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **API Root**: `http://127.0.0.1:8000`
- **Health Endpoint**: `http://127.0.0.1:8000/api/health`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`
- **ReDoc Documentation**: `http://127.0.0.1:8000/redoc`

---

## 5. Frontend Installation & Startup

Open a separate terminal window for the frontend.

### Step 1: Navigate to Frontend Directory

```powershell
cd frontend
```

### Step 2: Install Dependencies

```powershell
npm.cmd install
# On macOS / Linux:
npm install
```

### Step 3: Verify Code Quality & Build

```powershell
# Lint check (oxlint):
npm.cmd run lint

# Production build check:
npm.cmd run build
```

Expected results: **0 warnings, 0 errors**, production bundle built into `dist/`.

### Step 4: Start Vite Development Server

```powershell
npm.cmd run dev
# On macOS / Linux:
npm run dev
```

Open your browser to: **`http://localhost:5173`** (or the URL printed in the terminal).

---

## 6. Optional: Google Cloud Firestore Setup

RouteRescue operates out-of-the-box using its built-in in-memory demo repository with zero cloud dependencies. To connect to Google Cloud Firestore:

1. Create a Google Cloud project with Cloud Firestore in Native Mode.
2. Generate a Service Account Key with role `Cloud Datastore User`.
3. Save the JSON key file as `backend/serviceAccountKey.json`.
4. Deploy the security rules from `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
5. Update `backend/.env`:
   ```ini
   USE_FIRESTORE=True
   FIRESTORE_PROJECT_ID=your-gcp-project-id
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
   ```
6. Restart the backend. The `/api/health` endpoint will display:
   ```json
   {
     "storage_backend": "firestore",
     "is_remote_storage": true
   }
   ```

---

## 7. Troubleshooting & FAQ

### Issue: PowerShell blocks `npm` or `activate.ps1`
**Solution**: Run `npm.cmd` instead of `npm`, or enable script execution for your session:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### Issue: Port 8000 or 5173 is already in use
**Solution**:
- Backend: `python -m uvicorn app.main:app --port 8080` (and set `VITE_API_BASE_URL=http://127.0.0.1:8080` in `frontend/.env`).
- Frontend: `npm.cmd run dev -- --port 3000`.

### Issue: Leaflet tiles do not render or appear gray
**Solution**: Ensure you have an active internet connection to load OpenStreetMap tiles from `tile.openstreetmap.org`. Check your firewall or proxy settings.
