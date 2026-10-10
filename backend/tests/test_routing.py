import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routing.demo_network import build_default_road_graph
from app.routing.models import (
    GraphStatus,
    RouteCalculationRequest,
    RoutingMode,
)
from app.routing.router import RouteCalculator


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_incidents():
    """
    Standard incident dataset covering confirmed closures, corroborated hazards,
    unverified community reports, and resolved hazards.
    """
    return [
        {
            "id": "DEMO-INC-101",
            "title": "Flooded Underpass & Road Blockage",
            "hazard_type": "flood",
            "severity": "critical",
            "status": "OFFICIALLY_CONFIRMED",
            "latitude": 37.7767,
            "longitude": -122.4169,
            "location_name": "Market St & 10th St Underpass",
            "affected_routes": ["Market St"],
            "description": "Severe localized flooding submerging underpass lanes under 1.2m of water.",
        },
        {
            "id": "DEMO-INC-102",
            "title": "Structural Scaffolding Collapse",
            "hazard_type": "hazard",
            "severity": "medium",
            "status": "CORROBORATED",
            "latitude": 37.7833,
            "longitude": -122.4167,
            "location_name": "Geary Blvd at Larkin",
            "affected_routes": ["Geary Blvd"],
            "description": "Scaffolding pipes collapsed into outer eastern lanes; single lane squeeze.",
        },
        {
            "id": "DEMO-INC-103",
            "title": "Traffic Signals Out at Multi-Way Junction",
            "hazard_type": "congestion",
            "severity": "medium",
            "status": "UNVERIFIED",
            "latitude": 37.7600,
            "longitude": -122.4350,
            "location_name": "18th St & Castro St",
            "affected_routes": ["Castro St"],
            "description": "Signal array dark following transformer pop. Single eyewitness submission.",
        },
        {
            "id": "DEMO-INC-104",
            "title": "Fallen Utility Line Cleared",
            "hazard_type": "infrastructure",
            "severity": "low",
            "status": "RESOLVED",
            "latitude": 37.7808,
            "longitude": -122.4060,
            "location_name": "Mission & 4th",
            "affected_routes": ["Mission St"],
            "description": "Cleared and safe.",
        },
    ]


def test_ordinary_routing_shortest_mode():
    """
    Tests ordinary shortest route calculation on the road graph.
    Verifies reachable status, node chain, positive distance, and travel time.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    req = RouteCalculationRequest(
        origin_node_id="INT_MARKET_VAN_NESS",
        destination_node_id="INT_MARKET_4TH",
        mode=RoutingMode.SHORTEST,
        use_a_star=True,
    )

    resp = router.calculate_route(req, incidents=[])

    assert resp.is_reachable is True
    assert resp.graph_status == GraphStatus.COMPLETE
    assert resp.origin.id == "INT_MARKET_VAN_NESS"
    assert resp.destination.id == "INT_MARKET_4TH"
    assert resp.path_node_ids[0] == "INT_MARKET_VAN_NESS"
    assert resp.path_node_ids[-1] == "INT_MARKET_4TH"

    # Direct Market St chain should be chosen
    assert "INT_MARKET_10TH" in resp.path_node_ids
    assert resp.total_distance_meters > 800.0
    assert resp.total_distance_km > 0.8
    assert resp.travel_time_supported is True
    assert resp.total_travel_time_seconds is not None
    assert resp.total_travel_time_minutes > 0.0

    # Epistemic safety disclaimer verification
    assert "No route can be guaranteed completely safe" in resp.safety_disclaimer


def test_confirmed_road_closure_avoidance(test_incidents):
    """
    Tests that confirmed road closures (OFFICIALLY_CONFIRMED) force the router
    to circumvent the blocked segment in AVOID_CONFIRMED_CLOSURES mode,
    while explaining the detour and listing the avoided hazard.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    req_avoid = RouteCalculationRequest(
        origin_node_id="INT_MARKET_11TH",
        destination_node_id="INT_MARKET_8TH",
        mode=RoutingMode.AVOID_CONFIRMED_CLOSURES,
        use_a_star=True,
    )

    resp_avoid = router.calculate_route(req_avoid, incidents=test_incidents)

    assert resp_avoid.is_reachable is True
    # The blocked intersection INT_MARKET_10TH must NOT be in the chosen path
    assert "INT_MARKET_10TH" not in resp_avoid.path_node_ids

    # Path must detour via Mission St
    assert any("INT_MISSION" in nid for nid in resp_avoid.path_node_ids)

    # Avoided hazards must contain DEMO-INC-101
    avoided_ids = [a.incident_id for a in resp_avoid.avoided_hazards]
    assert "DEMO-INC-101" in avoided_ids

    # Route change explanation must mention the avoided hazard and detour
    assert "Flood" in resp_avoid.route_change_explanation or "Flooded Underpass" in resp_avoid.route_change_explanation
    assert len(resp_avoid.segments) > 0

    # Compare with SHORTEST mode without closure avoidance
    req_shortest = RouteCalculationRequest(
        origin_node_id="INT_MARKET_11TH",
        destination_node_id="INT_MARKET_8TH",
        mode=RoutingMode.SHORTEST,
        use_a_star=True,
    )
    resp_shortest = router.calculate_route(req_shortest, incidents=test_incidents)

    # Shortest takes direct Market St through 10th
    assert "INT_MARKET_10TH" in resp_shortest.path_node_ids
    assert resp_avoid.total_distance_meters > resp_shortest.total_distance_meters


def test_alternate_routes_minimize_hazards_mode(test_incidents):
    """
    Tests MINIMIZE_HAZARDS mode on Geary Blvd corridor.
    DEMO-INC-102 (Scaffolding collapse) is CORROBORATED (not a confirmed hard closure).
    - Under AVOID_CONFIRMED_CLOSURES: Geary Blvd is still traversable because it is not a closed road.
    - Under MINIMIZE_HAZARDS: Geary receives a risk penalty, so the router diverts to Sutter St bypass.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    req_closures = RouteCalculationRequest(
        origin_node_id="INT_GEARY_VAN_NESS",
        destination_node_id="INT_GEARY_LEAVENWORTH",
        mode=RoutingMode.AVOID_CONFIRMED_CLOSURES,
        use_a_star=True,
    )
    resp_closures = router.calculate_route(req_closures, incidents=test_incidents)

    # Under closures-only mode, takes Geary directly
    assert "INT_GEARY_LARKIN" in resp_closures.path_node_ids

    req_minimize = RouteCalculationRequest(
        origin_node_id="INT_GEARY_VAN_NESS",
        destination_node_id="INT_GEARY_LEAVENWORTH",
        mode=RoutingMode.MINIMIZE_HAZARDS,
        use_a_star=True,
    )
    resp_minimize = router.calculate_route(req_minimize, incidents=test_incidents)

    # Under MINIMIZE_HAZARDS, avoids the scaffolding hazard and detours via Sutter St!
    assert "INT_SUTTER_LARKIN" in resp_minimize.path_node_ids
    assert "INT_SUTTER_LEAVENWORTH" in resp_minimize.path_node_ids
    assert any("Sutter St" in seg.street_name for seg in resp_minimize.segments)


def test_unverified_social_reports_do_not_close_roads_and_generate_caution(test_incidents):
    """
    CRITICAL REQUIREMENT:
    Unverified social reports must NOT automatically close roads;
    they may generate a visible caution when relevant.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    req = RouteCalculationRequest(
        origin_node_id="INT_CASTRO_18TH",
        destination_node_id="INT_CHURCH_MARKET",
        mode=RoutingMode.AVOID_CONFIRMED_CLOSURES,
        use_a_star=True,
    )

    resp = router.calculate_route(req, incidents=test_incidents)

    # Road must remain OPEN and traversable
    assert resp.is_reachable is True
    assert "INT_CASTRO_18TH" in resp.path_node_ids
    assert "INT_CASTRO_MARKET" in resp.path_node_ids

    # But MUST generate a visible caution for DEMO-INC-103
    caution_ids = [c.incident_id for c in resp.cautions]
    assert "DEMO-INC-103" in caution_ids

    matching_caution = next(c for c in resp.cautions if c.incident_id == "DEMO-INC-103")
    assert matching_caution.status == "UNVERIFIED"
    assert "Visible Caution" in matching_caution.message
    assert "road remains open" in matching_caution.message.lower()


def test_unreachable_destination_disconnected_node():
    """
    Tests unreachable destination handling when a node is disconnected from the network.
    Verifies is_reachable=False and UNREACHABLE_DESTINATION status with clear explanation.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    req = RouteCalculationRequest(
        origin_node_id="INT_MARKET_VAN_NESS",
        destination_node_id="INT_ISOLATED_DEPOT",
        mode=RoutingMode.SHORTEST,
    )

    resp = router.calculate_route(req, incidents=[])

    assert resp.is_reachable is False
    assert resp.graph_status == GraphStatus.UNREACHABLE_DESTINATION
    assert "disconnected" in resp.diagnostic_message.lower() or "unreachable" in resp.diagnostic_message.lower()
    assert resp.total_distance_meters == 0.0


def test_unreachable_destination_severed_by_closures(test_incidents):
    """
    Tests scenario where destination is unreachable due to confirmed road closures.
    """
    graph = build_default_road_graph()
    # Artificially close all connections to an endpoint
    for edge in graph.edges.values():
        if edge.source == "INT_MARKET_4TH" or edge.target == "INT_MARKET_4TH":
            edge.availability = "CLOSED"

    router = RouteCalculator(graph)
    req = RouteCalculationRequest(
        origin_node_id="INT_MARKET_VAN_NESS",
        destination_node_id="INT_MARKET_4TH",
        mode=RoutingMode.AVOID_CONFIRMED_CLOSURES,
    )

    resp = router.calculate_route(req, incidents=[])

    assert resp.is_reachable is False
    assert resp.graph_status == GraphStatus.UNREACHABLE_DESTINATION


def test_invalid_coordinates_validation(client):
    """
    Tests API validation when GPS coordinates are out of valid bounds.
    """
    # Latitude out of bounds (-90 to +90)
    res_lat = client.post(
        "/api/routing/calculate",
        json={"origin_lat": 999.0, "origin_lng": -122.4, "destination_node_id": "INT_MARKET_4TH"},
    )
    assert res_lat.status_code in (400, 422)

    # Longitude out of bounds (-180 to +180)
    res_lng = client.post(
        "/api/routing/calculate",
        json={"origin_lat": 37.7, "origin_lng": -999.0, "destination_node_id": "INT_MARKET_4TH"},
    )
    assert res_lng.status_code in (400, 422)


def test_coordinates_beyond_road_graph_coverage():
    """
    Tests that coordinates located too far from any graph intersection (> 2500m)
    are diagnosed clearly without crashing.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    # Coordinates in Los Angeles (far from San Francisco network)
    req = RouteCalculationRequest(
        origin_lat=34.0522,
        origin_lng=-118.2437,
        destination_node_id="INT_MARKET_4TH",
    )

    resp = router.calculate_route(req, incidents=[])

    assert resp.is_reachable is False
    assert resp.graph_status in (GraphStatus.OUT_OF_BOUNDS, GraphStatus.INSUFFICIENT_DATA)
    assert "outside the operational road graph coverage" in resp.diagnostic_message


def test_travel_time_only_when_supported():
    """
    CRITICAL REQUIREMENT:
    Display travel time only when supported; do not invent numbers.
    When a path traverses an edge lacking speed/transit duration data,
    travel_time_supported must be False and total_travel_time_seconds must be None.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    # Route specifically traversing E_HISTORIC_ALLEY (INT_MISSION_8TH to INT_FOLSOM_8TH)
    req = RouteCalculationRequest(
        origin_node_id="INT_MISSION_8TH",
        destination_node_id="INT_FOLSOM_8TH",
        mode=RoutingMode.SHORTEST,
    )

    resp = router.calculate_route(req, incidents=[])

    assert resp.is_reachable is True
    # Traversing Minna Historic Alley has no speed profile
    assert resp.travel_time_supported is False
    assert resp.total_travel_time_seconds is None
    assert resp.total_travel_time_minutes is None


def test_dijkstra_and_a_star_optimality_parity():
    """
    Verifies that Dijkstra and A* produce equivalent optimal paths.
    """
    graph = build_default_road_graph()
    router = RouteCalculator(graph)

    req_astar = RouteCalculationRequest(
        origin_node_id="INT_MARKET_VAN_NESS",
        destination_node_id="INT_MARKET_4TH",
        mode=RoutingMode.SHORTEST,
        use_a_star=True,
    )
    req_dijkstra = RouteCalculationRequest(
        origin_node_id="INT_MARKET_VAN_NESS",
        destination_node_id="INT_MARKET_4TH",
        mode=RoutingMode.SHORTEST,
        use_a_star=False,
    )

    resp_astar = router.calculate_route(req_astar, incidents=[])
    resp_dijkstra = router.calculate_route(req_dijkstra, incidents=[])

    assert resp_astar.is_reachable is True
    assert resp_dijkstra.is_reachable is True
    assert resp_astar.total_distance_meters == resp_dijkstra.total_distance_meters
    assert resp_astar.path_node_ids == resp_dijkstra.path_node_ids
    assert resp_astar.algorithm_used == "A* Search"
    assert resp_dijkstra.algorithm_used == "Dijkstra"


def test_api_network_and_presets_endpoints(client):
    """
    Tests GET /api/routing/network and GET /api/routing/presets.
    """
    res_presets = client.get("/api/routing/presets")
    assert res_presets.status_code == 200
    presets_data = res_presets.json()
    assert "data" in presets_data
    assert len(presets_data["data"]) >= 4

    res_network = client.get("/api/routing/network")
    assert res_network.status_code == 200
    network_data = res_network.json()
    assert "nodes" in network_data
    assert "edges" in network_data
    assert network_data["total_nodes"] > 20
    assert network_data["total_edges"] > 30
