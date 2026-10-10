# RouteRescue — REST API Reference Documentation

**Version:** 6.0.0  
**Base URL:** `http://127.0.0.1:8000` (Local)  
**OpenAPI Specification:** Available interactively at `/docs` (Swagger UI) and `/redoc` (ReDoc).

---

## 1. Authentication & Security Architecture

### Public Endpoints
All situational awareness queries, road network topologies, preset corridors, and incident submission endpoints are publicly accessible to ensure unrestricted emergency visibility:
- `GET /api/health`
- `GET /api/incidents`
- `GET /api/incidents/{id}`
- `POST /api/incidents`
- `POST /api/routing/calculate`
- `GET /api/routing/network`
- `GET /api/routing/presets`
- `GET /api/ingestion/sources`
- `GET /api/ingestion/history`

### Privileged Operator Endpoints
Administrative modifications require authentication using the configured `ADMIN_API_KEY`:
- `PATCH /api/incidents/{id}/status`
- `POST /api/incidents/{id}/evidence`
- `POST /api/incidents/{id}/duplicates/{flag_id}/review`

#### Authentication Headers
Clients must provide one of the following headers on privileged requests:
```http
X-Admin-Key: <ADMIN_API_KEY>
```
or
```http
Authorization: Bearer <ADMIN_API_KEY>
```

Failure to provide a valid key yields:
```json
{
  "detail": "Privileged access required. Missing or invalid administrator key in X-Admin-Key or Authorization header."
}
```
HTTP Status: `401 Unauthorized`.

---

## 2. Health & Service Diagnostics

### `GET /api/health`
Returns runtime operational status, active storage backend, and provenance disclaimer.

**Response `200 OK`:**
```json
{
  "status": "healthy",
  "service": "RouteRescue API",
  "version": "3.0.0",
  "timestamp": "2026-10-10T06:15:30.123456Z",
  "environment": "development",
  "storage_backend": "demo_repository",
  "storage_notice": "In-memory demo repository active. Writes are held in session RAM and NOT persisted to Cloud Firestore.",
  "is_remote_storage": false
}
```

---

### `GET /api/verification/config`
Returns active rule-based verification thresholds and freshness limits.

**Response `200 OK`:**
```json
{
  "freshness_stale_hours": 6.0,
  "duplicate_proximity_meters": 150.0,
  "duplicate_time_window_hours": 2.0,
  "duplicate_text_similarity_threshold": 0.45,
  "conflict_proximity_meters": 250.0,
  "verification_policies": {
    "officially_confirmed_requirement": "Requires an authorized official agency source or explicit authorized review with documented notes.",
    "duplicate_policy": "Potential duplicates flagged based on multi-factor proximity, hazard, text similarity, and time window. Records are NEVER merged automatically without human review.",
    "confidence_scores": "Strictly prohibited. All verification is deterministic and rule-based."
  }
}
```

---

## 3. Incident Management & Verification

### `GET /api/incidents`
Lists incidents matching optional query parameters.

**Query Parameters:**
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `status` | string | Filter by status: `UNVERIFIED`, `CORROBORATED`, `OFFICIALLY_CONFIRMED`, `RESOLVED` |
| `hazard_type` | string | Filter by category: `flood`, `hazard`, `congestion`, `infrastructure`, `fire` |
| `severity` | string | Filter by severity: `low`, `medium`, `high`, `critical` |
| `is_stale` | boolean | `true` for reports older than 6.0 hours; `false` for fresh reports |

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "DEMO-INC-101",
      "title": "Flooded Underpass & Road Blockage",
      "hazard_type": "flood",
      "type": "flood",
      "severity": "critical",
      "status": "OFFICIALLY_CONFIRMED",
      "latitude": 37.7765,
      "longitude": -122.4172,
      "lat": 37.7765,
      "lng": -122.4172,
      "location_name": "Market St & 10th St Underpass",
      "locationName": "Market St & 10th St Underpass",
      "description": "Standing water 3.5 ft deep. Submerged vehicles blocking lanes.",
      "source": "SF Department of Emergency Management",
      "source_url": "https://sfdem.gov/alerts/2026-flood-mkt-10",
      "reported_at": "2026-10-10T05:30:00Z",
      "reportedAt": "2026-10-10T05:30:00Z",
      "affected_routes": ["Market St", "10th St"],
      "recommended_action": "Detour via Mission St",
      "recommendedDetour": "Detour via Mission St",
      "verified": true,
      "storage_provenance": "DEMO_IN_MEMORY",
      "published_at": "2026-10-10T05:28:00Z",
      "ingested_at": "2026-10-10T05:30:00Z",
      "is_stale": false,
      "sources_detail": [
        {
          "source_id": "SRC-DEMO-INC-101-1",
          "source_name": "SF Department of Emergency Management",
          "source_url": "https://sfdem.gov/alerts/2026-flood-mkt-10",
          "published_at": "2026-10-10T05:28:00Z",
          "ingested_at": "2026-10-10T05:30:00Z",
          "is_official": true,
          "is_repost": false,
          "excerpt": "Official CAD dispatch bulletin for road closure."
        }
      ],
      "verification_history": [
        {
          "id": "HIST-DEMO-INC-101-1",
          "timestamp": "2026-10-10T05:30:00Z",
          "action": "STATUS_TRANSITION",
          "from_status": "CORROBORATED",
          "to_status": "OFFICIALLY_CONFIRMED",
          "actor": "SFDEM Supervisor #14",
          "reason": "Direct CAD report from Department of Emergency Management."
        }
      ],
      "evidence_summary": {
        "total_sources": 1,
        "independent_sources_count": 1,
        "repost_count": 0,
        "official_sources_count": 1,
        "has_official_source": true,
        "is_stale": false,
        "freshness_limit_hours": 6.0,
        "age_hours": 0.8,
        "duplicate_flags_count": 0,
        "conflict_flags_count": 0,
        "rule_evaluation_notes": [
          "Report is FRESH: published 0.8h ago (threshold: 6.0h).",
          "Official agency source verified (SF Department of Emergency Management)."
        ]
      },
      "potential_duplicates": [],
      "conflicting_reports": [],
      "location_uncertain": false,
      "location_review_reason": null,
      "is_cached": false
    }
  ],
  "total": 1,
  "storage_backend": "demo_repository",
  "storage_notice": "In-memory demo repository active.",
  "source": "DEMO DATA"
}
```

---

### `POST /api/incidents`
Submits a new emergency incident report.

**Request Body:**
```json
{
  "title": "Severe flooding on Folsom St",
  "description": "Water rising above curb near 8th St; single lane navigable.",
  "hazard_category": "flood",
  "latitude": 37.7735,
  "longitude": -122.4103,
  "location_name": "Folsom St & 8th St",
  "severity": "medium",
  "source": "CITIZEN_REPORT",
  "source_url": "https://citizen.app/alert/folsom-8th-flood"
}
```

**Response `201 Created`:**
```json
{
  "status": "success",
  "data": {
    "id": "DEMO-INC-108",
    "title": "Severe flooding on Folsom St",
    "status": "UNVERIFIED",
    "hazard_type": "flood",
    "latitude": 37.7735,
    "longitude": -122.4103,
    "location_name": "Folsom St & 8th St",
    "severity": "medium",
    "verified": false,
    "is_stale": false,
    "potential_duplicates": []
  },
  "saved_remotely": false,
  "message": "Incident submitted to in-memory demo repository (NOT saved remotely)."
}
```

---

### `PATCH /api/incidents/{incident_id}/status` (Privileged)
Updates an incident's lifecycle verification status.

**Headers:**
```http
X-Admin-Key: dev-admin-secret-key-change-in-production
```

**Request Body:**
```json
{
  "status": "OFFICIALLY_CONFIRMED",
  "notes": "Verified by SF Department of Emergency Management via field camera #4.",
  "reviewer_role": "DEM Dispatch Supervisor",
  "authorized_by": "SFDEM_UNIT_4"
}
```

**Response `200 OK`:**
Returns the updated `IncidentResponse` with the new status and an appended `verification_history` audit entry.

**Validation Rule:**
If attempting to transition to `OFFICIALLY_CONFIRMED` without an official source or authorized review notes, returns `400 Bad Request`:
```json
{
  "detail": "Transition to OFFICIALLY_CONFIRMED rejected: Requires an authorized official source or explicit authorized review with documented confirmation rationale."
}
```

---

### `POST /api/incidents/{incident_id}/duplicates/{flag_id}/review` (Privileged)
Records an operator review on a flagged duplicate without merging records.

**Request Body:**
```json
{
  "decision": "CONFIRMED_DUPLICATE_KEPT_SEPARATE",
  "notes": "Second witness confirmed referring to the same incident. Record kept separate for provenance."
}
```

**Response `200 OK`:**
Returns updated `IncidentResponse` with `flag.reviewed = true` and `flag.review_decision` set.

---

## 4. Hazard-Aware Routing Engine

### `POST /api/routing/calculate`
Calculates an optimal transit corridor between intersections or GPS coordinates using Dijkstra or A*.

**Request Body:**
```json
{
  "origin_node_id": "INT_MARKET_VAN_NESS",
  "destination_node_id": "INT_MARKET_4TH",
  "mode": "AVOID_CONFIRMED_CLOSURES",
  "use_a_star": true
}
```

**Routing Modes:**
- `SHORTEST`: Baseline physical road distance (ignores hazards).
- `AVOID_CONFIRMED_CLOSURES`: Strictly closes edges with `OFFICIALLY_CONFIRMED` closures while keeping roads open for `UNVERIFIED` reports.
- `MINIMIZE_HAZARDS`: Avoids confirmed closures and applies penalty weights to `CORROBORATED` hazards.

**Response `200 OK`:**
```json
{
  "route_id": "ROUTE-A_STAR-1728551200",
  "mode": "AVOID_CONFIRMED_CLOSURES",
  "is_reachable": true,
  "algorithm_used": "A* (Haversine Heuristic)",
  "origin": {
    "id": "INT_MARKET_VAN_NESS",
    "name": "Market St & Van Ness Ave",
    "latitude": 37.7753,
    "longitude": -122.4194
  },
  "destination": {
    "id": "INT_MARKET_4TH",
    "name": "Market St & 4th St",
    "latitude": 37.7835,
    "longitude": -122.4078
  },
  "path_node_ids": [
    "INT_MARKET_VAN_NESS",
    "INT_MARKET_11TH",
    "INT_MISSION_11TH",
    "INT_MISSION_10TH",
    "INT_MISSION_9TH",
    "INT_MISSION_8TH",
    "INT_MISSION_7TH",
    "INT_MISSION_6TH",
    "INT_MISSION_5TH",
    "INT_MISSION_4TH",
    "INT_MARKET_4TH"
  ],
  "segments": [
    {
      "edge_id": "E_MKT_VN_11",
      "street_name": "Market St",
      "source_node_id": "INT_MARKET_VAN_NESS",
      "target_node_id": "INT_MARKET_11TH",
      "distance_meters": 130.4,
      "travel_time_seconds": 11.7,
      "availability": "OPEN"
    }
  ],
  "total_distance_meters": 1540.2,
  "total_distance_km": 1.54,
  "total_travel_time_seconds": 158.4,
  "total_travel_time_minutes": 2.6,
  "travel_time_supported": true,
  "avoided_hazards": [
    {
      "incident_id": "DEMO-INC-101",
      "title": "Flooded Underpass & Road Blockage",
      "hazard_type": "flood",
      "edge_id": "E_MKT_10_9",
      "street_name": "Market St",
      "reason": "Road edge closed due to OFFICIALLY_CONFIRMED flood incident."
    }
  ],
  "cautions": [],
  "route_change_explanation": "Route adjusted via Mission St to bypass confirmed hazard: Flooded Underpass & Road Blockage on Market St.",
  "safety_disclaimer": "Route conditions are dynamic and subject to ongoing field hazards. No route can be guaranteed completely safe; field units must exercise tactical caution.",
  "last_data_update": "2026-10-10T06:15:30Z",
  "graph_status": "COMPLETE",
  "nodes_explored": 12
}
```

---

### `GET /api/routing/network`
Returns all registered road intersections (nodes) and road segments (edges) in the road graph.

---

### `GET /api/routing/presets`
Returns predefined municipal test corridors for demonstration.

---

## 5. External Data Ingestion & Feed Management

### `GET /api/ingestion/sources`
Returns operational health, configuration status, and telemetry for all registered external feed adapters.

**Response `200 OK`:**
```json
[
  {
    "feed_id": "demo-feed",
    "name": "Municipal Dispatch CAD (Demo Feed)",
    "provider_type": "emergency_dispatch",
    "health": "HEALTHY",
    "enabled": true,
    "auth_required": false,
    "auth_configured": true,
    "endpoint_url": "local://demo-cad-system",
    "last_successful_fetch": "2026-10-10T06:10:00Z",
    "consecutive_failures": 0,
    "total_records_ingested": 3,
    "total_fetches": 5,
    "is_cached": false
  },
  {
    "feed_id": "nws-weather-alerts",
    "name": "NOAA / NWS Severe Weather & Hazard Alerts",
    "provider_type": "official_weather",
    "health": "HEALTHY",
    "enabled": true,
    "auth_required": false,
    "auth_configured": true,
    "endpoint_url": "https://api.weather.gov/alerts/active",
    "last_successful_fetch": "2026-10-10T06:12:00Z",
    "total_records_ingested": 2,
    "is_cached": false
  },
  {
    "feed_id": "twitter-authorized-api",
    "name": "Municipal Twitter / X Stream (Authorized API v2)",
    "provider_type": "social_media",
    "health": "DISABLED",
    "enabled": false,
    "auth_required": true,
    "auth_configured": false,
    "setup_requirements": "Requires Twitter Developer Bearer Token in TWITTER_BEARER_TOKEN."
  },
  {
    "feed_id": "reddit-authorized-api",
    "name": "Reddit Local Hazards (Authorized OAuth API)",
    "provider_type": "social_media",
    "health": "DISABLED",
    "enabled": false,
    "auth_required": true,
    "auth_configured": false,
    "setup_requirements": "Requires Reddit Developer OAuth credentials in REDDIT_CLIENT_ID & REDDIT_CLIENT_SECRET."
  }
]
```

---

### `POST /api/ingestion/sources/{feed_id}/refresh`
Triggers an immediate polling and normalization pass for the specified feed.

**Query Parameters:**
- `force_fixture` (bool, default `false`): When `true`, ingests from saved example response fixture for testing.
- `use_cache_on_failure` (bool, default `false`): When `true`, serves labeled cached records if the live endpoint fails.

**Response `200 OK`:**
```json
{
  "feed_id": "nws-weather-alerts",
  "feed_name": "NOAA / NWS Severe Weather & Hazard Alerts",
  "success": true,
  "status": "HEALTHY",
  "records_fetched": 2,
  "records_new": 0,
  "records_updated": 2,
  "records_duplicate": 2,
  "records_uncertain_location": 1,
  "is_cached": false,
  "fetched_at": "2026-10-10T06:15:00Z"
}
```

---

### `POST /api/ingestion/refresh`
Triggers a refresh pass across all enabled adapters.

---

### `GET /api/ingestion/history`
Returns recent ingestion audit entries (up to `limit=100`, default `50`).

**Response `200 OK`:**
```json
[
  {
    "id": "LOG-1728551200",
    "timestamp": "2026-10-10T06:15:00Z",
    "feed_id": "nws-weather-alerts",
    "feed_name": "NOAA / NWS Severe Weather & Hazard Alerts",
    "status": "HEALTHY",
    "records_fetched": 2,
    "records_new": 0,
    "records_updated": 2,
    "duration_ms": 342.1,
    "message": "Fetched 2 alerts (0 new, 2 updated, 2 deduplicated repeats).",
    "is_cached": false
  }
]
```
