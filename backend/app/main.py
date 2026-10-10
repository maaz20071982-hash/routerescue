import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status as http_status
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    CONFLICT_PROXIMITY_METERS,
    DUPLICATE_PROXIMITY_METERS,
    DUPLICATE_TEXT_SIMILARITY_THRESHOLD,
    DUPLICATE_TIME_WINDOW_HOURS,
    ENVIRONMENT,
    FRESHNESS_STALE_HOURS,
)
from app.models import (
    DuplicateReviewRequest,
    EvidenceCreate,
    HealthResponse,
    IncidentCreate,
    IncidentListResponse,
    IncidentResponse,
    IncidentStatus,
    IncidentStatusUpdate,
)
from app.ingestion.manager import get_ingestion_manager
from app.ingestion.models import (
    FeedSourceHealth,
    IngestionLogEntry,
    IngestionResult,
    SourceFeedStatus,
)
from app.routing.demo_network import PRESET_CORRIDORS, build_default_road_graph
from app.routing.models import (
    RouteCalculationRequest,
    RouteCalculationResponse,
)
from app.routing.router import RouteCalculator
from app.security import verify_admin_key
from app.storage import get_repository

logger = logging.getLogger("routerescue.api")

app = FastAPI(
    title="RouteRescue API",
    version="5.0.0",
    description="RouteRescue Emergency and Incident Routing Service API — Sprint 5 Source-Independent Ingestion & External Feeds",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Configuration
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"  # Open for development
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health", response_model=HealthResponse, summary="Service & Storage Health Check")
def get_health():
    """
    Returns operational health status, active storage backend,
    and provenance notice.
    """
    repo = get_repository()
    storage_info = repo.get_storage_info()
    return HealthResponse(
        status="healthy",
        service="RouteRescue API",
        version="3.0.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=ENVIRONMENT,
        storage_backend=storage_info["storage_backend"],
        storage_notice=storage_info["storage_notice"],
        is_remote_storage=storage_info["is_remote"],
    )

@app.get("/api/verification/config", summary="Verification & Freshness Configuration Limits")
def get_verification_config():
    """
    Returns active configurable limits for freshness, duplicate detection,
    and spatial/temporal thresholds.
    """
    return {
        "freshness_stale_hours": FRESHNESS_STALE_HOURS,
        "duplicate_proximity_meters": DUPLICATE_PROXIMITY_METERS,
        "duplicate_time_window_hours": DUPLICATE_TIME_WINDOW_HOURS,
        "duplicate_text_similarity_threshold": DUPLICATE_TEXT_SIMILARITY_THRESHOLD,
        "conflict_proximity_meters": CONFLICT_PROXIMITY_METERS,
        "verification_rules": {
            "statuses": ["UNVERIFIED", "CORROBORATED", "OFFICIALLY_CONFIRMED", "RESOLVED"],
            "official_confirmation_policy": (
                "Never label a report officially confirmed without an authorized official source "
                "or explicit authorized review with documented notes."
            ),
            "duplicate_policy": (
                "Potential duplicates flagged based on multi-factor proximity, hazard, text similarity, "
                "and time window. Records are NEVER merged automatically without human review."
            ),
            "confidence_scores": "Strictly prohibited. All verification is deterministic and rule-based."
        }
    }

@app.get("/api/incidents", response_model=IncidentListResponse, summary="List & Filter Incidents")
def get_incidents(
    status: Optional[str] = Query(None, description="Filter by status: UNVERIFIED, CORROBORATED, OFFICIALLY_CONFIRMED, RESOLVED"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard: flood, hazard, congestion, infrastructure, fire"),
    severity: Optional[str] = Query(None, description="Filter by severity: low, medium, high, critical"),
    is_stale: Optional[bool] = Query(None, description="Filter by freshness: true for stale reports, false for fresh"),
):
    """
    Returns incident list from the active repository (Firestore or Demo Repository).
    Supports multi-attribute filtering by lifecycle status, hazard category, severity, and freshness.
    Includes evidence summary, source provenance ledger, and duplicate/conflict flags.
    """
    repo = get_repository()
    try:
        items = repo.list_incidents(
            status=status,
            hazard_type=hazard_type,
            severity=severity,
            is_stale=is_stale,
        )
        storage_info = repo.get_storage_info()
    except Exception as e:
        logger.exception("Storage failure during incident listing")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage operation failed: {str(e)}",
        )

    return IncidentListResponse(
        data=[IncidentResponse(**item) for item in items],
        total=len(items),
        storage_backend=storage_info["storage_backend"],
        storage_notice=storage_info["storage_notice"],
        source="DEMO DATA" if not storage_info["is_remote"] else "CLOUD FIRESTORE",
    )

@app.get("/api/incidents/{incident_id}", response_model=IncidentResponse, summary="Get Incident by ID")
def get_incident(incident_id: str):
    """
    Retrieves full details for a single incident including evidence summary,
    verification history, potential duplicates, and conflicting reports.
    Returns HTTP 404 if the incident does not exist.
    """
    repo = get_repository()
    try:
        item = repo.get_incident(incident_id)
    except Exception as e:
        logger.exception("Storage failure during incident retrieval")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage operation failed: {str(e)}",
        )

    if not item:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Incident '{incident_id}' not found.",
        )
    return IncidentResponse(**item)

@app.post("/api/incidents", status_code=http_status.HTTP_201_CREATED, summary="Submit Incident Report")
def create_incident(report: IncidentCreate):
    """
    Creates a new incident report with preserved publication & ingestion times,
    source URL/identifier, and initial UNVERIFIED state.
    Flags potential duplicates against existing incidents without merging.
    """
    repo = get_repository()
    try:
        created_item, storage_meta = repo.create_incident(report)
    except Exception as e:
        logger.exception("Storage failure during incident creation")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage save failure: {str(e)}",
        )

    return {
        "status": "success",
        "data": IncidentResponse(**created_item),
        "message": storage_meta["message"],
        "storage_backend": storage_meta["storage_backend"],
        "saved_remotely": storage_meta["saved_remotely"],
    }

@app.patch("/api/incidents/{incident_id}/status", response_model=IncidentResponse, summary="Update Incident Lifecycle Status (Privileged)")
def update_incident_status(
    incident_id: str,
    update: IncidentStatusUpdate,
    _authorized: bool = Depends(verify_admin_key),
):
    """
    Privileged endpoint to update an incident's lifecycle status.
    Enforces strict Sprint 3 verification rules:
    - Never labels a report officially confirmed without an authorized official source or explicit authorized review notes.
    - Records state transition into verification history.
    Requires a valid admin key in X-Admin-Key or Authorization header.
    """
    repo = get_repository()
    try:
        updated_item = repo.update_status(
            incident_id=incident_id,
            new_status=update.status,
            notes=update.notes,
            reviewer_role=update.reviewer_role,
            authorized_by=update.authorized_by,
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        logger.exception("Storage failure during incident status update")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage update failure: {str(e)}",
        )

    if not updated_item:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Incident '{incident_id}' not found for status update.",
        )
    return IncidentResponse(**updated_item)

@app.put("/api/incidents/{incident_id}/status", response_model=IncidentResponse, include_in_schema=False)
def update_incident_status_put(
    incident_id: str,
    update: IncidentStatusUpdate,
    _authorized: bool = Depends(verify_admin_key),
):
    """Alias for PATCH endpoint."""
    return update_incident_status(incident_id, update, _authorized)

@app.post("/api/incidents/{incident_id}/evidence", response_model=IncidentResponse, summary="Attach Corroborating Evidence")
def add_incident_evidence(
    incident_id: str,
    evidence: EvidenceCreate,
    _authorized: bool = Depends(verify_admin_key),
):
    """
    Attaches secondary corroborating evidence or witness reports to an existing incident.
    Distinguishes independent sources from reposts/quotes.
    Preserves publication timestamp, source URL/identifier, and ingestion time.
    """
    repo = get_repository()
    try:
        updated_item = repo.add_evidence(incident_id, evidence)
    except Exception as e:
        logger.exception("Storage failure during evidence addition")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage update failure: {str(e)}",
        )

    if not updated_item:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Incident '{incident_id}' not found for evidence addition.",
        )
    return IncidentResponse(**updated_item)

@app.post("/api/incidents/{incident_id}/duplicates/{flag_id}/review", response_model=IncidentResponse, summary="Review Flagged Duplicate (Privileged)")
def review_incident_duplicate(
    incident_id: str,
    flag_id: str,
    review: DuplicateReviewRequest,
    _authorized: bool = Depends(verify_admin_key),
):
    """
    Privileged operator action to review a flagged potential duplicate.
    Decisions: CONFIRMED_DUPLICATE_KEPT_SEPARATE or DISMISSED_NOT_DUPLICATE.
    CRITICAL: Does NOT merge records automatically without review; records remain separate.
    """
    repo = get_repository()
    try:
        updated_item = repo.review_duplicate(
            incident_id=incident_id,
            flag_id=flag_id,
            decision=review.decision,
            notes=review.notes,
        )
    except Exception as e:
        logger.exception("Storage failure during duplicate review")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage update failure: {str(e)}",
        )

    if not updated_item:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Incident '{incident_id}' not found for duplicate review.",
        )
    return IncidentResponse(**updated_item)


# ---------------------------------------------------------------------------
# SPRINT 4: Hazard-Aware Routing Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/routing/presets", summary="Emergency Transit Corridors")
def get_routing_presets():
    """
    Returns preset emergency response corridors with origin and destination nodes.
    """
    return {"data": PRESET_CORRIDORS, "total": len(PRESET_CORRIDORS)}


@app.get("/api/routing/network", summary="Road Graph Topology")
def get_routing_network():
    """
    Returns intersection nodes, street segments, and network boundaries for the road graph.
    Overlays active verified incidents onto road segments.
    """
    graph = build_default_road_graph()
    repo = get_repository()
    incidents = repo.list_incidents()
    graph.overlay_hazards(incidents)

    return {
        "nodes": list(graph.nodes.values()),
        "edges": list(graph.edges.values()),
        "presets": PRESET_CORRIDORS,
        "total_nodes": len(graph.nodes),
        "total_edges": len(graph.edges),
        "coverage_center": {"lat": 37.7760, "lng": -122.4150},
    }


@app.post(
    "/api/routing/calculate",
    response_model=RouteCalculationResponse,
    summary="Calculate Hazard-Aware Emergency Route",
)
def calculate_route(request: RouteCalculationRequest):
    """
    Calculates an optimal route between intersections or coordinates using Dijkstra or A*.
    Supports modes:
    - SHORTEST: Pure physical road distance
    - AVOID_CONFIRMED_CLOSURES: Strictly avoids confirmed road closures (OFFICIALLY_CONFIRMED)
    - MINIMIZE_HAZARDS: Bypasses confirmed closures and penalizes corroborated hazards
    Unverified social reports NEVER close roads automatically; they produce visible cautions.
    Never claims a route is guaranteed safe.
    """
    # Validate coordinate ranges if provided
    if request.origin_lat is not None and request.origin_lng is not None:
        if not (-90.0 <= request.origin_lat <= 90.0) or not (-180.0 <= request.origin_lng <= 180.0):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid origin GPS coordinates: ({request.origin_lat}, {request.origin_lng}) out of WGS-84 bounds.",
            )
    if request.destination_lat is not None and request.destination_lng is not None:
        if not (-90.0 <= request.destination_lat <= 90.0) or not (-180.0 <= request.destination_lng <= 180.0):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid destination GPS coordinates: ({request.destination_lat}, {request.destination_lng}) out of WGS-84 bounds.",
            )

    graph = build_default_road_graph()
    repo = get_repository()
    incidents = repo.list_incidents()

    router = RouteCalculator(graph)
    result = router.calculate_route(request, incidents=incidents)
    return result


# ============================================================================
# SPRINT 5: EXTERNAL DATA INGESTION & FEED MANAGEMENT ENDPOINTS
# ============================================================================

@app.get(
    "/api/ingestion/sources",
    response_model=list[SourceFeedStatus],
    summary="List Registered Data Source Adapters & Operational Health",
)
def list_ingestion_sources():
    """
    Returns registered external and demonstration data source adapters,
    their live operational health (HEALTHY, DEGRADED, ERROR, DISABLED, RATE_LIMITED),
    last successful fetch, error messages, and credential setup requirements.
    """
    mgr = get_ingestion_manager()
    return mgr.get_sources_status()


@app.post(
    "/api/ingestion/sources/{feed_id}/refresh",
    response_model=IngestionResult,
    summary="Trigger Refresh for Specific Data Source Feed",
)
def refresh_ingestion_source(
    feed_id: str,
    force_fixture: bool = Query(
        False, description="When true, ingests from saved example response fixture rather than live network"
    ),
    use_cache_on_failure: bool = Query(
        False, description="When true, serves labeled cached records if live request fails"
    ),
):
    """
    Triggers fetch, normalization, location uncertainty evaluation, and repeat deduplication
    for the specified feed adapter.
    Preserves original source URL/ID, published_at, and fetched_at.
    Never invents API responses or silently substitutes demo data for failed feeds.
    """
    mgr = get_ingestion_manager()
    result = mgr.refresh_source(
        feed_id, force_fixture=force_fixture, use_cache_on_failure=use_cache_on_failure
    )
    return result


@app.post(
    "/api/ingestion/refresh",
    response_model=list[IngestionResult],
    summary="Trigger Refresh Across All Enabled Data Feeds",
)
def refresh_all_ingestion_sources(
    force_fixture: bool = Query(
        False, description="When true, ingests from saved example response fixtures"
    ),
    use_cache_on_failure: bool = Query(
        False, description="When true, serves labeled cached records if live request fails"
    ),
):
    """
    Iterates through all enabled and configured adapters, fetching updates,
    deduplicating repeat records, and recording execution metrics.
    """
    mgr = get_ingestion_manager()
    return mgr.refresh_all(force_fixture=force_fixture, use_cache_on_failure=use_cache_on_failure)


@app.get(
    "/api/ingestion/history",
    response_model=list[IngestionLogEntry],
    summary="Get Recent Ingestion Audit History Log",
)
def get_ingestion_history(
    limit: int = Query(50, ge=1, le=100, description="Maximum log entries to return")
):
    """
    Returns recent ingestion audit log records detailing fetch timestamps,
    records fetched/new/updated, and execution latency.
    """
    mgr = get_ingestion_manager()
    return mgr.get_history(limit=limit)


