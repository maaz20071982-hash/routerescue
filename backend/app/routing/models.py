from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class RoutingMode(str, Enum):
    SHORTEST = "SHORTEST"
    AVOID_CONFIRMED_CLOSURES = "AVOID_CONFIRMED_CLOSURES"
    MINIMIZE_HAZARDS = "MINIMIZE_HAZARDS"


class GraphStatus(str, Enum):
    COMPLETE = "COMPLETE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    UNREACHABLE_DESTINATION = "UNREACHABLE_DESTINATION"
    OUT_OF_BOUNDS = "OUT_OF_BOUNDS"


class Node(BaseModel):
    id: str = Field(..., description="Unique intersection identifier")
    name: str = Field(..., description="Intersection street names or waypoint title")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class EdgeHazard(BaseModel):
    incident_id: str
    title: str
    hazard_type: str
    status: str
    severity: str
    is_confirmed_closure: bool = False
    penalty_weight: float = 0.0
    description: Optional[str] = None
    location_name: Optional[str] = None


class Edge(BaseModel):
    id: str = Field(..., description="Unique road segment identifier")
    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    street_name: str = Field(..., description="Street or corridor name")
    distance_meters: float = Field(..., gt=0.0, description="Calculated segment distance in meters")
    travel_time_seconds: Optional[float] = Field(
        default=None,
        description="Measured transit duration in seconds; None when unsupported",
    )
    speed_limit_kmh: Optional[float] = Field(default=None, description="Nominal road speed limit")
    availability: str = Field(
        default="OPEN",
        description="Physical status: OPEN, CLOSED, or RESTRICTED",
    )
    bidirectional: bool = Field(default=True, description="True if segment flows both ways")
    hazards: List[EdgeHazard] = Field(default_factory=list, description="Overlaid incident hazard records")

    model_config = ConfigDict(populate_by_name=True)


class RouteSegment(BaseModel):
    edge_id: str
    street_name: str
    from_node_id: str
    to_node_id: str
    distance_meters: float
    travel_time_seconds: Optional[float] = None
    travel_time_supported: bool = True
    speed_limit_kmh: Optional[float] = None
    has_hazard: bool = False
    hazard_summary: Optional[str] = None


class AvoidedHazard(BaseModel):
    incident_id: str
    title: str
    hazard_type: str
    status: str
    severity: str
    location_name: Optional[str] = None
    reason: str


class RouteCaution(BaseModel):
    incident_id: str
    title: str
    status: str
    severity: str
    location_name: Optional[str] = None
    message: str
    distance_to_route_meters: float


class RouteCalculationRequest(BaseModel):
    origin_node_id: Optional[str] = Field(None, description="Origin intersection ID (preferred)")
    destination_node_id: Optional[str] = Field(None, description="Destination intersection ID (preferred)")
    origin_lat: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Optional GPS origin latitude")
    origin_lng: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Optional GPS origin longitude")
    destination_lat: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Optional GPS destination latitude")
    destination_lng: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Optional GPS destination longitude")
    mode: RoutingMode = Field(
        default=RoutingMode.AVOID_CONFIRMED_CLOSURES,
        description="Routing algorithm cost mode",
    )
    use_a_star: bool = Field(
        default=True,
        description="Use A* heuristic; if False uses pure Dijkstra",
    )


class RouteCalculationResponse(BaseModel):
    route_id: str
    mode: RoutingMode
    is_reachable: bool
    algorithm_used: str
    origin: Node
    destination: Node
    path_node_ids: List[str] = []
    path_nodes: List[Node] = []
    segments: List[RouteSegment] = []
    coordinates: List[List[float]] = []  # [[lat, lng], [lat, lng], ...]
    total_distance_meters: float = 0.0
    total_distance_km: float = 0.0
    total_travel_time_seconds: Optional[float] = None
    total_travel_time_minutes: Optional[float] = None
    travel_time_supported: bool = True
    avoided_hazards: List[AvoidedHazard] = []
    encountered_hazards: List[EdgeHazard] = []
    cautions: List[RouteCaution] = []
    route_change_explanation: str
    safety_disclaimer: str = (
        "Route conditions are dynamic and subject to ongoing field hazards. "
        "No route can be guaranteed completely safe; field units must exercise tactical caution."
    )
    last_data_update: str
    graph_status: GraphStatus = GraphStatus.COMPLETE
    diagnostic_message: Optional[str] = None
    nodes_explored: int = 0
