import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.main import app
from app.models import IncidentStatus
from app.storage import DemoIncidentRepository, reset_repository_for_testing
from app.verification import (
    haversine_distance,
    jaccard_similarity,
    is_official_source,
    is_repost_content,
    check_freshness,
    detect_potential_duplicates,
    validate_status_transition,
)

client = TestClient(app)
ADMIN_HEADERS = {"X-Admin-Key": "routerescue-admin-sprint2"}

@pytest.fixture(autouse=True)
def ensure_clean_repository():
    reset_repository_for_testing(DemoIncidentRepository())


# ============================================================================
# 1. DUPLICATE DETECTION TESTS
# ============================================================================

def test_duplicate_detection_proximity_hazard_text_time():
    """
    Test that incidents matching geographic proximity, same hazard category,
    high text similarity, and close publication time are flagged as duplicates.
    """
    # Create incident A
    payload_a = {
        "title": "Severe Flash Flood on 16th Street Underpass",
        "description": "Depressed underpass flooded with water runoff rising over 1 meter. Vehicles trapped and lane blocked.",
        "hazard_category": "flood",
        "latitude": 37.7650,
        "longitude": -122.4180,
        "location_name": "16th St & Potrero",
        "published_at": "2026-10-10T08:00:00Z"
    }
    res_a = client.post("/api/incidents", json=payload_a)
    assert res_a.status_code == 201
    id_a = res_a.json()["data"]["id"]

    # Create incident B within 120 meters, same hazard, similar vocabulary, 15 minutes later
    payload_b = {
        "title": "Flooded 16th St Underpass Water Rise",
        "description": "Underpass flooded with heavy runoff water over 1 meter depth. Roadway blocked for vehicles.",
        "hazard_category": "flood",
        "latitude": 37.7658,
        "longitude": -122.4185,
        "location_name": "16th St Underpass Eastbound",
        "published_at": "2026-10-10T08:15:00Z"
    }
    res_b = client.post("/api/incidents", json=payload_b)
    assert res_b.status_code == 201
    created_b = res_b.json()["data"]
    id_b = created_b["id"]

    # Verify both records exist SEPARATELY (Not merged automatically)
    assert id_a != id_b
    assert client.get(f"/api/incidents/{id_a}").status_code == 200
    assert client.get(f"/api/incidents/{id_b}").status_code == 200

    # Fetch incident B details and verify duplicate flag
    detail_b = client.get(f"/api/incidents/{id_b}").json()
    dups_b = detail_b["potential_duplicates"]
    assert len(dups_b) >= 1
    flag = next((d for d in dups_b if d["target_incident_id"] == id_a), None)
    assert flag is not None
    assert flag["distance_meters"] < 200.0
    assert flag["hazard_match"] is True
    assert flag["time_diff_minutes"] <= 20.0
    assert flag["text_similarity"] > 0.30
    assert "not automatically merged" in flag["policy_notice"].lower()


def test_duplicate_not_flagged_for_different_hazard_categories():
    """
    Incidents at the same location but with completely different hazard types
    should NOT be flagged as duplicates.
    """
    target = {
        "id": "INC-TEST-1",
        "hazard_type": "flood",
        "latitude": 37.7700,
        "longitude": -122.4100,
        "title": "Major flooding at intersection",
        "description": "Standing water deep across all lanes",
        "reported_at": "2026-10-10T08:00:00Z"
    }
    candidate = {
        "id": "INC-TEST-2",
        "hazard_type": "fire",  # Different hazard category!
        "latitude": 37.7701,
        "longitude": -122.4101,
        "title": "Major structure fire at intersection",
        "description": "Active building blaze at corner",
        "reported_at": "2026-10-10T08:05:00Z"
    }
    flags = detect_potential_duplicates(target, [candidate])
    assert len(flags) == 0


def test_duplicate_not_flagged_for_distant_locations():
    """
    Incidents with similar titles but far away (> threshold) should NOT be duplicates.
    """
    target = {
        "id": "INC-TEST-1",
        "hazard_type": "flood",
        "latitude": 37.7700,
        "longitude": -122.4100,
        "title": "Water main break flooding road",
        "description": "Heavy water flowing onto roadway",
        "reported_at": "2026-10-10T08:00:00Z"
    }
    candidate = {
        "id": "INC-TEST-2",
        "hazard_type": "flood",
        "latitude": 37.8500,  # ~9 kilometers away!
        "longitude": -122.3000,
        "title": "Water main break flooding road",
        "description": "Heavy water flowing onto roadway",
        "reported_at": "2026-10-10T08:05:00Z"
    }
    flags = detect_potential_duplicates(target, [candidate])
    assert len(flags) == 0


def test_duplicate_records_kept_separate_without_automatic_merge():
    """
    Verify policy requirement: Potential duplicates do not merge records automatically.
    Both records retain unique IDs, individual geometries, and can be reviewed manually.
    """
    # Demo fixtures DEMO-INC-101 and DEMO-INC-106 are seeded duplicates
    res101 = client.get("/api/incidents/DEMO-INC-101")
    res106 = client.get("/api/incidents/DEMO-INC-106")
    assert res101.status_code == 200
    assert res106.status_code == 200

    data101 = res101.json()
    data106 = res106.json()

    assert data101["id"] == "DEMO-INC-101"
    assert data106["id"] == "DEMO-INC-106"
    assert data101["id"] != data106["id"]

    # Reviewing the duplicate flag logs an audit entry and updates review state without deleting either record
    review_res = client.post(
        f"/api/incidents/DEMO-INC-106/duplicates/DUP-DEMO-INC-106-DEMO-INC-101/review",
        headers=ADMIN_HEADERS,
        json={
            "decision": "CONFIRMED_DUPLICATE_KEPT_SEPARATE",
            "notes": "Dispatcher verified report refers to same underpass event. Preserved as separate audit record."
        }
    )
    assert review_res.status_code == 200
    reviewed_data = review_res.json()
    # Check verification history has the audit action
    history_actions = [h["action"] for h in reviewed_data["verification_history"]]
    assert "DUPLICATE_REVIEWED" in history_actions

    # Confirm DEMO-INC-101 is STILL present in system
    still_there = client.get("/api/incidents/DEMO-INC-101")
    assert still_there.status_code == 200


# ============================================================================
# 2. FRESHNESS LIMITS & STALE REPORT TESTS
# ============================================================================

def test_stale_report_flagging():
    """
    Test that reports older than configurable freshness limit (6.0h) are flagged as is_stale = True.
    Recent reports are flagged as is_stale = False.
    """
    # DEMO-INC-107 is seeded with reported_at over 15 hours ago
    res_stale = client.get("/api/incidents/DEMO-INC-107")
    assert res_stale.status_code == 200
    stale_item = res_stale.json()
    assert stale_item["is_stale"] is True
    assert stale_item["evidence_summary"]["is_stale"] is True
    assert stale_item["evidence_summary"]["age_hours"] > 6.0
    stale_note = next((n for n in stale_item["evidence_summary"]["rule_evaluation_notes"] if "STALE" in n), None)
    assert stale_note is not None

    # DEMO-INC-101 was reported within fresh window
    res_fresh = client.get("/api/incidents/DEMO-INC-101")
    assert res_fresh.status_code == 200
    fresh_item = res_fresh.json()
    assert fresh_item["is_stale"] is False
    assert fresh_item["evidence_summary"]["is_stale"] is False


def test_filter_incidents_by_freshness():
    """
    Test filtering GET /api/incidents?is_stale=true and is_stale=false.
    """
    res_stale_filter = client.get("/api/incidents?is_stale=true")
    assert res_stale_filter.status_code == 200
    stale_list = res_stale_filter.json()["data"]
    assert len(stale_list) >= 1
    for item in stale_list:
        assert item["is_stale"] is True

    res_fresh_filter = client.get("/api/incidents?is_stale=false")
    assert res_fresh_filter.status_code == 200
    fresh_list = res_fresh_filter.json()["data"]
    assert len(fresh_list) >= 1
    for item in fresh_list:
        assert item["is_stale"] is False


def test_stale_reports_do_not_invent_fake_confidence_scores():
    """
    Critical requirement: Do not invent confidence scores or treat missing data as proof of falsity.
    """
    res = client.get("/api/incidents/DEMO-INC-107")
    data = res.json()
    # Ensure no fabricated confidence field exists
    assert "confidence_score" not in data
    assert "confidence" not in data
    # Stale item is still UNVERIFIED, not marked 'FALSE' or deleted
    assert data["status"] in ["UNVERIFIED", "CORROBORATED", "OFFICIALLY_CONFIRMED", "RESOLVED"]


# ============================================================================
# 3. STATUS TRANSITION VALIDATION TESTS
# ============================================================================

def test_valid_status_transitions():
    """
    Valid lifecycle transitions:
    UNVERIFIED -> CORROBORATED -> OFFICIALLY_CONFIRMED -> RESOLVED
    """
    # Create fresh incident
    create_res = client.post("/api/incidents", json={
        "title": "Sinkhole on 3rd St",
        "description": "Deep asphalt collapse in middle lane.",
        "hazard_category": "infrastructure",
        "latitude": 37.7850,
        "longitude": -122.4000,
    })
    inc_id = create_res.json()["data"]["id"]
    assert create_res.json()["data"]["status"] == "UNVERIFIED"

    # 1. Transition to CORROBORATED (triage / multi-report)
    res_corr = client.patch(
        f"/api/incidents/{inc_id}/status",
        headers=ADMIN_HEADERS,
        json={"status": "CORROBORATED", "notes": "Multiple spotter reports corroborated road collapse."}
    )
    assert res_corr.status_code == 200
    assert res_corr.json()["status"] == "CORROBORATED"

    # 2. Transition to OFFICIALLY_CONFIRMED with explicit authorized review notes
    res_conf = client.patch(
        f"/api/incidents/{inc_id}/status",
        headers=ADMIN_HEADERS,
        json={
            "status": "OFFICIALLY_CONFIRMED",
            "notes": "DPW Emergency Engineering Crew #4 on-scene confirmed sinkhole depth 1.5m.",
            "reviewer_role": "City Dispatch Engineer",
            "authorized_by": "DPW Ops Command"
        }
    )
    assert res_conf.status_code == 200
    assert res_conf.json()["status"] == "OFFICIALLY_CONFIRMED"

    # 3. Transition to RESOLVED
    res_res = client.patch(
        f"/api/incidents/{inc_id}/status",
        headers=ADMIN_HEADERS,
        json={"status": "RESOLVED", "notes": "Steel plate placed and road reopened."}
    )
    assert res_res.status_code == 200
    assert res_res.json()["status"] == "RESOLVED"


def test_invalid_transition_to_officially_confirmed_without_official_source_or_review_notes():
    """
    CRITICAL REQUIREMENT:
    Never label a report officially confirmed without an authorized official source or explicit authorized review.
    If someone attempts to transition to OFFICIALLY_CONFIRMED with empty notes and no official source,
    the API MUST reject the transition with HTTP 400.
    """
    # Create incident with NO official source
    create_res = client.post("/api/incidents", json={
        "title": "Unverified Street Obstruction",
        "description": "Random object in street reported by citizen app.",
        "hazard_category": "hazard",
        "latitude": 37.7600,
        "longitude": -122.4200,
        "source": "Anonymous Citizen App",
        "source_url": None
    })
    inc_id = create_res.json()["data"]["id"]

    # Attempt transition to OFFICIALLY_CONFIRMED with NO notes or inadequate notes
    res_bad = client.patch(
        f"/api/incidents/{inc_id}/status",
        headers=ADMIN_HEADERS,
        json={"status": "OFFICIALLY_CONFIRMED", "notes": ""}
    )
    assert res_bad.status_code == 400
    detail = res_bad.json()["detail"].lower()
    assert "rejected" in detail or "official" in detail


def test_transition_to_officially_confirmed_allowed_when_official_source_present():
    """
    If the incident already has a verified official government source,
    transition to OFFICIALLY_CONFIRMED is permitted.
    """
    # Create incident with verified official source URL
    create_res = client.post("/api/incidents", json={
        "title": "Highway Patrol SigAlert Closure",
        "description": "Overturned semi-truck blocking all southbound lanes.",
        "hazard_category": "hazard",
        "latitude": 37.7500,
        "longitude": -122.4000,
        "source": "California Highway Patrol",
        "source_url": "https://chp.ca.gov/traffic/sigalert/992"
    })
    inc_id = create_res.json()["data"]["id"]

    # Allowed because official government source is present
    res_conf = client.patch(
        f"/api/incidents/{inc_id}/status",
        headers=ADMIN_HEADERS,
        json={"status": "OFFICIALLY_CONFIRMED"}
    )
    assert res_conf.status_code == 200
    assert res_conf.json()["status"] == "OFFICIALLY_CONFIRMED"


def test_unauthorized_status_update_rejected():
    """
    Attempts to change status without valid admin authorization must return HTTP 401.
    """
    res = client.patch(
        "/api/incidents/DEMO-INC-103/status",
        json={"status": "RESOLVED"}
    )
    assert res.status_code == 401


# ============================================================================
# 4. INDEPENDENT SOURCES VS REPOSTS & EVIDENCE PROVENANCE
# ============================================================================

def test_distinguish_independent_sources_from_reposts():
    """
    Rule-based check: Citations and reposts ('RT @...', identical URLs)
    are distinguished and not counted as independent corroborating sources.
    """
    create_res = client.post("/api/incidents", json={
        "title": "Downed Power Line on Mission St",
        "description": "Live electric cable sparking across sidewalk.",
        "hazard_category": "infrastructure",
        "latitude": 37.7600,
        "longitude": -122.4150,
        "source": "First Witness Report",
        "source_url": "https://example.com/alerts/cable-1"
    })
    inc_id = create_res.json()["data"]["id"]

    # Add second source: Repost citing original via "RT @first_witness"
    res_repost = client.post(
        f"/api/incidents/{inc_id}/evidence",
        headers=ADMIN_HEADERS,
        json={
            "source_name": "Social Aggregator Feed",
            "excerpt": "RT @first_witness Live electric cable sparking on Mission St.",
            "source_url": "https://example.com/alerts/cable-1",  # Same URL as source 1!
            "is_repost": False  # Should be automatically detected by rule engine!
        }
    )
    assert res_repost.status_code == 200
    data_repost = res_repost.json()

    # Repost count should be 1, independent count should remain 1!
    ev_summary = data_repost["evidence_summary"]
    assert ev_summary["repost_count"] == 1
    assert ev_summary["independent_sources_count"] == 1
    # Because only 1 independent source exists, status remains UNVERIFIED
    assert data_repost["status"] == "UNVERIFIED"

    # Now add an independent source with different URL and distinct description
    res_indep = client.post(
        f"/api/incidents/{inc_id}/evidence",
        headers=ADMIN_HEADERS,
        json={
            "source_name": "Utility Technician Radio (Unit 8)",
            "excerpt": "PGE crew arriving on-scene; confirmed 240V drop wire down.",
            "source_url": "https://pge-dispatch.example.org/event/774"
        }
    )
    assert res_indep.status_code == 200
    data_indep = res_indep.json()
    assert data_indep["evidence_summary"]["independent_sources_count"] == 2
    # Automatically corroborates when 2 independent sources exist!
    assert data_indep["status"] == "CORROBORATED"


def test_preserve_source_url_publication_and_ingestion_time():
    """
    Preserve each source URL/identifier, publication time, and ingestion time.
    """
    pub_time = "2026-10-10T07:15:30Z"
    res = client.post("/api/incidents", json={
        "title": "Gas Odor Near School",
        "description": "Strong rotten egg odor detected along sidewalk.",
        "hazard_category": "hazard",
        "latitude": 37.7550,
        "longitude": -122.4250,
        "source": "School Safety Officer",
        "source_url": "https://safety.example.org/incident/44",
        "published_at": pub_time
    })
    assert res.status_code == 201
    item = res.json()["data"]

    assert item["source_url"] == "https://safety.example.org/incident/44"
    assert item["published_at"] == pub_time
    assert item["ingested_at"] is not None

    sources = item["sources_detail"]
    assert len(sources) >= 1
    s1 = sources[0]
    assert s1["source_url"] == "https://safety.example.org/incident/44"
    assert s1["published_at"] == pub_time
    assert s1["ingested_at"] is not None


def test_verification_history_audit_trail():
    """
    Verify that every action (ingestion, rule evaluation, status transition)
    is recorded in the incident's verification_history audit trail.
    """
    res = client.get("/api/incidents/DEMO-INC-101")
    assert res.status_code == 200
    history = res.json()["verification_history"]
    assert len(history) >= 2
    actions = [h["action"] for h in history]
    assert "INGESTION" in actions
    assert "RULE_EVALUATION" in actions
    for entry in history:
        assert entry["timestamp"]
        assert entry["actor"]
        assert entry["reason"]
