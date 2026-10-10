# RouteRescue — Evaluator Demo & Verification Script

This step-by-step walkthrough script guides evaluators, QA engineers, and stakeholders through the full functionality of RouteRescue across all six sprints.

---

## Preparation: Starting the Application

### 1. Start the Backend
Open Terminal 1 (PowerShell or Bash):
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Verify the backend responds at `http://127.0.0.1:8000/api/health`.

### 2. Start the Frontend
Open Terminal 2:
```powershell
cd frontend
npm.cmd run dev
```
Open your browser to: **`http://localhost:5173`**.

---

## Walkthrough Steps

### Phase 1: Operational Health & Live Map Exploration (Sprints 1 & 6)
1. **Notice the Header Bar:**
   - Look at the top navigation header:
     - Badge: **Sprint 6 — Integrated Operations**.
     - Backend status pill: Displays **Demo Repository** (or **Cloud Firestore** if configured).
     - Source health badge: Displays **Feeds: 2 Healthy, 2 Disabled**.
     - Polling indicator: Displays **Polling: 60s (Default)** and **Last sync: [Timestamp]**.
     - Notice bar: Explicit disclosure: *"Background updates use periodic REST polling (60s interval) — not instantaneous real-time streaming."*
2. **Test Leaflet Map & Attribution:**
   - On the **Live Map** tab, view the interactive OpenStreetMap tiles.
   - Look at the bottom-right corner: verify the **© OpenStreetMap contributors** attribution is clearly legible and unobstructed.
   - Click the **Zoom In / Zoom Out** buttons on the top-right.
   - Click the **Expand to Fullscreen** control on the map.
3. **Filter Map Markers:**
   - On the left sidebar, click the filter buttons: **All**, **Confirmed**, **Corroborated**, **Unverified**, and **Resolved**.
   - Observe the map pins dynamically filtering without lag.
   - Click the **Collapse Sidebar** button (`←`) to maximize map viewing area, then expand it back (`→`).

---

### Phase 2: Manual Refresh & Configurable Polling (Sprint 6)
1. **Change the Background Polling Interval:**
   - In the header, find the **Auto-Refresh Polling** dropdown.
   - Change the interval from **Every 60s (Default)** to **Every 30s** or **Manual Only**.
   - Notice the status updates immediately without page reload.
2. **Execute Manual Refresh:**
   - Click the **Manual Refresh** icon button (circular arrows) in the header.
   - Notice the spinning icon animation while the API sync occurs.
   - Confirm the **Last sync** timestamp updates to the current second.

---

### Phase 3: External Data Ingestion & Source Health (Sprint 5)
1. **Navigate to "Data Ingestion" Tab:**
   - Click **Data Ingestion** in the navigation header.
2. **Inspect Registered Adapters:**
   - **`demo-feed`**: Status is **HEALTHY** (Synthetic CAD).
   - **`nws-weather-alerts`**: Status is **HEALTHY** (Live NOAA/NWS API).
   - **`twitter-authorized-api`**: Status is **DISABLED** (Honest reporting: Twitter credentials not configured in `.env`).
   - **`reddit-authorized-api`**: Status is **DISABLED** (Honest reporting: Reddit OAuth credentials not configured).
3. **Test Live Polling & Fixtures:**
   - Click **Poll Live** on the NOAA / NWS card: fetches live severe weather alerts from `api.weather.gov`.
   - Click **Load Fixture** on the Twitter or Reddit card: demonstrates deterministic fixture parsing from saved example responses.
4. **Inspect Ingested Incidents & Location Uncertainty:**
   - In the ingested table below, locate the NWS Flash Flood alert.
   - Notice the amber badge: **`LOC REVIEW`**.
   - Hover or view the explanation: *"Calculated from NWS warning polygon centroid. Exact corridor requires field operator review."*
   - Notice the original `published_at` and system `fetched_at` timestamps are preserved.

---

### Phase 4: Incident Submission & Duplicate Detection (Sprints 2 & 3)
1. **Navigate to "Report an Issue" Tab:**
   - Click **Report an Issue** in the navigation header.
2. **Submit a New Hazard:**
   - Title: `Downed power line on Market St`
   - Description: `High-voltage lines down across roadway between 8th and 7th St.`
   - Category: Select **Hazardous Debris / Utility Hazard**.
   - Severity: Select **Critical**.
   - Click on the interactive map to place a pin between 8th and 7th St (approx `37.7788, -122.4135`).
   - Click **Submit Incident Report**.
3. **Inspect the Incident on Live Map:**
   - The system automatically transitions to the **Live Map** and opens the new incident detail panel.
   - Notice the initial status is **`UNVERIFIED`**.
   - Notice there are **no fabricated confidence scores**.
4. **Inspect Duplicate Flagging:**
   - If another report is submitted in close proximity, notice the **`POTENTIAL DUPLICATE`** warning banner.
   - Click **Review Potential Duplicate**: review decision options are displayed (*Confirm Duplicate (Keep Separate)* or *Dismiss Duplicate*).
   - Notice RouteRescue **never merges records automatically without human review**.

---

### Phase 5: Hazard-Aware Routing & Confirmed Closure Detours (Sprints 4 & 6)
1. **Navigate to "Route Planner" Tab:**
   - Click **Route Planner** in the navigation header.
2. **Verify Backend Data Parity:**
   - Notice the top synchronization banner:
     *"Unified Backend Data Source: Routing engine synchronized with [N] incidents ([X] Confirmed Closures, [Y] Corroborated, [Z] Unverified Cautions)."*
3. **Test Baseline Route Before Closure:**
   - Select Origin: `Market St & Van Ness Ave (INT_MARKET_VAN_NESS)`.
   - Select Destination: `Market St & 4th St (INT_MARKET_4TH)`.
   - Routing Strategy: Select **Avoid Confirmed Closures**.
   - Click **Recalculate Route**.
   - Result: The route safely transits Market St because the reported incident is still `UNVERIFIED` (unverified citizen reports do NOT sever roads).
   - Notice a visible **Corridor Caution Alert** is generated warning drivers of the unverified report.
4. **Upgrade Incident to Confirmed Road Closure:**
   - Return to **Live Map** and select the Market St incident.
   - In the detail panel, click **Review Status** (or use the privileged status selector).
   - Select **OFFICIALLY_CONFIRMED**.
   - Enter authorized notes: *"Confirmed by SF Fire Department Unit 3; road closed to all traffic."*
   - Reviewer: `SFDEM Dispatcher #42`.
   - Click **Confirm Status Transition**.
   - Notice the status changes to `OFFICIALLY_CONFIRMED` and an audit entry is recorded in the verification history.
5. **Observe Immediate Route Detour:**
   - Return to the **Route Planner** tab.
   - Click **Sync & Recalculate**.
   - **Observe the Detour:** The routing engine automatically bypasses the closed Market St block! It reroutes down 8th/9th St onto **Mission St**, continues past the closure, and reconnects at 4th St.
   - **Inspect Route Explanation Banner:**
     *"Route adjusted via Mission St to bypass confirmed hazard: Downed power line on Market St."*
   - **Inspect Avoided Hazards Ledger:** Lists the Market St closure with edge ID and distance.
6. **Inspect Route on Live Map:**
   - Click **Inspect Route on Live Map**.
   - The map displays the vibrant cyan emergency corridor with waypoints and avoided hazard markers.
7. **Test Route Resolution:**
   - Return to the incident, update status to **`RESOLVED`** with notes: *"Lines cleared by utility crews; street reopened."*
   - Recalculate route: The corridor safely restores to the direct Market St path.

---

### Phase 6: Mobile Layout & Responsiveness (Sprint 6)
1. **Resize the Browser:**
   - Shrink browser width below 768px (or use Chrome DevTools Mobile Emulation: iPhone 14 or Pixel 7).
2. **Verify Mobile Navigation:**
   - Notice the desktop nav cleanly collapses into the hamburger menu (`☰`).
   - Click the hamburger button: the mobile navigation drawer opens smoothly.
   - Verify polling selector, last successful update time, and manual refresh button are accessible inside the drawer.
   - Verify map controls, popups, and detail modals adapt gracefully to small screens without horizontal scrolling.

---

## Automated Verification Suite

To run all automated verification tests at any time:

```powershell
# Run backend tests (63 tests)
cd backend
python -m pytest -v

# Run frontend lint & build
cd ../frontend
npm.cmd run lint
npm.cmd run build
```
