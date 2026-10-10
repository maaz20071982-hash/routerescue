# RouteRescue — Data Sources & Feed Ingestion Matrix

This document provides a transparent, comprehensive inventory of all data sources utilized within RouteRescue. Every data source is explicitly classified as **LIVE**, **CACHED**, **DISABLED**, or **SYNTHETIC**.

---

## 1. Data Sources Classification Matrix

| Feed Identifier | Provider Name | Type | Classification | Authentication | Endpoint URL | Documentation / Attribution |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `nws-weather-alerts` | NOAA / National Weather Service | Official Weather & Hazard Alerts | **LIVE** | Public (User-Agent header required) | `https://api.weather.gov/alerts/active` | [NOAA / NWS API Documentation](https://www.weather.gov/documentation/services-web-api) |
| `demo-feed` | Municipal Dispatch CAD Simulator | Emergency Dispatch CAD | **SYNTHETIC** | None (Built-in simulation) | `local://demo-cad-system` | RouteRescue Test Bed |
| `demo-road-network` | San Francisco Urban Transit Graph | Street Grid Topology | **SYNTHETIC** | None (Built-in road model) | `local://sf-downtown-graph` | Caltrans / OpenStreetMap Grid Model |
| `feed-cache-snapshot` | Local Feed Cache Layer | Offline Resilient Cache | **CACHED** | None (Local JSON cache) | `local://cache/{feed_id}` | Disk-backed cache snapshots |
| `twitter-authorized-api` | Municipal Twitter / X Stream | Social Media Dispatch | **DISABLED** | OAuth 2.0 Bearer Token | `https://api.twitter.com/2/tweets/search/recent` | [Twitter / X API v2 Docs](https://developer.twitter.com/en/docs/twitter-api) |
| `reddit-authorized-api` | Reddit Local Hazard Monitor | Social Media Community | **DISABLED** | OAuth 2.0 Script Client | `https://oauth.reddit.com/r/bayarea/search` | [Reddit API Developer Docs](https://www.reddit.com/dev/api/) |

---

## 2. In-Depth Source Specifications

### 2.1 NOAA / National Weather Service Alerts (`nws-weather-alerts`)
- **Status:** **LIVE**
- **Endpoint:** `https://api.weather.gov/alerts/active?area=CA&status=actual`
- **Data Extracted:** Flash flood warnings, severe thunderstorm warnings, high wind advisories, and marine hazards.
- **Polling Cadence:** Periodic REST polling (configurable in UI: 30s, 60s, 120s, 300s, or manual; default 60s).
- **Rate Limit Policy:** NWS requests reasonable request rates and mandatory identification via the `User-Agent` header (`RouteRescueEmergencyApp/1.0 (contact@routerescue.local)`).
- **Location Resolution & Uncertainty:**
  - NWS bulletins often cover multi-county polygons. When a warning geometry polygon is received, RouteRescue computes the geometric polygon centroid to place a map marker.
  - Because centroid coordinates do not represent an exact street corner, the adapter sets:
    - `location_uncertain = true`
    - `location_review_reason = "Calculated from NWS warning polygon centroid. Exact corridor requires field operator review."`
  - In the UI, these records display prominent amber **LOC REVIEW** tags.
- **Provenance Preservation:** Preserves NWS alert ID (`id`), public bulletin URL (`@id`), NWS issuance timestamp (`sent` or `effective`), and local fetch timestamp (`fetched_at`).

---

### 2.2 Municipal Dispatch CAD Simulator (`demo-feed`)
- **Status:** **SYNTHETIC**
- **Endpoint:** Internal memory generator (`local://demo-cad-system`).
- **Data Extracted:** Realistic simulated police, fire, and public works dispatch tickets (e.g., flooded underpass on Market St, downed high-voltage lines, gas main ruptures).
- **Provenance Notice:** Every synthetic incident is stamped with `storage_provenance = DEMO_IN_MEMORY` or `source = DEMO DATA`.
- **Purpose:** Enables end-to-end testing of verification transitions, duplicate flagging, and routing detours without requiring live municipal CAD integrations.

---

### 2.3 San Francisco Urban Transit Graph (`demo-road-network`)
- **Status:** **SYNTHETIC**
- **Model:** Directed, weighted graph composed of 22 key intersections (nodes) and 34 bidirectional road segments (edges) spanning Downtown San Francisco, SoMa, Civic Center, and the Tenderloin.
- **Physical Accuracy:**
  - Nodes use real-world WGS-84 GPS coordinates (e.g. Market & Van Ness at `37.7753, -122.4194`).
  - Road edge distances are computed strictly via Haversine great-circle distance.
  - Nominal speed limits (30–45 km/h) are assigned to compute travel times when supported.
- **Purpose:** Provides a deterministic, testable test bed for Dijkstra and A* pathfinding and verified road closure detours.

---

### 2.4 Local Feed Cache Layer (`feed-cache-snapshot`)
- **Status:** **CACHED**
- **Mechanism:** When a live adapter successfully fetches from an external endpoint, it caches the normalized JSON payload locally.
- **Failover Behavior:**
  - If a live request experiences temporary network dropouts or upstream 5xx errors and `use_cache_on_failure` is enabled, RouteRescue serves the cached records.
  - To prevent misleading operators, every cached record is transparently labeled:
    - `is_cached = true`
    - `cached_at = <ISO 8601 Timestamp>`
  - The UI displays a distinct **CACHED DATA** badge indicating data may not reflect events occurring after `cached_at`.

---

### 2.5 Municipal Twitter / X Stream (`twitter-authorized-api`)
- **Status:** **DISABLED** (Awaiting Operator Credentials)
- **Endpoint:** `https://api.twitter.com/2/tweets/search/recent`
- **Zero-Scraping Policy:** RouteRescue enforces a strict **anti-scraping compliance policy**. We do not scrape web pages, bypass platform rate controls, or use unauthorized private tokens.
- **Activation Requirements:**
  1. Apply for a Twitter Developer account and create a Project.
  2. Generate an App Bearer Token.
  3. Add to `backend/.env`:
     ```ini
     ENABLE_TWITTER_FEED=True
     TWITTER_BEARER_TOKEN=your-twitter-bearer-token
     ```
- **Offline Testing:** A deterministic fixture (`fixtures/twitter_search_fixture.json`) is included for testing parsing and deduplication without active API keys.

---

### 2.6 Reddit Local Hazard Monitor (`reddit-authorized-api`)
- **Status:** **DISABLED** (Awaiting Operator Credentials)
- **Endpoint:** `https://oauth.reddit.com/r/bayarea/search`
- **Zero-Scraping Policy:** Access is restricted to authorized OAuth 2.0 developer scripts. No web scraping or unofficial endpoints are used.
- **Activation Requirements:**
  1. Create a script application at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps).
  2. Add to `backend/.env`:
     ```ini
     ENABLE_REDDIT_FEED=True
     REDDIT_CLIENT_ID=your-reddit-client-id
     REDDIT_CLIENT_SECRET=your-reddit-client-secret
     REDDIT_USER_AGENT=RouteRescueHazardBot/1.0
     ```
- **Offline Testing:** A deterministic fixture (`fixtures/reddit_search_fixture.json`) is included for testing parsing and deduplication without active credentials.

---

## 3. Resilience, Rate-Limiting & Fault Tolerance

1. **Request Timeouts:** All external HTTP requests have an enforced **8.0-second timeout** to prevent hanging threads.
2. **Bounded Retries:** Adapters use exponential backoff with a maximum of **2 retry attempts** for transient network failures.
3. **HTTP 429 Rate-Limit Handling:** When an upstream endpoint returns HTTP 429 (Too Many Requests), RouteRescue parses the `Retry-After` header, transitions the adapter to `RATE_LIMITED` health status, and refuses outbound requests until the cooldown window expires.
4. **Epistemic Honesty:** The system **never invents responses or silently substitutes demo data when a live feed fails**. Failures are transparently reported in source health metrics.
