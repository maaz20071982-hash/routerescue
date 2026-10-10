"""
Sprint 6 Integration & End-to-End QA Test Suite
Tests:
- End-to-end incident CRUD + verification lifecycle
- Routing impact before & after confirmed road closure
- Route reversion after incident resolution
- Duplicate flag lifecycle and non-automatic merge preservation
- Stale data detection (> 6 hours)
- Secret handling and admin authorization rejection
- Input validation boundaries (GPS coordinates, routing nodes)
- Unavailable API graceful degradation without invented data
"""

import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.config import ADMIN_API_KEY
from app.storage import reset_repository_for_testing, DemoIncidentRepository

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_storage():
    """Reset repository demo items before each test for clean isolation."""
    reset_repository_for_testing(DemoIncidentRepository())


def test_end_to_end_incident_lifecycle_and_routing_impact():
    """
    Validates end-to-end data parity across CRUD, verification transitions,
    and routing engine calculation:
    1. Unverified incident does NOT close roads.
    2. Officially confirmed closure reroutes the path.
    3. Resolved incident restores the corridor.
    """
    origin = "INT_MARKET_VAN_NESS"
    destination = "INT_MARKET_4TH"

    # Step 1: Baseline route calculation before new closure
    base_res = client.post(
        "/api/routing/calculate",
        json={
            "origin_node_id": origin,
            "destination_node_id": destination,
            "mode": "AVOID_CONFIRMED_CLOSURES",
            "use_a_star": True,
        },
    )
    assert base_res.status_code == 200
    base_data = base_res.json()
    assert base_data["is_reachable"] is True
    initial_streets = [s["street_name"] for s in base_data["segments"]]
    assert any("Market St" in s for s in initial_streets)

    # Step 2: User creates a new hazard report on Market St as UNVERIFIED
    # Placed between Market & 8th and Market & 7th (37.7790, -122.4132)
    create_res = client.post(
        "/api/incidents",
        json={
            "title": "Severe flooding and downed lines on Market St",
            "description": "Flooding between 7th and 8th; water rising rapidly.",
            "hazard_category": "flood",
            "latitude": 37.7790,
            "longitude": -122.4132,
            "location_name": "Market St between 7th and 8th",
            "source": "CITIZEN_REPORT",
            "source_url": "https://citizen.app/alert/flooding-market-st",
            "severity": "critical",
        },
    )
    assert create_res.status_code == 201
    created_incident = create_res.json()["data"]
    incident_id = created_incident["id"]
    assert created_incident["status"] == "UNVERIFIED"

    # Step 3: Route planner recalculates — unverified report must NOT close the road
    unverified_route_res = client.post(
        "/api/routing/calculate",
        json={
            "origin_node_id": origin,
            "destination_node_id": destination,
            "mode": "AVOID_CONFIRMED_CLOSURES",
            "use_a_star": True,
        },
    )
    assert unverified_route_res.status_code == 200
    unverified_route = unverified_route_res.json()
    assert unverified_route["is_reachable"] is True
    # The route should still be able to transit Market St because report is UNVERIFIED
    unverified_streets = [s["street_name"] for s in unverified_route["segments"]]
    assert any("Market St" in s for s in unverified_streets)
    # But visible caution is reported
    assert (
        len(unverified_route["cautions"]) > 0
        or "caution" in unverified_route["route_change_explanation"].lower()
    )

    # Step 4: Admin upgrades report to OFFICIALLY_CONFIRMED road closure
    status_update_res = client.patch(
        f"/api/incidents/{incident_id}/status",
        headers={"X-Admin-Key": ADMIN_API_KEY},
        json={
            "status": "OFFICIALLY_CONFIRMED",
            "notes": "Verified by SF Department of Emergency Management; corridor closed to all traffic.",
            "reviewer_role": "DEM Dispatch Supervisor",
            "authorized_by": "SFDEM_UNIT_4",
        },
    )
    assert status_update_res.status_code == 200
    assert status_update_res.json()["status"] == "OFFICIALLY_CONFIRMED"

    # Step 5: Route planner recalculates — confirmed closure must force detour
    reroute_res = client.post(
        "/api/routing/calculate",
        json={
            "origin_node_id": origin,
            "destination_node_id": destination,
            "mode": "AVOID_CONFIRMED_CLOSURES",
            "use_a_star": True,
        },
    )
    assert reroute_res.status_code == 200
    reroute_data = reroute_res.json()
    assert reroute_data["is_reachable"] is True
    # The new route detours (e.g. via Mission St or parallel corridor)
    reroute_streets = [s["street_name"] for s in reroute_data["segments"]]
    assert len(reroute_data["avoided_hazards"]) > 0
    assert (
        "bypass" in reroute_data["route_change_explanation"].lower()
        or "adjusted" in reroute_data["route_change_explanation"].lower()
        or "closure" in reroute_data["route_change_explanation"].lower()
        or "detour" in reroute_data["route_change_explanation"].lower()
        or "avoid" in reroute_data["route_change_explanation"].lower()
    )

    # Step 6: Admin resolves the incident
    resolve_res = client.patch(
        f"/api/incidents/{incident_id}/status",
        headers={"X-Admin-Key": ADMIN_API_KEY},
        json={
            "status": "RESOLVED",
            "notes": "DPW crews pumped water and cleared lines; street reopened.",
            "reviewer_role": "DEM Dispatch Supervisor",
            "authorized_by": "SFDEM_UNIT_4",
        },
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "RESOLVED"

    # Step 7: Route planner recalculates — resolved corridor is safely restored
    restored_route_res = client.post(
        "/api/routing/calculate",
        json={
            "origin_node_id": origin,
            "destination_node_id": destination,
            "mode": "AVOID_CONFIRMED_CLOSURES",
            "use_a_star": True,
        },
    )
    assert restored_route_res.status_code == 200
    restored_route = restored_route_res.json()
    assert restored_route["is_reachable"] is True
    restored_streets = [s["street_name"] for s in restored_route["segments"]]
    assert any("Market St" in s for s in restored_streets)


def test_duplicate_flag_lifecycle_and_non_automatic_merge():
    """
    Verifies that geographic and temporal duplicates are flagged for review,
    and are NOT automatically merged without review.
    """
    # 1. Post initial incident
    inc1_res = client.post(
        "/api/incidents",
        json={
            "title": "Sinkhole at Mission and 6th",
            "description": "Large sinkhole opening near intersection",
            "hazard_category": "infrastructure",
            "latitude": 37.7800,
            "longitude": -122.4080,
            "location_name": "Mission St & 6th St",
            "source_url": "https://twitter.com/user/status/100",
        },
    )
    assert inc1_res.status_code == 201
    inc1 = inc1_res.json()["data"]

    # 2. Post duplicate report within 50 meters and 10 minutes
    inc2_res = client.post(
        "/api/incidents",
        json={
            "title": "Huge sinkhole at Mission St & 6th St",
            "description": "Road caving in near 6th St",
            "hazard_category": "infrastructure",
            "latitude": 37.7802,
            "longitude": -122.4081,
            "location_name": "Mission St & 6th St",
            "source_url": "https://reddit.com/r/bayarea/post200",
        },
    )
    assert inc2_res.status_code == 201
    inc2 = inc2_res.json()["data"]

    # Verify both records remain distinct in repository
    all_res = client.get("/api/incidents")
    ids = [i["id"] for i in all_res.json()["data"]]
    assert inc1["id"] in ids
    assert inc2["id"] in ids

    # Verify inc2 has duplicate flag referencing inc1
    get_inc2 = client.get(f"/api/incidents/{inc2['id']}").json()
    assert len(get_inc2["potential_duplicates"]) > 0
    flag = get_inc2["potential_duplicates"][0]
    assert flag["target_incident_id"] == inc1["id"]
    assert flag["reviewed"] is False

    # Operator reviews the duplicate flag
    review_res = client.post(
        f"/api/incidents/{inc2['id']}/duplicates/{flag['flag_id']}/review",
        headers={"X-Admin-Key": ADMIN_API_KEY},
        json={
            "decision": "CONFIRMED_DUPLICATE_KEPT_SEPARATE",
            "notes": "Confirmed independent witness of the same sinkhole; keeping record separate for provenance.",
        },
    )
    assert review_res.status_code == 200
    updated_flags = review_res.json()["potential_duplicates"]
    assert updated_flags[0]["reviewed"] is True
    assert updated_flags[0]["review_decision"] == "CONFIRMED_DUPLICATE_KEPT_SEPARATE"


def test_stale_data_detection_and_freshness_filtering():
    """
    Verifies reports older than freshness limit (6.0 hours) are marked is_stale
    and can be filtered without fabricating confidence metrics.
    """
    eight_hours_ago = (datetime.now(timezone.utc) - timedelta(hours=8.0)).isoformat()
    create_res = client.post(
        "/api/incidents",
        json={
            "title": "Downed branch reported 8 hours ago",
            "description": "Branch on sidewalk blocking pedestrian lane",
            "hazard_category": "hazard",
            "latitude": 37.7700,
            "longitude": -122.4200,
            "location_name": "Valencia St",
            "published_at": eight_hours_ago,
        },
    )
    assert create_res.status_code == 201
    old_inc = create_res.json()["data"]

    # Retrieve incident
    res = client.get(f"/api/incidents/{old_inc['id']}")
    assert res.status_code == 200
    data = res.json()
    assert data["is_stale"] is True
    assert data["evidence_summary"] is not None
    assert data["evidence_summary"]["is_stale"] is True
    assert data["evidence_summary"]["age_hours"] >= 7.9

    # Test freshness query parameter filters
    stale_res = client.get("/api/incidents?is_stale=true")
    assert stale_res.status_code == 200
    stale_ids = [i["id"] for i in stale_res.json()["data"]]
    assert old_inc["id"] in stale_ids

    fresh_res = client.get("/api/incidents?is_stale=false")
    assert fresh_res.status_code == 200
    fresh_ids = [i["id"] for i in fresh_res.json()["data"]]
    assert old_inc["id"] not in fresh_ids


def test_admin_authorization_and_secret_handling():
    """
    Verifies that privileged operations reject requests without valid admin credentials.
    """
    inc = client.get("/api/incidents").json()["data"][0]
    inc_id = inc["id"]

    # 1. Unauthorized attempt (no key)
    unauth_res = client.patch(
        f"/api/incidents/{inc_id}/status",
        json={"status": "OFFICIALLY_CONFIRMED", "notes": "Unauthorized test"},
    )
    assert unauth_res.status_code == 401

    # 2. Invalid key attempt
    invalid_res = client.patch(
        f"/api/incidents/{inc_id}/status",
        headers={"X-Admin-Key": "WRONG_SECRET_KEY"},
        json={"status": "OFFICIALLY_CONFIRMED", "notes": "Unauthorized test"},
    )
    assert invalid_res.status_code == 401

    # 3. Valid key attempt
    valid_res = client.patch(
        f"/api/incidents/{inc_id}/status",
        headers={"X-Admin-Key": ADMIN_API_KEY},
        json={
            "status": "OFFICIALLY_CONFIRMED",
            "notes": "Authorized review by DEM operator",
            "reviewer_role": "DEM Operator",
            "authorized_by": "DEM_44",
        },
    )
    assert valid_res.status_code == 200


def test_input_validation_boundaries():
    """
    Verifies boundary validation for coordinates, missing required fields,
    and invalid routing nodes.
    """
    # 1. Invalid latitude
    lat_err = client.post(
        "/api/incidents",
        json={
            "title": "Invalid latitude",
            "description": "Testing boundary",
            "hazard_category": "hazard",
            "latitude": 150.0,  # Invalid: > 90
            "longitude": -122.4,
        },
    )
    assert lat_err.status_code in [400, 422]

    # 2. Invalid routing GPS coordinates
    route_lat_err = client.post(
        "/api/routing/calculate",
        json={
            "origin_lat": 95.0,  # Invalid: > 90
            "origin_lng": -122.4,
            "destination_node_id": "INT_MARKET_4TH",
            "mode": "SHORTEST",
        },
    )
    assert route_lat_err.status_code in [400, 422]

    # 3. Missing required fields
    missing_fields = client.post(
        "/api/incidents",
        json={"description": "Missing title and category"},
    )
    assert missing_fields.status_code == 422


def test_unavailable_external_api_graceful_handling():
    """
    Verifies that disabled/uncredentialed adapters report honest disabled status
    without crashing or faking data.
    """
    # Refresh disabled Twitter adapter without credentials
    res = client.post("/api/ingestion/sources/twitter-authorized-api/refresh")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["records_fetched"] == 0
    assert "disabled" in data["error_message"].lower() or "credentials" in data["error_message"].lower()
