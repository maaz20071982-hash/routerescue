import math
from typing import Dict, List, Optional, Tuple

from app.routing.models import Edge, EdgeHazard, Node
from app.verification import haversine_distance


class RoadGraph:
    """
    Testable in-memory road network graph for intersection and street segment routing.
    Designed as a decoupled interface so it can be swapped for OpenStreetMap /
    real municipal spatial networks.
    """

    def __init__(self):
        self.nodes: Dict[str, Node] = {}
        self.edges: Dict[str, Edge] = {}
        # node_id -> list of (neighbor_node_id, edge_id)
        self.adjacency: Dict[str, List[Tuple[str, str]]] = {}

    def add_node(self, node: Node) -> None:
        self.nodes[node.id] = node
        if node.id not in self.adjacency:
            self.adjacency[node.id] = []

    def add_edge(self, edge: Edge) -> None:
        self.edges[edge.id] = edge
        if edge.source not in self.adjacency:
            self.adjacency[edge.source] = []
        self.adjacency[edge.source].append((edge.target, edge.id))

        if edge.bidirectional:
            if edge.target not in self.adjacency:
                self.adjacency[edge.target] = []
            self.adjacency[edge.target].append((edge.source, edge.id))

    def get_node(self, node_id: str) -> Optional[Node]:
        return self.nodes.get(node_id)

    def get_edge(self, edge_id: str) -> Optional[Edge]:
        return self.edges.get(edge_id)

    def get_neighbors(self, node_id: str) -> List[Tuple[Node, Edge]]:
        """
        Returns list of (neighbor_node, edge) traversable from node_id.
        """
        results: List[Tuple[Node, Edge]] = []
        for neighbor_id, edge_id in self.adjacency.get(node_id, []):
            neighbor = self.nodes.get(neighbor_id)
            edge = self.edges.get(edge_id)
            if neighbor and edge:
                results.append((neighbor, edge))
        return results

    def find_nearest_node(
        self,
        lat: float,
        lng: float,
        max_distance_meters: float = 2500.0,
    ) -> Tuple[Optional[Node], float]:
        """
        Finds the nearest graph intersection node to the given coordinates.
        Returns (node, distance_in_meters). If exceeding max_distance_meters, returns (None, min_dist).
        """
        if not self.nodes:
            return None, float("inf")

        best_node: Optional[Node] = None
        min_dist = float("inf")

        for node in self.nodes.values():
            dist = haversine_distance(lat, lng, node.latitude, node.longitude)
            if dist < min_dist:
                min_dist = dist
                best_node = node

        if min_dist <= max_distance_meters:
            return best_node, min_dist
        return None, min_dist

    def clear_hazards(self) -> None:
        """Resets all overlaid hazard metadata from graph edges."""
        for edge in self.edges.values():
            edge.hazards = []

    def overlay_hazards(self, incidents: List[dict]) -> None:
        """
        Dynamically overlays active incidents onto graph edges.
        Rules:
        - RESOLVED incidents: completely ignored.
        - OFFICIALLY_CONFIRMED severe closures: flagged as confirmed closures (is_confirmed_closure=True).
        - CORROBORATED hazards: added as risk penalties (does NOT hard-close unless physical closure).
        - UNVERIFIED reports: added as unverified hazards without closing roads (0 penalty, produces caution).
        """
        self.clear_hazards()

        for inc in incidents:
            status = str(inc.get("status", "UNVERIFIED")).upper()
            if status == "RESOLVED":
                continue

            inc_id = inc.get("id", "UNKNOWN")
            title = inc.get("title", "Active Hazard")
            hazard_type = str(inc.get("hazard_type", inc.get("type", "hazard"))).lower()
            severity = str(inc.get("severity", "medium")).lower()
            inc_lat = float(inc.get("latitude", inc.get("lat", 0.0)))
            inc_lng = float(inc.get("longitude", inc.get("lng", 0.0)))
            loc_name = inc.get("location_name") or inc.get("locationName")
            affected_routes = [r.lower() for r in inc.get("affected_routes", inc.get("affectedRoutes", []))]

            is_confirmed_closure = False
            penalty_weight = 0.0

            # Rule for Confirmed Road Closure
            if status == "OFFICIALLY_CONFIRMED":
                # Severe blockages, floods, gas leaks, road closures
                is_severe = (
                    hazard_type in ("flood", "fire", "infrastructure")
                    or severity in ("critical", "high")
                    or any(k in title.lower() for k in ("closure", "blockage", "spill", "leak", "collapsed", "flooded"))
                )
                if is_severe:
                    is_confirmed_closure = True
                    penalty_weight = 100.0
                else:
                    penalty_weight = 3.0
            elif status == "CORROBORATED":
                # Verified corroboration: increases traversal risk penalty for MINIMIZE_HAZARDS
                # but NEVER automatically marks confirmed road closure!
                penalty_weight = 4.0 if severity in ("critical", "high") else 3.0
            elif status == "UNVERIFIED":
                # UNVERIFIED social reports MUST NOT automatically close roads.
                # Penalty is 0.0; road remains 100% open and traversable.
                penalty_weight = 0.0

            hazard_item = EdgeHazard(
                incident_id=inc_id,
                title=title,
                hazard_type=hazard_type,
                status=status,
                severity=severity,
                is_confirmed_closure=is_confirmed_closure,
                penalty_weight=penalty_weight,
                description=inc.get("description"),
                location_name=loc_name,
            )

            # Match incident to affected edges:
            # 1. By affected_routes keyword in street_name
            # 2. By spatial proximity to edge segment midpoint or endpoints (<= 160m)
            matched_edges = 0
            for edge in self.edges.values():
                s_node = self.nodes.get(edge.source)
                t_node = self.nodes.get(edge.target)
                if not s_node or not t_node:
                    continue

                # Check street name match
                street_match = any(
                    r in edge.street_name.lower() or edge.street_name.lower() in r
                    for r in affected_routes
                ) if affected_routes else False

                # Check proximity to endpoints and midpoint
                dist_s = haversine_distance(inc_lat, inc_lng, s_node.latitude, s_node.longitude)
                dist_t = haversine_distance(inc_lat, inc_lng, t_node.latitude, t_node.longitude)
                mid_lat = (s_node.latitude + t_node.latitude) / 2.0
                mid_lng = (s_node.longitude + t_node.longitude) / 2.0
                dist_mid = haversine_distance(inc_lat, inc_lng, mid_lat, mid_lng)

                min_dist = min(dist_s, dist_t, dist_mid)

                # If affected routes specified, prioritize matching street segments within 220m
                if affected_routes:
                    if street_match and min_dist <= 220.0:
                        edge.hazards.append(hazard_item)
                        matched_edges += 1
                else:
                    # Generic spatial proximity (within 90m of segment)
                    if min_dist <= 90.0:
                        edge.hazards.append(hazard_item)
                        matched_edges += 1

            # Fallback: if no edge was matched, match the single closest edge within 180m
            if matched_edges == 0:
                closest_edge: Optional[Edge] = None
                closest_dist = float("inf")
                for edge in self.edges.values():
                    s_node = self.nodes.get(edge.source)
                    t_node = self.nodes.get(edge.target)
                    if s_node and t_node:
                        mid_lat = (s_node.latitude + t_node.latitude) / 2.0
                        mid_lng = (s_node.longitude + t_node.longitude) / 2.0
                        d = haversine_distance(inc_lat, inc_lng, mid_lat, mid_lng)
                        if d < closest_dist:
                            closest_dist = d
                            closest_edge = edge
                if closest_edge and closest_dist <= 180.0:
                    closest_edge.hazards.append(hazard_item)
