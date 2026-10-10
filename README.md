# RouteRescue — Emergency Hazard Awareness & Route Coordination

**Sprint 6: Complete Integration, Quality Assurance & Release**

RouteRescue is a high-reliability, map-first emergency incident and situational routing system engineered for municipal dispatch units, emergency operations centers, and first responders navigating around active road hazards, flash flooding, downed utility lines, and structural debris.

> [!NOTE]
> **DEMO DATA NOTICE:** Incidents and simulation metrics in standard demo mode operate on synthetic test fixtures (`DEMO DATA`). This release operates in a standalone simulation environment and is not connected to municipal 911 dispatch.
> 
> **SAFETY NOTICE:** Route calculations reflect currently recorded incident data only and cannot guarantee absolute real-time road conditions. Field personnel must maintain situational awareness and adhere to local emergency authority directives.

---

## 1. System Architecture

```
                       ┌────────────────────────────────────────┐
                       │        React 19 + Vite Frontend        │
                       │   (OpenStreetMap, Leaflet, Dashboard)  │
                       └───────────────────┬────────────────────┘
                                           │ HTTP REST / Polling (30s-300s)
                                           ▼
                       ┌────────────────────────────────────────┐
                       │          FastAPI REST Backend          │
                       │          (Python 3.11, Uvicorn)        │
                       └─────┬──────────────┬─────────────┬─────┘
                             │              │             │
                             ▼              ▼             ▼
       ┌────────────────────────┐  ┌────────────────┐  ┌────────────────────────┐
       │ Ingestion Layer        │  │ Routing Engine │  │ Verification Engine    │
       │ - NWS Live Alerts      │  │ - Dijkstra     │  │ - Deterministic Rules  │
       │ - Demo CAD Simulator   │  │ - A* Heuristic │  │ - Multi-factor DUP     │
       │ - Twitter v2 (Disabled)│  │ - Closure Detour│  │ - Freshness (>6.0h)    │
       │ - Reddit OAuth(Disabled│  │ - Cautions     │  │ - Provenance Ledger    │
       └────────────────────────┘  └────────────────┘  └────────────────────────┘
                                           │
                                           ▼
                       ┌────────────────────────────────────────┐
                       │     Unified Storage Repository         │
                       │  - Cloud Firestore (Production Mode)   │
                       │  - In-Memory Demo Store (Default Mode) │
                       └────────────────────────────────────────┘
```

The system is organized into two decoupled tiers:

### 1.1 Frontend (`/frontend`) — React 19 + Vite
- **Map-First UI Canvas:** Off-white background (`#f8fafc`), clean surface cards (`#ffffff`), deep navy primary elements (`#0f2942`), and restrained status badges.
- **Unified Data Parity:** Live map markers, left sidebar list, detail modal, verification history, and the route planner all consume the **identical backend dataset**.
- **Configurable Polling & Manual Refresh:**
  - Auto-refresh selector: `Off (Manual Only)`, `30s`, `60s (Default)`, `2m`, `5m`.
  - Timestamp display: `Last sync: HH:MM:SS AM/PM`.
  - Prominent non-real-time disclosure: *"Background updates use periodic REST polling — not instantaneous real-time streaming."*
  - Source health badge: Displays active vs. disabled feed counts with direct link to telemetry.
- **Leaflet Map with Verified Attribution:** CartoDB / OpenStreetMap tile layer with visible, legible `&copy; OpenStreetMap contributors` attribution at the bottom-right corner.
- **Accessible & Mobile Responsive:** Skip link, keyboard navigation, full WCAG 2.1 AA color contrast compliance, and responsive hamburger drawer layout for viewports <768px.

### 1.2 Backend (`/backend`) — Python 3.11+ FastAPI
- **Source-Independent Ingestion Layer (`app/ingestion/`):**
  - Adapters for Live NOAA/NWS alerts, Synthetic CAD demo records, and Disabled Twitter/Reddit streams.
  - Timeouts (8.0s), bounded retries (max 2), HTTP 429 rate-limit backoff, and local cached data labeling.
- **Decoupled Routing Engine (`app/routing/`):**
  - Dijkstra and A* pathfinding over testable urban road graph (22 intersections, 34 edges).
  - Bypasses confirmed road closures (`OFFICIALLY_CONFIRMED`) and keeps roads open for unverified reports with visible cautions.
- **Rule-Based Verification Engine (`app/verification.py`):**
  - Deterministic status transitions (`UNVERIFIED` → `CORROBORATED` → `OFFICIALLY_CONFIRMED` → `RESOLVED`).
  - Proximity-, hazard-, text-, and time-based duplicate detection (records kept separate without auto-merge).
  - Freshness checking (stale after 6.0 hours) without fabricating confidence scores.
- **Security & Authorization (`app/security.py`, `firestore.rules`):**
  - Backend-only secret management via `.env`.
  - Privileged actions protected by `X-Admin-Key` or `Authorization: Bearer <key>`.
  - Strict input sanitization (HTML escaping, coordinate boundary validation).
  - Firestore security rules enforcing least-privilege public reads and admin-only updates.

---

## 2. Release Documentation Index

All required Sprint 6 release documents are located at the root of the workspace:

| Document | Purpose & Contents |
| :--- | :--- |
| **[`README.md`](file:///c:/Users/maaz2/OneDrive/Desktop/s/README.md)** | Master system documentation, architecture, test results, run commands, and overview (this file). |
| **[`SETUP.md`](file:///c:/Users/maaz2/OneDrive/Desktop/s/SETUP.md)** | Step-by-step installation, virtual environment setup, dependencies, `.env` config, and troubleshooting. |
| **[`API_DOCUMENTATION.md`](file:///c:/Users/maaz2/OneDrive/Desktop/s/API_DOCUMENTATION.md)** | Complete REST API specification with endpoints, request bodies, query parameters, schemas, and error codes. |
| **[`DATA_SOURCES.md`](file:///c:/Users/maaz2/OneDrive/Desktop/s/DATA_SOURCES.md)** | Comprehensive classification matrix of **Live** (NWS), **Cached**, **Disabled** (Twitter, Reddit), and **Synthetic** (CAD Demo, Road Graph) data sources. |
| **[`LIMITATIONS.md`](file:///c:/Users/maaz2/OneDrive/Desktop/s/LIMITATIONS.md)** | Epistemic honesty disclosures detailing polling latency, road graph size, polygon centroid resolution, and safety directives. |
| **[`DEMO_SCRIPT.md`](file:///c:/Users/maaz2/OneDrive/Desktop/s/DEMO_SCRIPT.md)** | Step-by-step evaluator testing walkthrough covering all 6 sprints in order. |
| **[`firestore.rules`](file:///c:/Users/maaz2/OneDrive/Desktop/s/firestore.rules)** | Production Cloud Firestore security rules file enforcing schema validation and role-based access control. |

---

## 3. Data Sources Classification

| Feed Identifier | Provider Name | Classification | Ingestion Type | Status & Setup |
| :--- | :--- | :--- | :--- | :--- |
| **`nws-weather-alerts`** | NOAA / National Weather Service | **LIVE** | Public REST API | **Active**: Polling live active California alerts via `api.weather.gov`. Broad warning polygons resolved to centroids and marked `location_uncertain = true` for operator review. |
| **`demo-feed`** | Municipal Dispatch CAD Simulator | **SYNTHETIC** | Built-in Simulation | **Active**: Reproducible emergency tickets with explicit demo labeling. |
| **`demo-road-network`** | Downtown SF Street Topology | **SYNTHETIC** | Built-in Road Graph | **Active**: 22 intersections, 34 edges with real WGS-84 coordinates and Haversine distances. |
| **`feed-cache-snapshot`** | Local Feed Backup Cache | **CACHED** | Local JSON Cache | **Active**: Serves labeled cached data (`is_cached = true`) during temporary upstream network dropouts. |
| **`twitter-authorized-api`** | Municipal Twitter / X API v2 | **DISABLED** | Authorized Bearer API | **Disabled**: Awaiting developer credentials in `TWITTER_BEARER_TOKEN`. Zero scraping policy enforced. |
| **`reddit-authorized-api`** | Reddit Local Hazards OAuth | **DISABLED** | Authorized OAuth Script | **Disabled**: Awaiting developer credentials in `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`. Zero scraping policy enforced. |

---

## 4. Test Results & Quality Assurance

### 4.1 Backend Test Results (`pytest -v`)
- **Suite Execution:** `python -m pytest -v`
- **Result:** **63 passed, 0 failed, 1 warning (deprecation) in 1.28s**.
- **Coverage Areas:**
  - `tests/test_health.py`: Service health, versioning, storage provenance.
  - `tests/test_incidents.py`: Incident CRUD, coordinate boundary validation, XSS input sanitization, storage failure handling.
  - `tests/test_ingestion.py`: Demo adapter, NWS parsing, Twitter & Reddit disabled states, repeat deduplication, bounded retries, HTTP 429 rate-limiting, cached data labeling.
  - `tests/test_routing.py`: Ordinary routing, confirmed road closure avoidance, hazard minimization, unverified caution alerts, disconnected destinations, GPS bounds, A* vs. Dijkstra optimality parity.
  - `tests/test_verification.py`: Multi-factor duplicate detection, duplicate records kept separate without auto-merge, stale report flagging (>6.0h), valid & invalid status transitions, independent sources vs. reposts, audit history trail.
  - `tests/test_sprint6_integration.py`: End-to-end incident lifecycle and routing impact (unverified report does not close road → confirmed closure forces detour → resolved report restores corridor), duplicate review workflow, stale data filtering (`is_stale=true/false`), admin authorization rejection, and unavailable API graceful degradation.

### 4.2 Frontend Quality & Build Results (`oxlint` & `vite build`)
- **Linter Execution:** `npm.cmd run lint` (oxlint)
  - **Result:** **0 warnings, 0 errors** across 15 files with 104 rules using 16 threads in 28ms.
- **Production Build:** `npm.cmd run build` (vite v8.3.4)
  - **Result:** **Built cleanly in 249ms**. Assets generated in `dist/assets/`.

---

## 5. Quickstart & Run Commands

### 5.1 Running the Backend

```powershell
# In a dedicated terminal:
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API root: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`

### 5.2 Running the Frontend

```powershell
# In a second terminal:
cd frontend
npm.cmd run dev
```
- Open browser at: `http://localhost:5173`

### 5.3 Running the Full QA Test Suite

```powershell
# Backend automated tests (63 tests):
cd backend
python -m pytest -v

# Frontend linting and production build:
cd ../frontend
npm.cmd run lint
npm.cmd run build
```

---

## 6. Configuration Needs

To run RouteRescue in full production mode:

1. **Google Cloud Firestore (Optional):**
   - In `backend/.env`: Set `USE_FIRESTORE=True`, `FIRESTORE_PROJECT_ID=<your-project>`, and provide service account credentials at `GOOGLE_APPLICATION_CREDENTIALS`.
   - Deploy `firestore.rules` using `firebase deploy --only firestore:rules`.
2. **Administrative Security Key:**
   - In `backend/.env`: Change `ADMIN_API_KEY` to a cryptographically strong secret token.
3. **CORS Restrictions:**
   - In `backend/app/main.py`: Restrict `origins` from `["*"]` to your verified production domain(s).
4. **Social Media Feeds (Optional):**
   - Provide Twitter Bearer Token in `TWITTER_BEARER_TOKEN` or Reddit OAuth credentials in `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.

---

## 7. Remaining Limitations

1. **Periodic Polling Cadence:** Background updates occur on configured periodic HTTP intervals (default 60s); instantaneous WebSocket push notifications are not supported in this release.
2. **Urban Graph Coverage:** The routing network models 22 intersections and 34 edges in Downtown San Francisco for testing; full continental road coverage requires loading an external OpenStreetMap extract.
3. **Estimated Travel Times:** Travel times are computed using nominal road speeds; real-time GPS probe traffic congestion is not ingested.
4. **Polygon Centroid Precision:** NOAA weather warnings covering multi-county polygons are placed at geometric centroids; field personnel must review warning narratives for exact street boundaries.
5. **No Absolute Safety Guarantee:** Emergency disaster environments are fluid. No automated route is guaranteed 100% safe. Field units must follow tactical on-scene command authority.
