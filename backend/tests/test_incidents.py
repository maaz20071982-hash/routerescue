import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.storage import reset_repository_for_testing, DemoIncidentRepository

@pytest.fixture(autouse=True)
def ensure_fresh_demo_repo():
    reset_repository_for_testing(DemoIncidentRepository())

client = TestClient(app)

def test_health_check_storage():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] in ["2.0.0", "3.0.0"]
    assert data["storage_backend"] == "demo_repository"
    assert "in-memory demo repository" in data["storage_notice"].lower()
    assert data["is_remote_storage"] is False

def test_list_all_incidents():
    response = client.get("/api/incidents")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 5
    assert len(data["data"]) == data["total"]
    # Check that each incident has required Sprint 2 fields
    for inc in data["data"]:
        assert inc["status"] in ["UNVERIFIED", "CORROBORATED", "OFFICIALLY_CONFIRMED", "RESOLVED"]
        assert -90.0 <= inc["latitude"] <= 90.0
        assert -180.0 <= inc["longitude"] <= 180.0
        assert inc["source"]
        assert inc["reported_at"]
        assert inc["hazard_type"]

def test_filter_incidents_by_status():
    # Filter by OFFICIALLY_CONFIRMED
    res_confirmed = client.get("/api/incidents?status=OFFICIALLY_CONFIRMED")
    assert res_confirmed.status_code == 200
    items = res_confirmed.json()["data"]
    assert len(items) >= 2
    for item in items:
        assert item["status"] == "OFFICIALLY_CONFIRMED"

    # Filter by RESOLVED
    res_resolved = client.get("/api/incidents?status=RESOLVED")
    assert res_resolved.status_code == 200
    res_items = res_resolved.json()["data"]
    assert len(res_items) >= 1
    for item in res_items:
        assert item["status"] == "RESOLVED"

    # Filter by UNVERIFIED
    res_unverified = client.get("/api/incidents?status=UNVERIFIED")
    assert res_unverified.status_code == 200
    for item in res_unverified.json()["data"]:
        assert item["status"] == "UNVERIFIED"

def test_get_incident_by_id():
    response = client.get("/api/incidents/DEMO-INC-101")
    assert response.status_code == 200
    inc = response.json()
    assert inc["id"] == "DEMO-INC-101"
    assert inc["title"] == "Flooded Underpass & Road Blockage"
    assert inc["hazard_type"] == "flood"
    assert inc["status"] == "OFFICIALLY_CONFIRMED"
    assert "SF Municipal" in inc["source"] or inc["source"] == "DEMO DATA"

def test_get_incident_not_found():
    response = client.get("/api/incidents/NON_EXISTENT_999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

def test_create_incident_valid():
    payload = {
        "title": "Sinkhole on 7th Street",
        "description": "Large road collapse in center lane, depth approx 1 meter. Heavy transit rerouted.",
        "hazard_category": "infrastructure",
        "latitude": 37.7780,
        "longitude": -122.4110,
        "location_name": "7th St & Folsom",
        "severity": "critical",
        "source_url": "https://example.com/traffic-alert/7th-st"
    }
    response = client.post("/api/incidents", json=payload)
    assert response.status_code == 201
    res = response.json()
    assert res["status"] == "success"
    created = res["data"]
    assert created["title"] == "Sinkhole on 7th Street"
    assert created["status"] == "UNVERIFIED"
    assert created["latitude"] == 37.7780
    assert created["longitude"] == -122.4110
    assert created["hazard_type"] == "infrastructure"
    assert created["source_url"] == "https://example.com/traffic-alert/7th-st"
    # Never claim remote save in demo repository
    assert res["saved_remotely"] is False
    assert "NOT saved remotely" in res["message"]

def test_create_incident_invalid_coordinates():
    # Lat > 90
    bad_lat = {
        "title": "Invalid Coordinate Test",
        "description": "Testing boundary checks for latitude",
        "hazard_category": "hazard",
        "latitude": 95.5,
        "longitude": -122.41,
    }
    res = client.post("/api/incidents", json=bad_lat)
    assert res.status_code == 422

    # Lng < -180
    bad_lng = {
        "title": "Invalid Coordinate Test",
        "description": "Testing boundary checks for longitude",
        "hazard_category": "hazard",
        "latitude": 37.77,
        "longitude": -190.0,
    }
    res2 = client.post("/api/incidents", json=bad_lng)
    assert res2.status_code == 422

def test_create_incident_missing_required_fields():
    # Missing title
    res_no_title = client.post("/api/incidents", json={
        "description": "Valid description here",
        "hazard_category": "flood",
        "latitude": 37.77,
        "longitude": -122.41
    })
    assert res_no_title.status_code == 422

    # Title too short (< 3 chars)
    res_short = client.post("/api/incidents", json={
        "title": "Hi",
        "description": "Valid description",
        "hazard_category": "flood",
        "latitude": 37.77,
        "longitude": -122.41
    })
    assert res_short.status_code == 422

    # Invalid hazard type
    res_bad_hazard = client.post("/api/incidents", json={
        "title": "Valid Title Here",
        "description": "Valid description",
        "hazard_category": "tornado_alien_attack",
        "latitude": 37.77,
        "longitude": -122.41
    })
    assert res_bad_hazard.status_code == 422

def test_create_incident_invalid_url():
    # Dangerous javascript: URL scheme
    bad_url = {
        "title": "XSS Attempt in URL",
        "description": "Testing malicious javascript URI",
        "hazard_category": "hazard",
        "latitude": 37.77,
        "longitude": -122.41,
        "source_url": "javascript:alert(document.cookie)"
    }
    res = client.post("/api/incidents", json=bad_url)
    assert res.status_code == 422

def test_content_sanitization():
    payload = {
        "title": "Test <script>alert('xss')</script> Safe Title",
        "description": "<b>Alert:</b> <img src=x onerror=alert(1)> water depth increasing.",
        "hazard_category": "flood",
        "latitude": 37.775,
        "longitude": -122.415
    }
    res = client.post("/api/incidents", json=payload)
    assert res.status_code == 201
    created = res.json()["data"]
    # Check that raw tags were safely escaped
    assert "<script>" not in created["title"]
    assert "&lt;script&gt;" in created["title"]
    assert "<img" not in created["description"]
    assert "&lt;img" in created["description"]

def test_status_update_unauthorized():
    # No header provided
    res_no_auth = client.patch(
        "/api/incidents/DEMO-INC-103/status",
        json={"status": "CORROBORATED"}
    )
    assert res_no_auth.status_code == 401

    # Invalid admin key
    res_bad_key = client.patch(
        "/api/incidents/DEMO-INC-103/status",
        headers={"X-Admin-Key": "wrong-secret-key"},
        json={"status": "CORROBORATED"}
    )
    assert res_bad_key.status_code == 401

def test_status_update_authorized():
    # Valid admin key
    valid_headers = {"X-Admin-Key": "routerescue-admin-sprint2"}
    res = client.patch(
        "/api/incidents/DEMO-INC-103/status",
        headers=valid_headers,
        json={"status": "CORROBORATED", "notes": "Two separate field reports confirmed blockage."}
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["status"] == "CORROBORATED"
    assert updated["verified"] is True
    assert "[CORROBORATED]" in updated["recommended_action"]

    # Verify transition to RESOLVED
    res_resolve = client.patch(
        "/api/incidents/DEMO-INC-103/status",
        headers=valid_headers,
        json={"status": "RESOLVED", "notes": "Signal fixed and intersection running normally."}
    )
    assert res_resolve.status_code == 200
    assert res_resolve.json()["status"] == "RESOLVED"

def test_status_update_invalid_status_enum():
    valid_headers = {"X-Admin-Key": "routerescue-admin-sprint2"}
    res = client.patch(
        "/api/incidents/DEMO-INC-103/status",
        headers=valid_headers,
        json={"status": "SOME_RANDOM_INVALID_STATUS"}
    )
    assert res.status_code == 422

def test_status_update_not_found():
    valid_headers = {"X-Admin-Key": "routerescue-admin-sprint2"}
    res = client.patch(
        "/api/incidents/NON_EXISTENT_ID/status",
        headers=valid_headers,
        json={"status": "RESOLVED"}
    )
    assert res.status_code == 404

def test_required_popup_details_fields():
    """
    Ensure every incident contains the exact required fields for popups and details:
    hazard type, location, source, reported time, and status.
    """
    response = client.get("/api/incidents")
    assert response.status_code == 200
    incidents = response.json()["data"]
    assert len(incidents) > 0
    for inc in incidents:
        assert "hazard_type" in inc and inc["hazard_type"]
        assert "location_name" in inc and inc["location_name"]
        assert "source" in inc and inc["source"]
        assert "reported_at" in inc and inc["reported_at"]
        assert "status" in inc and inc["status"] in [
            "UNVERIFIED",
            "CORROBORATED",
            "OFFICIALLY_CONFIRMED",
            "RESOLVED",
        ]

def test_create_incident_save_failure():
    """
    Simulates a database or storage exception during incident creation
    to verify that the API returns HTTP 500 with proper error detail.
    """
    class FailingRepo(DemoIncidentRepository):
        def create_incident(self, data):
            raise RuntimeError("Database connection timed out during write operation.")

    reset_repository_for_testing(FailingRepo())
    payload = {
        "title": "Failing Save Incident",
        "description": "Testing backend response on storage write failure.",
        "hazard_category": "flood",
        "latitude": 37.77,
        "longitude": -122.41,
    }
    response = client.post("/api/incidents", json=payload)
    assert response.status_code == 500
    assert "Storage save failure" in response.json()["detail"]

def test_update_status_storage_failure():
    """
    Simulates a storage exception during status update to verify HTTP 500.
    """
    class FailingRepo(DemoIncidentRepository):
        def update_status(self, incident_id, new_status, notes=None):
            raise RuntimeError("Storage transaction aborted due to write lock.")

    reset_repository_for_testing(FailingRepo())
    valid_headers = {"X-Admin-Key": "routerescue-admin-sprint2"}
    response = client.patch(
        "/api/incidents/DEMO-INC-101/status",
        headers=valid_headers,
        json={"status": "RESOLVED"},
    )
    assert response.status_code == 500
    assert "Storage update failure" in response.json()["detail"]

def test_list_incidents_storage_failure():
    """
    Simulates a storage exception during listing to verify HTTP 500.
    """
    class FailingRepo(DemoIncidentRepository):
        def list_incidents(self, status=None, hazard_type=None, severity=None):
            raise RuntimeError("Read failure on storage replica.")

    reset_repository_for_testing(FailingRepo())
    response = client.get("/api/incidents")
    assert response.status_code == 500
    assert "Storage operation failed" in response.json()["detail"]

def test_get_incident_storage_failure():
    """
    Simulates a storage exception during single incident fetch to verify HTTP 500.
    """
    class FailingRepo(DemoIncidentRepository):
        def get_incident(self, incident_id):
            raise RuntimeError("Corrupted document store.")

    reset_repository_for_testing(FailingRepo())
    response = client.get("/api/incidents/DEMO-INC-101")
    assert response.status_code == 500
    assert "Storage operation failed" in response.json()["detail"]

