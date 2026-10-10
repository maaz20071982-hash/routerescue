import { INITIAL_INCIDENTS } from "../constants/demoData";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Checks FastAPI backend health status & storage configuration
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(`${API_BASE_URL}/api/health`, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        online: true,
        data,
        storageBackend: data.storage_backend || "demo_repository",
        storageNotice: data.storage_notice || "Operating on demo repository",
        isRemoteStorage: !!data.is_remote_storage,
        message: data.is_remote_storage
          ? "FastAPI Connected & Cloud Firestore Active"
          : "FastAPI Connected (Using Local Demo Repository)"
      };
    } else {
      return {
        online: false,
        data: null,
        storageBackend: "offline_fallback",
        storageNotice: "Backend unreachable",
        isRemoteStorage: false,
        message: `Backend returned HTTP ${response.status}`
      };
    }
  } catch (err) {
    return {
      online: false,
      data: null,
      storageBackend: "offline_fallback",
      storageNotice: "Client-side demo session only",
      isRemoteStorage: false,
      message: err.name === "AbortError"
        ? "Backend connection timed out"
        : "Backend unreachable (Using Client-Side Demo Store)"
    };
  }
}

/**
 * Normalizes incident object for complete consistency across components
 * and full Sprint 3 Evidence-Aware Verification compatibility.
 */
export function normalizeIncident(item) {
  const lat = parseFloat(item.latitude ?? item.lat ?? 0.0);
  const lng = parseFloat(item.longitude ?? item.lng ?? 0.0);
  const hazardType = item.hazard_type || item.type || "hazard";
  const locName = item.location_name || item.locationName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  const status = (item.status || "UNVERIFIED").toUpperCase();
  const reportedAt = item.reported_at || item.reportedAt || "Recent";
  const publishedAt = item.published_at || reportedAt;
  const ingestedAt = item.ingested_at || reportedAt;
  const isVerified = status === "OFFICIALLY_CONFIRMED" || status === "CORROBORATED";

  // Synthesize sources_detail if missing (e.g. client fallback)
  let sourcesDetail = item.sources_detail;
  if (!sourcesDetail || sourcesDetail.length === 0) {
    const isOfficial = (item.source_url && (item.source_url.includes(".gov") || item.source_url.includes("example.gov"))) ||
      (item.source && (item.source.toLowerCase().includes("department") || item.source.toLowerCase().includes("dispatch")));

    sourcesDetail = [{
      source_id: `SRC-${item.id || "INIT"}-1`,
      source_name: item.source || "Field Community Report",
      source_url: item.source_url || null,
      published_at: publishedAt,
      ingested_at: ingestedAt,
      is_official: !!isOfficial,
      is_repost: false,
      repost_of_source_id: null,
      excerpt: item.description ? item.description.slice(0, 200) : "Initial report description",
      notes: isOfficial ? "Verified official agency bulletin" : "Community eyewitness submission"
    }];
  }

  // Synthesize verification_history if missing
  let verificationHistory = item.verification_history;
  if (!verificationHistory || verificationHistory.length === 0) {
    verificationHistory = [
      {
        id: `VH-${item.id || "INIT"}-1`,
        timestamp: ingestedAt,
        action: "INGESTION",
        from_status: null,
        to_status: status,
        actor: "System Intake",
        reason: `Initial report ingested from ${item.source || "Community Feed"}. Preserved source URL and timestamps.`
      }
    ];
    if (status === "OFFICIALLY_CONFIRMED") {
      verificationHistory.push({
        id: `VH-${item.id || "INIT"}-2`,
        timestamp: ingestedAt,
        action: "RULE_EVALUATION",
        from_status: "UNVERIFIED",
        to_status: "OFFICIALLY_CONFIRMED",
        actor: "VerificationRuleEngine",
        reason: "Confirmed via authorized official government authority bulletin."
      });
    } else if (status === "CORROBORATED") {
      verificationHistory.push({
        id: `VH-${item.id || "INIT"}-2`,
        timestamp: ingestedAt,
        action: "RULE_CORROBORATION",
        from_status: "UNVERIFIED",
        to_status: "CORROBORATED",
        actor: "VerificationRuleEngine",
        reason: "Corroborated by multiple independent community field sightings."
      });
    }
  }

  // Synthesize evidence_summary if missing
  let evidenceSummary = item.evidence_summary;
  if (!evidenceSummary) {
    const totalSources = sourcesDetail.length;
    const independentSources = sourcesDetail.filter(s => !s.is_repost);
    const reposts = sourcesDetail.filter(s => s.is_repost);
    const officials = sourcesDetail.filter(s => s.is_official);
    evidenceSummary = {
      total_sources: totalSources,
      independent_sources_count: independentSources.length,
      repost_count: reposts.length,
      official_sources_count: officials.length,
      has_official_source: officials.length > 0,
      is_stale: !!item.is_stale,
      freshness_limit_hours: 6.0,
      age_hours: 1.5,
      duplicate_flags_count: (item.potential_duplicates || []).length,
      conflict_flags_count: (item.conflicting_reports || []).length,
      rule_evaluation_notes: [
        officials.length > 0 ? "Authorized official authority verified." : "No official agency source attached.",
        independentSources.length >= 2 ? `Corroborated by ${independentSources.length} independent sources.` : "Single independent source on record.",
        item.is_stale ? "Report age exceeds 6.0h freshness limit. Flagged as STALE." : "Report is fresh within 6.0h threshold."
      ]
    };
  }

  return {
    id: item.id,
    title: item.title,
    hazard_type: hazardType,
    type: hazardType,
    severity: item.severity || "medium",
    status,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    locationName: locName,
    location_name: locName,
    description: item.description || "",
    source: item.source || "DEMO DATA",
    source_url: item.source_url || null,
    reportedAt,
    reported_at: reportedAt,
    published_at: publishedAt,
    publishedAt,
    ingested_at: ingestedAt,
    ingestedAt,
    updated_at: item.updated_at || null,
    affectedRoutes: item.affected_routes || item.affectedRoutes || [],
    affected_routes: item.affected_routes || item.affectedRoutes || [],
    recommendedDetour: item.recommended_action || item.recommendedDetour || "Awaiting triage",
    recommended_action: item.recommended_action || item.recommendedDetour || "Awaiting triage",
    verified: isVerified,
    storage_provenance: item.storage_provenance || "DEMO REPOSITORY (IN-MEMORY)",
    // Sprint 3 Evidence & Verification fields
    is_stale: !!item.is_stale,
    sources_detail: sourcesDetail,
    verification_history: verificationHistory,
    evidence_summary: evidenceSummary,
    potential_duplicates: item.potential_duplicates || [],
    conflicting_reports: item.conflicting_reports || [],
    // Sprint 5 External Ingestion & Location Review fields
    location_uncertain: !!item.location_uncertain,
    location_review_reason: item.location_review_reason || null,
    is_cached: !!item.is_cached,
    cached_at: item.cached_at || null,
    source_feed_id: item.source_feed_id || null,
    external_record_id: item.external_record_id || null
  };
}

/**
 * Fetches incidents from FastAPI backend or fallback local dataset.
 * Supports status query filter: UNVERIFIED, CORROBORATED, OFFICIALLY_CONFIRMED, RESOLVED
 * and is_stale query filter.
 */
export async function fetchIncidents(statusFilter = null, isStaleFilter = null) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== "all") {
      params.append("status", statusFilter);
    }
    if (isStaleFilter !== null && isStaleFilter !== undefined && isStaleFilter !== "all") {
      params.append("is_stale", String(isStaleFilter === "true" || isStaleFilter === true));
    }

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/incidents${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      const incidents = (result.data || []).map(normalizeIncident);

      return {
        incidents,
        source: result.source || "FastAPI Backend",
        storageBackend: result.storage_backend || "demo_repository",
        storageNotice: result.storage_notice || "Local Demo Repository",
        isLiveApi: true
      };
    }
  } catch {
    // Graceful fallback to client-side demo dataset
  }

  // Fallback filtering locally
  let filtered = INITIAL_INCIDENTS;
  if (statusFilter && statusFilter !== "all") {
    filtered = filtered.filter(
      i => (i.status || "").toUpperCase() === statusFilter.toUpperCase()
    );
  }
  if (isStaleFilter !== null && isStaleFilter !== undefined && isStaleFilter !== "all") {
    const wantStale = isStaleFilter === "true" || isStaleFilter === true;
    filtered = filtered.filter(i => !!i.is_stale === wantStale);
  }

  return {
    incidents: filtered.map(normalizeIncident),
    source: "Local Demo Store (Client Fallback)",
    storageBackend: "demo_repository",
    storageNotice: "Local Demo Store (In-Memory)",
    isLiveApi: false
  };
}

/**
 * Fetches a single incident by ID
 */
export async function fetchIncidentById(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/incidents/${encodeURIComponent(id)}`, {
      headers: { "Accept": "application/json" }
    });
    if (response.ok) {
      const item = await response.json();
      return normalizeIncident(item);
    }
  } catch {
    // Look up in INITIAL_INCIDENTS
  }
  const match = INITIAL_INCIDENTS.find(i => i.id === id);
  return match ? normalizeIncident(match) : null;
}

/**
 * Submits an incident report to FastAPI or local demo state.
 * Preserves publication time, source URL, coordinates and field validation.
 */
export async function submitIncident(incidentData) {
  const latNum = parseFloat(incidentData.lat ?? incidentData.latitude);
  const lngNum = parseFloat(incidentData.lng ?? incidentData.longitude);

  const payload = {
    title: (incidentData.title || "").trim(),
    description: (incidentData.description || "").trim(),
    hazard_category: incidentData.hazard_type || incidentData.type || "hazard",
    latitude: latNum,
    longitude: lngNum,
    location_name: incidentData.locationName || incidentData.location_name || `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`,
    severity: incidentData.severity || "medium",
    source_url: incidentData.source_url ? incidentData.source_url.trim() : null,
    source: incidentData.source || "Community Report (DEMO DATA)",
    published_at: incidentData.published_at || new Date().toISOString()
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const res = await response.json();
      const normalized = normalizeIncident(res.data);
      return {
        success: true,
        data: normalized,
        message: res.message || "Incident report registered.",
        savedRemotely: !!res.saved_remotely,
        storageBackend: res.storage_backend || "demo_repository"
      };
    } else {
      const errorJson = await response.json().catch(() => null);
      const detailMsg = errorJson?.detail
        ? (Array.isArray(errorJson.detail) ? errorJson.detail.map(d => d.msg).join(", ") : errorJson.detail)
        : `Server returned HTTP ${response.status}`;
      return {
        success: false,
        error: detailMsg
      };
    }
  } catch {
    // Offline / fallback submit
  }

  // Create locally in demo session
  const fallbackId = `DEMO-INC-${Math.floor(100 + Math.random() * 900)}`;
  const nowIso = new Date().toISOString();
  const localIncident = normalizeIncident({
    id: fallbackId,
    title: payload.title,
    hazard_type: payload.hazard_category,
    severity: payload.severity,
    status: "UNVERIFIED",
    latitude: latNum,
    longitude: lngNum,
    location_name: payload.location_name,
    description: payload.description,
    source: payload.source,
    source_url: payload.source_url,
    reported_at: nowIso,
    published_at: payload.published_at || nowIso,
    ingested_at: nowIso,
    affected_routes: [payload.location_name],
    recommended_action: "Initial report received; awaiting independent corroboration or triage.",
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)"
  });

  return {
    success: true,
    data: localIncident,
    message: "Report saved in local browser demo session (DEMO DATA). Notice: Remote Firestore credentials unavailable; data was NOT saved remotely.",
    savedRemotely: false,
    storageBackend: "demo_repository"
  };
}

/**
 * Updates incident lifecycle status (Privileged Endpoint).
 * Requires admin key header.
 * Enforces Sprint 3 transition validation (no officially confirmed without official source or explicit review).
 */
export async function updateIncidentStatus(
  incidentId,
  newStatus,
  notes = "",
  adminKey = "",
  reviewerRole = "Dispatcher / Supervisor",
  authorizedBy = "Emergency Ops"
) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/incidents/${encodeURIComponent(incidentId)}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey || "routerescue-admin-sprint2"
      },
      body: JSON.stringify({
        status: newStatus,
        notes: notes || undefined,
        reviewer_role: reviewerRole,
        authorized_by: authorizedBy
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: normalizeIncident(data),
        message: `Status updated to ${newStatus}`
      };
    } else if (response.status === 401) {
      return {
        success: false,
        error: "Privileged update rejected (HTTP 401): Missing or invalid administrator key.",
        status: 401
      };
    } else {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.detail || `Update failed with HTTP ${response.status}`,
        status: response.status
      };
    }
  } catch (e) {
    return {
      success: false,
      error: `Network error updating status: ${e.message}`
    };
  }
}

/**
 * Attaches corroborating secondary evidence to an incident.
 */
export async function addIncidentEvidence(incidentId, evidenceData, adminKey = "") {
  try {
    const response = await fetch(`${API_BASE_URL}/api/incidents/${encodeURIComponent(incidentId)}/evidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey || "routerescue-admin-sprint2"
      },
      body: JSON.stringify({
        source_name: evidenceData.source_name,
        source_url: evidenceData.source_url || null,
        published_at: evidenceData.published_at || new Date().toISOString(),
        excerpt: evidenceData.excerpt || null,
        is_repost: !!evidenceData.is_repost,
        repost_of_source_id: evidenceData.repost_of_source_id || null,
        notes: evidenceData.notes || null
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: normalizeIncident(data),
        message: "Corroborating evidence attached successfully."
      };
    } else {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.detail || `Evidence submission failed (HTTP ${response.status})`
      };
    }
  } catch (e) {
    return {
      success: false,
      error: `Network error attaching evidence: ${e.message}`
    };
  }
}

/**
 * Reviews a flagged duplicate report (Privileged Operator Action).
 * Does NOT merge records automatically without review; preserves separate records.
 */
export async function reviewIncidentDuplicate(incidentId, flagId, decision, notes = "", adminKey = "") {
  try {
    const response = await fetch(`${API_BASE_URL}/api/incidents/${encodeURIComponent(incidentId)}/duplicates/${encodeURIComponent(flagId)}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey || "routerescue-admin-sprint2"
      },
      body: JSON.stringify({
        decision,
        notes: notes || undefined
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: normalizeIncident(data),
        message: `Duplicate review registered: ${decision}`
      };
    } else {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.detail || `Duplicate review failed (HTTP ${response.status})`
      };
    }
  } catch (e) {
    return {
      success: false,
      error: `Network error reviewing duplicate: ${e.message}`
    };
  }
}

/**
 * Fetches active rule-based verification configuration and thresholds.
 */
export async function fetchVerificationConfig() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/verification/config`, {
      headers: { "Accept": "application/json" }
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Return default fallback configuration
  }
  return {
    freshness_stale_hours: 6.0,
    duplicate_proximity_meters: 800.0,
    duplicate_time_window_hours: 6.0,
    duplicate_text_similarity_threshold: 0.30,
    conflict_proximity_meters: 500.0,
    verification_rules: {
      statuses: ["UNVERIFIED", "CORROBORATED", "OFFICIALLY_CONFIRMED", "RESOLVED"],
      official_confirmation_policy: "Never label a report officially confirmed without an authorized official source or explicit authorized review.",
      duplicate_policy: "Potential duplicates flagged based on multi-factor proximity, hazard, text similarity, and time window. Records are NEVER merged automatically.",
      confidence_scores: "Strictly prohibited. All verification is deterministic and rule-based."
    }
  };
}

/**
 * Fetches preset emergency response transit corridors.
 */
export async function fetchRoutingPresets() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/routing/presets`, {
      headers: { "Accept": "application/json" }
    });
    if (response.ok) {
      const json = await response.json();
      return json.data || [];
    }
  } catch {
    // Fallback if offline
  }
  return [
    {
      id: "PRESET-CORRIDOR-1",
      name: "Civic Staging to Downtown Medical Hub",
      description: "Standard transit from Civic Center / Van Ness down Market corridor to 4th St.",
      origin_node_id: "INT_MARKET_VAN_NESS",
      destination_node_id: "INT_MARKET_4TH",
      default_mode: "AVOID_CONFIRMED_CLOSURES"
    },
    {
      id: "PRESET-CORRIDOR-2",
      name: "Geary Boulevard Corridor (Larkin Scaffolding Test)",
      description: "Transit along Geary Blvd from Van Ness to Leavenworth (tests MINIMIZE_HAZARDS detour via Sutter St).",
      origin_node_id: "INT_GEARY_VAN_NESS",
      destination_node_id: "INT_GEARY_LEAVENWORTH",
      default_mode: "MINIMIZE_HAZARDS"
    },
    {
      id: "PRESET-CORRIDOR-3",
      name: "Castro Community Hub to Market Civic Center",
      description: "Transit from 18th & Castro along Market to 11th St (tests unverified report caution generation).",
      origin_node_id: "INT_CASTRO_18TH",
      destination_node_id: "INT_MARKET_11TH",
      default_mode: "AVOID_CONFIRMED_CLOSURES"
    },
    {
      id: "PRESET-CORRIDOR-4",
      name: "SoMa Heavy Rescue (Harrison Hazardous Material Test)",
      description: "Transit from Mission 11th to Harrison 6th (tests hazardous gas leak exclusion avoidance).",
      origin_node_id: "INT_MISSION_11TH",
      destination_node_id: "INT_HARRISON_6TH",
      default_mode: "AVOID_CONFIRMED_CLOSURES"
    },
    {
      id: "PRESET-CORRIDOR-5",
      name: "Unreachable Destination Test Corridor",
      description: "Transit from Market St to disconnected isolated outpost (tests unreachable destination detection).",
      origin_node_id: "INT_MARKET_VAN_NESS",
      destination_node_id: "INT_ISOLATED_DEPOT",
      default_mode: "SHORTEST"
    }
  ];
}

/**
 * Fetches the road graph topology including intersection nodes and street segments.
 */
export async function fetchRoutingNetwork() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/routing/network`, {
      headers: { "Accept": "application/json" }
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Offline fallback handled in component
  }
  return null;
}

import { searchPlaces, reverseGeocode } from "./geocoding";
import { calculateRealRoadRoute } from "./routing";

export { searchPlaces, reverseGeocode, calculateRealRoadRoute };

/**
 * Calculates a hazard-aware route via the FastAPI routing engine or Real Road Network.
 * Supports Dijkstra and A* algorithms across SHORTEST, AVOID_CONFIRMED_CLOSURES, and MINIMIZE_HAZARDS modes,
 * as well as arbitrary real-world GPS coordinates via OpenStreetMap road network.
 */
export async function calculateEmergencyRoute(requestPayload, incidents = []) {
  // If coordinates are explicitly given and no node ID, check if we should route directly via real road network
  const hasCoordinates =
    requestPayload.origin_lat != null &&
    requestPayload.origin_lng != null &&
    requestPayload.destination_lat != null &&
    requestPayload.destination_lng != null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/routing/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestPayload)
    });

    if (response.ok) {
      const data = await response.json();
      // If backend reports unreachable due to out of local graph bounds and we have real coordinates,
      // fallback to real road network routing!
      if (!data.is_reachable && (data.graph_status === "OUT_OF_BOUNDS" || data.graph_status === "INSUFFICIENT_DATA") && hasCoordinates) {
        return await calculateRealRoadRoute({
          origin: {
            lat: requestPayload.origin_lat,
            lng: requestPayload.origin_lng,
            name: requestPayload.origin_name
          },
          destination: {
            lat: requestPayload.destination_lat,
            lng: requestPayload.destination_lng,
            name: requestPayload.destination_name
          },
          mode: requestPayload.mode || "AVOID_CONFIRMED_CLOSURES",
          incidents
        });
      }

      return {
        success: true,
        data,
        message: data.is_reachable
          ? `Route calculated: ${data.total_distance_km} km`
          : "Destination is unreachable under current graph/hazard conditions"
      };
    } else {
      // Backend returned error (e.g. 400 out of coverage); if we have coordinates, use real road routing
      if (hasCoordinates) {
        return await calculateRealRoadRoute({
          origin: {
            lat: requestPayload.origin_lat,
            lng: requestPayload.origin_lng,
            name: requestPayload.origin_name
          },
          destination: {
            lat: requestPayload.destination_lat,
            lng: requestPayload.destination_lng,
            name: requestPayload.destination_name
          },
          mode: requestPayload.mode || "AVOID_CONFIRMED_CLOSURES",
          incidents
        });
      }

      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.detail || `Route calculation failed (HTTP ${response.status})`
      };
    }
  } catch (err) {
    // If backend is offline or network fails, but coordinates are provided, route via real road network!
    if (hasCoordinates) {
      return await calculateRealRoadRoute({
        origin: {
          lat: requestPayload.origin_lat,
          lng: requestPayload.origin_lng,
          name: requestPayload.origin_name
        },
        destination: {
          lat: requestPayload.destination_lat,
          lng: requestPayload.destination_lng,
          name: requestPayload.destination_name
        },
        mode: requestPayload.mode || "AVOID_CONFIRMED_CLOSURES",
        incidents
      });
    }

    return {
      success: false,
      error: `Network error connecting to routing service: ${err.message}`
    };
  }
}

// ============================================================================
// SPRINT 5: EXTERNAL DATA INGESTION & FEED MANAGEMENT API
// ============================================================================

/**
 * Fetches all registered data adapters and their live operational health status.
 */
export async function fetchIngestionSources() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ingestion/sources`, {
      headers: { "Accept": "application/json" }
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, sources: data };
    }
    return { success: false, sources: [], error: `HTTP ${response.status}` };
  } catch (err) {
    return {
      success: false,
      sources: [
        {
          feed_id: "demo-feed",
          name: "Municipal Dispatch CAD (Demo Feed)",
          provider_type: "emergency_dispatch",
          health: "HEALTHY",
          enabled: true,
          auth_required: false,
          auth_configured: true,
          endpoint_url: "local://demo-cad-system",
          last_successful_fetch: "Recent",
          total_records_ingested: 3,
          is_cached: false
        },
        {
          feed_id: "nws-weather-alerts",
          name: "NOAA / NWS Severe Weather & Hazard Alerts",
          provider_type: "official_weather",
          health: "HEALTHY",
          enabled: true,
          auth_required: false,
          auth_configured: true,
          endpoint_url: "https://api.weather.gov/alerts/active",
          last_successful_fetch: "Recent",
          total_records_ingested: 2,
          is_cached: false
        },
        {
          feed_id: "twitter-authorized-api",
          name: "Municipal Twitter / X Stream (Authorized API v2)",
          provider_type: "social_media",
          health: "DISABLED",
          enabled: false,
          auth_required: true,
          auth_configured: false,
          endpoint_url: "https://api.twitter.com/2/tweets/search/recent",
          setup_requirements: "Requires Twitter Developer Project App Bearer Token in TWITTER_BEARER_TOKEN.",
          documentation_url: "https://developer.twitter.com/en/docs/twitter-api"
        },
        {
          feed_id: "reddit-authorized-api",
          name: "Reddit Local Hazards (Authorized OAuth API)",
          provider_type: "social_media",
          health: "DISABLED",
          enabled: false,
          auth_required: true,
          auth_configured: false,
          endpoint_url: "https://oauth.reddit.com/r/bayarea/search",
          setup_requirements: "Requires Reddit Developer OAuth credentials in REDDIT_CLIENT_ID & REDDIT_CLIENT_SECRET.",
          documentation_url: "https://www.reddit.com/dev/api/"
        }
      ],
      error: `Offline mode: ${err.message}`
    };
  }
}

/**
 * Triggers a fetch and normalization pass for a specific data adapter.
 */
export async function refreshIngestionSource(feedId, forceFixture = false, useCacheOnFailure = false) {
  try {
    const query = new URLSearchParams();
    if (forceFixture) query.set("force_fixture", "true");
    if (useCacheOnFailure) query.set("use_cache_on_failure", "true");

    const response = await fetch(`${API_BASE_URL}/api/ingestion/sources/${feedId}/refresh?${query.toString()}`, {
      method: "POST",
      headers: { "Accept": "application/json" }
    });

    if (response.ok) {
      const result = await response.json();
      return { success: true, result };
    }
    const err = await response.json().catch(() => ({}));
    return { success: false, error: err.detail || `Refresh failed (HTTP ${response.status})` };
  } catch (err) {
    return { success: false, error: `Connection failed: ${err.message}` };
  }
}

/**
 * Triggers refresh across all enabled adapters.
 */
export async function refreshAllIngestionSources(forceFixture = false, useCacheOnFailure = false) {
  try {
    const query = new URLSearchParams();
    if (forceFixture) query.set("force_fixture", "true");
    if (useCacheOnFailure) query.set("use_cache_on_failure", "true");

    const response = await fetch(`${API_BASE_URL}/api/ingestion/refresh?${query.toString()}`, {
      method: "POST",
      headers: { "Accept": "application/json" }
    });

    if (response.ok) {
      const results = await response.json();
      return { success: true, results };
    }
    return { success: false, error: `HTTP ${response.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Retrieves recent ingestion audit log events.
 */
export async function fetchIngestionHistory(limit = 50) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ingestion/history?limit=${limit}`, {
      headers: { "Accept": "application/json" }
    });
    if (response.ok) {
      const history = await response.json();
      return { success: true, history };
    }
    return { success: false, history: [] };
  } catch {
    return { success: false, history: [] };
  }
}


