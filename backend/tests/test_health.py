from fastapi.testclient import TestClient
from app.main import app

def test_health_check():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "RouteRescue API"
    assert "timestamp" in data
    print("Health check passed successfully:", data)

def test_demo_incidents():
    client = TestClient(app)
    response = client.get("/api/incidents")
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "DEMO DATA"
    assert len(data["data"]) >= 5
    print(f"Incidents endpoint passed successfully: {len(data['data'])} incidents loaded.")

if __name__ == "__main__":
    test_health_check()
    test_demo_incidents()
