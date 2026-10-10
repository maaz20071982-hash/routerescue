# RouteRescue — System Limitations & Epistemic Disclosures

This document provides transparent, uncompromised documentation of the known engineering boundaries, algorithmic constraints, data limitations, and operational assumptions of RouteRescue.

---

## 1. Background Polling vs. Real-Time Streaming

> [!IMPORTANT]
> **POLLING DISCLOSURE:** RouteRescue uses **periodic HTTP REST polling** (configurable at 30s, 60s, 120s, 300s, or manual only; default 60s). It **does NOT** utilize persistent WebSocket connections, Server-Sent Events (SSE), or instantaneous push notifications.

- **Implication:** Changes made in the external world (such as a newly issued NWS flash flood alert or an incident reported by another operator) will appear in the dashboard only after the next scheduled polling interval completes or when the operator clicks **Manual Refresh**.
- **Design Rationale:** Periodic polling was selected to preserve battery life on field mobile devices, prevent upstream rate-limiting against government weather APIs, and allow predictable network inspection in disconnected or low-bandwidth environments.

---

## 2. Road Network Graph Scale & Topology Boundaries

- **Graph Coverage:** The current routing engine operates on a dedicated, testable urban graph covering Downtown San Francisco, SoMa, Civic Center, and adjacent corridors (22 intersections and 34 bidirectional edges).
- **Extensibility:** The routing architecture (`RouteCalculator`) is completely decoupled from the demo graph. It is designed to accept OpenStreetMap (OSM) extract graphs or GIS road shapefiles via network ingestion.
- **Excluded Features:**
  - Dynamic traffic signal timings and turn-by-turn phase delays.
  - Grade/slope restrictions for heavy emergency vehicles (e.g., steep 20% San Francisco hills).
  - Temporary construction permits or time-of-day bus lane restrictions.
- **Safety Directive:** Calculated emergency routes reflect currently recorded closures only. Field units must exercise tactical judgment and obey local on-scene incident commanders.

---

## 3. Travel Time Calculation Approximations

- **Calculated vs. Measured:** Travel times are computed using nominal segment speed limits (e.g. 35–40 km/h) multiplied by Haversine distance, with hazard penalties applied in `MINIMIZE_HAZARDS` mode.
- **Absence of Real-Time Traffic Telemetry:** RouteRescue does not ingest commercial live GPS probe data (such as Google Maps or INRIX feeds).
- **Honest Presentation:** When a segment does not have verified transit speeds, `travel_time_seconds` is explicitly set to `None`, and the UI displays `N/A` rather than fabricating estimated transit times.

---

## 4. Location Uncertainty & Polygon Centroids

- **Warning Polygon Approximations:** Severe weather alerts from NOAA / NWS represent broad geographic polygons. RouteRescue calculates the centroid of the bounding polygon to position the incident pin on the map.
- **Operator Review Requirement:** Because the centroid may fall in a park, body of water, or highway median rather than an exact municipal street corner, the system sets:
  - `location_uncertain = true`
  - `location_review_reason = "Calculated from NWS warning polygon centroid. Exact corridor requires field operator review."`
- **Field Recommendation:** Dispatchers must inspect the raw warning text before dispatching units to a specific address based solely on centroid coordinates.

---

## 5. Verification Rules & Absence of Machine Learning "Confidence Scores"

- **No Synthetic Confidence Scores:** Many disaster response tools invent arbitrary confidence percentages (e.g., "78% verified") using opaque heuristics. RouteRescue strictly prohibits fabricated scores.
- **Deterministic Verification:** All status transitions follow explicit, auditable municipal rules:
  - An incident is `UNVERIFIED` until corroborated by multiple independent sources.
  - An incident cannot transition to `OFFICIALLY_CONFIRMED` without an authorized government agency source or an explicit operator review note with an authorized badge ID.
- **Negative Proof Fallacy:** RouteRescue **never treats the absence of reports as proof that a hazard does not exist**. Lack of citizen reporting often occurs in areas experiencing power outages or network tower failures.

---

## 6. Social Media Integration State

- **Platform Credentials:** Twitter/X API v2 and Reddit OAuth integrations are **DISABLED** by default until valid developer credentials are provided in `backend/.env`.
- **Anti-Scraping Guarantee:** RouteRescue does not use unauthorized scrapers, reverse-engineered private endpoints, or credential-less bots.
- **Deterministic Testing:** Saved example responses (`fixtures/`) are provided to demonstrate normalization, text similarity deduplication, and repost identification without live platform dependencies.

---

## 7. Storage Engine & Deployment Boundaries

- **Demo Default:** By default, RouteRescue operates in standalone demo mode using an in-memory repository. All incident CRUD, duplicate reviews, and verification histories are maintained in server memory and will reset upon server restart.
- **Cloud Firestore Persistence:** Cloud Firestore persistence requires valid Google Cloud project credentials (`serviceAccountKey.json`) and `USE_FIRESTORE=True`.
- **CORS Configuration:** Development server allows localhost and 127.0.0.1 origins. Production deployments must restrict `origins` in `backend/app/main.py` to verified production domain names.

---

## 8. Epistemic Safety Disclaimer

> [!CAUTION]
> **NO ROUTE IS GUARANTEED SAFE.** Route calculations reflect available incident data at the moment of calculation. Disaster environments are dynamic, with rapidly rising floodwaters, falling power lines, and unpredictable structural failures. First responders must always prioritize physical visual inspection and local incident command directives over automated algorithm recommendations.
