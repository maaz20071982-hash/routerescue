import math
from typing import Dict, List, Optional
from app.routing.graph import RoadGraph
from app.routing.models import Edge, Node
from app.verification import haversine_distance


def build_default_road_graph() -> RoadGraph:
    """
    Constructs the standard RouteRescue demonstration road network.
    Covers San Francisco Downtown, SoMa, Civic Center, and Castro sectors.
    Includes named intersections, distances calculated via Haversine,
    speed limits, travel times, and an isolated node for unreachable testing.
    """
    graph = RoadGraph()

    # Define Intersections (Nodes)
    nodes_data = [
        # Market St Corridor
        Node(id="INT_MARKET_VAN_NESS", name="Market St & Van Ness Ave", latitude=37.7753, longitude=-122.4194),
        Node(id="INT_MARKET_11TH", name="Market St & 11th St", latitude=37.7760, longitude=-122.4182),
        Node(id="INT_MARKET_10TH", name="Market St & 10th St", latitude=37.7767, longitude=-122.4169),
        Node(id="INT_MARKET_9TH", name="Market St & 9th St", latitude=37.7774, longitude=-122.4156),
        Node(id="INT_MARKET_8TH", name="Market St & 8th St", latitude=37.7785, longitude=-122.4140),
        Node(id="INT_MARKET_7TH", name="Market St & 7th St", latitude=37.7797, longitude=-122.4125),
        Node(id="INT_MARKET_6TH", name="Market St & 6th St", latitude=37.7809, longitude=-122.4110),
        Node(id="INT_MARKET_5TH", name="Market St & 5th St", latitude=37.7821, longitude=-122.4095),
        Node(id="INT_MARKET_4TH", name="Market St & 4th St", latitude=37.7835, longitude=-122.4078),

        # Mission St Parallel Corridor
        Node(id="INT_MISSION_11TH", name="Mission St & 11th St", latitude=37.7735, longitude=-122.4165),
        Node(id="INT_MISSION_10TH", name="Mission St & 10th St", latitude=37.7742, longitude=-122.4152),
        Node(id="INT_MISSION_9TH", name="Mission St & 9th St", latitude=37.7750, longitude=-122.4138),
        Node(id="INT_MISSION_8TH", name="Mission St & 8th St", latitude=37.7760, longitude=-122.4122),
        Node(id="INT_MISSION_7TH", name="Mission St & 7th St", latitude=37.7772, longitude=-122.4107),
        Node(id="INT_MISSION_6TH", name="Mission St & 6th St", latitude=37.7784, longitude=-122.4092),
        Node(id="INT_MISSION_5TH", name="Mission St & 5th St", latitude=37.7796, longitude=-122.4076),
        Node(id="INT_MISSION_4TH", name="Mission St & 4th St", latitude=37.7808, longitude=-122.4060),

        # Folsom / Harrison Southern Corridor
        Node(id="INT_FOLSOM_11TH", name="Folsom St & 11th St", latitude=37.7710, longitude=-122.4145),
        Node(id="INT_FOLSOM_10TH", name="Folsom St & 10th St", latitude=37.7718, longitude=-122.4132),
        Node(id="INT_FOLSOM_8TH", name="Folsom St & 8th St", latitude=37.7735, longitude=-122.4103),
        Node(id="INT_FOLSOM_7TH", name="Folsom St & 7th St", latitude=37.7748, longitude=-122.4088),
        Node(id="INT_HARRISON_7TH", name="Harrison St & 7th St", latitude=37.7740, longitude=-122.4050),
        Node(id="INT_HARRISON_6TH", name="Harrison St & 6th St", latitude=37.7752, longitude=-122.4035),

        # Geary / Sutter Northern Bypass Corridor
        Node(id="INT_GEARY_VAN_NESS", name="Geary Blvd & Van Ness Ave", latitude=37.7855, longitude=-122.4215),
        Node(id="INT_SUTTER_VAN_NESS", name="Sutter St & Van Ness Ave", latitude=37.7880, longitude=-122.4225),
        Node(id="INT_GEARY_LARKIN", name="Geary Blvd & Larkin St", latitude=37.7833, longitude=-122.4167),
        Node(id="INT_GEARY_LEAVENWORTH", name="Geary Blvd & Leavenworth St", latitude=37.7865, longitude=-122.4145),
        Node(id="INT_SUTTER_LARKIN", name="Sutter St & Larkin St", latitude=37.7885, longitude=-122.4175),
        Node(id="INT_SUTTER_LEAVENWORTH", name="Sutter St & Leavenworth St", latitude=37.7890, longitude=-122.4150),

        # Western / Castro Community Sector
        Node(id="INT_CASTRO_18TH", name="Castro St & 18th St", latitude=37.7600, longitude=-122.4350),
        Node(id="INT_CASTRO_MARKET", name="Castro St & Market St", latitude=37.7628, longitude=-122.4351),
        Node(id="INT_CHURCH_MARKET", name="Church St & Market St", latitude=37.7668, longitude=-122.4290),

        # Isolated Destination for Unreachable Routing Tests
        Node(
            id="INT_ISOLATED_DEPOT",
            name="Restricted Outpost (Disconnected Grid)",
            latitude=37.7500,
            longitude=-122.4000,
            metadata={"disconnected_testing": True},
        ),
    ]

    for n in nodes_data:
        graph.add_node(n)

    # Edge Definitions: (id, source, target, street_name, speed_limit_kmh, travel_time_supported)
    # distance is accurately computed via haversine_distance between endpoints
    raw_edges = [
        # Market St linear chain
        ("E_MKT_CHURCH_VN", "INT_CHURCH_MARKET", "INT_MARKET_VAN_NESS", "Market St", 40.0, True),
        ("E_MKT_VN_11", "INT_MARKET_VAN_NESS", "INT_MARKET_11TH", "Market St", 40.0, True),
        ("E_MKT_11_10", "INT_MARKET_11TH", "INT_MARKET_10TH", "Market St", 40.0, True),
        ("E_MKT_10_9", "INT_MARKET_10TH", "INT_MARKET_9TH", "Market St", 40.0, True),
        ("E_MKT_9_8", "INT_MARKET_9TH", "INT_MARKET_8TH", "Market St", 40.0, True),
        ("E_MKT_8_7", "INT_MARKET_8TH", "INT_MARKET_7TH", "Market St", 40.0, True),
        ("E_MKT_7_6", "INT_MARKET_7TH", "INT_MARKET_6TH", "Market St", 40.0, True),
        ("E_MKT_6_5", "INT_MARKET_6TH", "INT_MARKET_5TH", "Market St", 40.0, True),
        ("E_MKT_5_4", "INT_MARKET_5TH", "INT_MARKET_4TH", "Market St", 40.0, True),

        # Mission St linear chain
        ("E_MSN_11_10", "INT_MISSION_11TH", "INT_MISSION_10TH", "Mission St", 35.0, True),
        ("E_MSN_10_9", "INT_MISSION_10TH", "INT_MISSION_9TH", "Mission St", 35.0, True),
        ("E_MSN_9_8", "INT_MISSION_9TH", "INT_MISSION_8TH", "Mission St", 35.0, True),
        ("E_MSN_8_7", "INT_MISSION_8TH", "INT_MISSION_7TH", "Mission St", 35.0, True),
        ("E_MSN_7_6", "INT_MISSION_7TH", "INT_MISSION_6TH", "Mission St", 35.0, True),
        ("E_MSN_6_5", "INT_MISSION_6TH", "INT_MISSION_5TH", "Mission St", 35.0, True),
        ("E_MSN_5_4", "INT_MISSION_5TH", "INT_MISSION_4TH", "Mission St", 35.0, True),

        # North-South Cross Streets connecting Market and Mission
        ("E_CROSS_11TH", "INT_MARKET_11TH", "INT_MISSION_11TH", "11th St", 30.0, True),
        ("E_CROSS_10TH", "INT_MARKET_10TH", "INT_MISSION_10TH", "10th St", 30.0, True),
        ("E_CROSS_9TH", "INT_MARKET_9TH", "INT_MISSION_9TH", "9th St", 30.0, True),
        ("E_CROSS_8TH", "INT_MARKET_8TH", "INT_MISSION_8TH", "8th St", 30.0, True),
        ("E_CROSS_7TH", "INT_MARKET_7TH", "INT_MISSION_7TH", "7th St", 30.0, True),
        ("E_CROSS_6TH", "INT_MARKET_6TH", "INT_MISSION_6TH", "6th St", 30.0, True),
        ("E_CROSS_5TH", "INT_MARKET_5TH", "INT_MISSION_5TH", "5th St", 30.0, True),
        ("E_CROSS_4TH", "INT_MARKET_4TH", "INT_MISSION_4TH", "4th St", 30.0, True),

        # Folsom / Harrison Connections
        ("E_CROSS_11_FOL", "INT_MISSION_11TH", "INT_FOLSOM_11TH", "11th St", 30.0, True),
        ("E_CROSS_10_FOL", "INT_MISSION_10TH", "INT_FOLSOM_10TH", "10th St", 30.0, True),
        ("E_FOL_11_10", "INT_FOLSOM_11TH", "INT_FOLSOM_10TH", "Folsom St", 40.0, True),
        ("E_FOL_10_8", "INT_FOLSOM_10TH", "INT_FOLSOM_8TH", "Folsom St", 40.0, True),
        ("E_FOL_8_7", "INT_FOLSOM_8TH", "INT_FOLSOM_7TH", "Folsom St", 40.0, True),
        ("E_CROSS_7_FOL", "INT_MISSION_7TH", "INT_FOLSOM_7TH", "7th St", 30.0, True),
        ("E_CROSS_7_HAR", "INT_FOLSOM_7TH", "INT_HARRISON_7TH", "7th St", 30.0, True),
        ("E_HAR_7_6", "INT_HARRISON_7TH", "INT_HARRISON_6TH", "Harrison St", 40.0, True),

        # Geary / Larkin / Sutter Corridor
        ("E_VN_MKT_GEARY", "INT_MARKET_VAN_NESS", "INT_GEARY_VAN_NESS", "Van Ness Ave", 45.0, True),
        ("E_VN_GEARY_SUT", "INT_GEARY_VAN_NESS", "INT_SUTTER_VAN_NESS", "Van Ness Ave", 45.0, True),
        ("E_SUT_VN_LAR", "INT_SUTTER_VAN_NESS", "INT_SUTTER_LARKIN", "Sutter St", 35.0, True),
        ("E_GEARY_VN_LAR", "INT_GEARY_VAN_NESS", "INT_GEARY_LARKIN", "Geary Blvd", 35.0, True),
        ("E_GEARY_LAR_LVN", "INT_GEARY_LARKIN", "INT_GEARY_LEAVENWORTH", "Geary Blvd", 35.0, True),
        ("E_LAR_GEARY_SUT", "INT_GEARY_LARKIN", "INT_SUTTER_LARKIN", "Larkin St", 30.0, True),
        ("E_SUT_LAR_LVN", "INT_SUTTER_LARKIN", "INT_SUTTER_LEAVENWORTH", "Sutter St", 35.0, True),
        ("E_LVN_SUT_GEARY", "INT_SUTTER_LEAVENWORTH", "INT_GEARY_LEAVENWORTH", "Leavenworth St", 30.0, True),
        ("E_LAR_MKT_8TH", "INT_MARKET_8TH", "INT_GEARY_LARKIN", "Larkin St", 30.0, True),

        # Western / Castro Corridor
        ("E_CASTRO_18_MKT", "INT_CASTRO_18TH", "INT_CASTRO_MARKET", "Castro St", 30.0, True),
        ("E_MKT_CASTRO_CHURCH", "INT_CASTRO_MARKET", "INT_CHURCH_MARKET", "Market St", 35.0, True),

        # Special segment where travel time is intentionally UNSUPPORTED
        # to test: "display travel time only when supported; never invent numbers"
        (
            "E_HISTORIC_ALLEY",
            "INT_MISSION_8TH",
            "INT_FOLSOM_8TH",
            "Minna Historic Alley",
            None,
            False,
        ),
    ]

    for edge_id, src_id, tgt_id, street, speed_kmh, travel_time_ok in raw_edges:
        s_node = graph.get_node(src_id)
        t_node = graph.get_node(tgt_id)
        if not s_node or not t_node:
            continue

        dist_m = haversine_distance(s_node.latitude, s_node.longitude, t_node.latitude, t_node.longitude)
        # Ensure minimum realistic distance (e.g. at least 60m for city block)
        dist_m = max(dist_m, 60.0)

        # Compute travel time if supported
        travel_sec: Optional[float] = None
        if travel_time_ok and speed_kmh and speed_kmh > 0:
            speed_mps = (speed_kmh * 1000.0) / 3600.0
            travel_sec = round(dist_m / speed_mps, 1)

        edge = Edge(
            id=edge_id,
            source=src_id,
            target=tgt_id,
            street_name=street,
            distance_meters=round(dist_m, 1),
            travel_time_seconds=travel_sec,
            speed_limit_kmh=speed_kmh,
            availability="OPEN",
            bidirectional=True,
            hazards=[],
        )
        graph.add_edge(edge)

    return graph


# Preset emergency transit corridors for quick testing and operator selection
PRESET_CORRIDORS = [
    {
        "id": "PRESET-CORRIDOR-1",
        "name": "Civic Staging to Downtown Medical Hub",
        "description": "Standard transit from Civic Center / Van Ness down Market corridor to 4th St.",
        "origin_node_id": "INT_MARKET_VAN_NESS",
        "destination_node_id": "INT_MARKET_4TH",
        "default_mode": "AVOID_CONFIRMED_CLOSURES",
    },
    {
        "id": "PRESET-CORRIDOR-2",
        "name": "Geary Boulevard Corridor (Larkin Scaffolding Test)",
        "description": "Transit along Geary Blvd from Van Ness to Leavenworth (tests MINIMIZE_HAZARDS detour via Sutter St).",
        "origin_node_id": "INT_GEARY_VAN_NESS",
        "destination_node_id": "INT_GEARY_LEAVENWORTH",
        "default_mode": "MINIMIZE_HAZARDS",
    },
    {
        "id": "PRESET-CORRIDOR-3",
        "name": "Castro Community Hub to Market Civic Center",
        "description": "Transit from 18th & Castro along Market to 11th St (tests unverified report caution generation).",
        "origin_node_id": "INT_CASTRO_18TH",
        "destination_node_id": "INT_MARKET_11TH",
        "default_mode": "AVOID_CONFIRMED_CLOSURES",
    },
    {
        "id": "PRESET-CORRIDOR-4",
        "name": "SoMa Heavy Rescue (Harrison Hazardous Material Test)",
        "description": "Transit from Mission 11th to Harrison 6th (tests hazardous gas leak exclusion avoidance).",
        "origin_node_id": "INT_MISSION_11TH",
        "destination_node_id": "INT_HARRISON_6TH",
        "default_mode": "AVOID_CONFIRMED_CLOSURES",
    },
    {
        "id": "PRESET-CORRIDOR-5",
        "name": "Unreachable Destination Test Corridor",
        "description": "Transit from Market St to disconnected isolated outpost (tests unreachable destination detection).",
        "origin_node_id": "INT_MARKET_VAN_NESS",
        "destination_node_id": "INT_ISOLATED_DEPOT",
        "default_mode": "SHORTEST",
    },
]
