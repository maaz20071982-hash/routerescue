import heapq
import itertools
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

from app.routing.graph import RoadGraph
from app.routing.models import (
    AvoidedHazard,
    Edge,
    EdgeHazard,
    GraphStatus,
    Node,
    RouteCalculationRequest,
    RouteCalculationResponse,
    RouteCaution,
    RouteSegment,
    RoutingMode,
)
from app.verification import haversine_distance


class RouteCalculator:
    """
    Executes Dijkstra and A* pathfinding on a RoadGraph with hazard-aware cost models.
    Preserves epistemic safety (never claims routes are guaranteed safe),
    explains route changes, and enforces evidence rules (unverified reports do not close roads).
    """

    def __init__(self, graph: RoadGraph):
        self.graph = graph

    def calculate_route(
        self,
        request: RouteCalculationRequest,
        incidents: Optional[List[dict]] = None,
        last_data_update: Optional[str] = None,
    ) -> RouteCalculationResponse:
        """
        Main calculation entrypoint.
        """
        now_iso = last_data_update or datetime.now(timezone.utc).isoformat()

        # Step 1: Dynamic Hazard Overlay
        if incidents is not None:
            self.graph.overlay_hazards(incidents)

        # Step 2: Resolve Origin and Destination Nodes
        origin_node, orig_err = self._resolve_node(
            node_id=request.origin_node_id,
            lat=request.origin_lat,
            lng=request.origin_lng,
            role="origin",
        )
        if orig_err:
            return self._build_error_response(
                origin_node=origin_node or Node(id="ORIG_UNKNOWN", name="Unknown Origin", latitude=0.0, longitude=0.0),
                destination_node=Node(id="DEST_UNKNOWN", name="Unknown Destination", latitude=0.0, longitude=0.0),
                mode=request.mode,
                status=GraphStatus.OUT_OF_BOUNDS if "coordinates" in orig_err else GraphStatus.INSUFFICIENT_DATA,
                error_message=orig_err,
                last_data_update=now_iso,
            )

        destination_node, dest_err = self._resolve_node(
            node_id=request.destination_node_id,
            lat=request.destination_lat,
            lng=request.destination_lng,
            role="destination",
        )
        if dest_err:
            return self._build_error_response(
                origin_node=origin_node,
                destination_node=destination_node or Node(id="DEST_UNKNOWN", name="Unknown Destination", latitude=0.0, longitude=0.0),
                mode=request.mode,
                status=GraphStatus.OUT_OF_BOUNDS if "coordinates" in dest_err else GraphStatus.INSUFFICIENT_DATA,
                error_message=dest_err,
                last_data_update=now_iso,
            )

        # Step 3: Run Pathfinding for Requested Mode
        algorithm_name = "A* Search" if request.use_a_star else "Dijkstra"
        chosen_path, chosen_edges, explored_count = self._run_pathfinding(
            origin_id=origin_node.id,
            destination_id=destination_node.id,
            mode=request.mode,
            use_a_star=request.use_a_star,
        )

        # Step 4: Handle Unreachable Destination
        if chosen_path is None:
            # Check if reachable under standard shortest (to explain if it's due to closures)
            baseline_path, _, _ = self._run_pathfinding(
                origin_id=origin_node.id,
                destination_id=destination_node.id,
                mode=RoutingMode.SHORTEST,
                use_a_star=request.use_a_star,
            )
            if baseline_path is not None:
                diag = (
                    f"Destination '{destination_node.name}' is unreachable under '{request.mode.value}' "
                    f"because all connecting street segments are severed by confirmed road closures."
                )
            else:
                diag = (
                    f"Destination '{destination_node.name}' is topologically disconnected from "
                    f"'{origin_node.name}' in the current road graph network."
                )

            return self._build_error_response(
                origin_node=origin_node,
                destination_node=destination_node,
                mode=request.mode,
                status=GraphStatus.UNREACHABLE_DESTINATION,
                error_message=diag,
                last_data_update=now_iso,
            )

        # Step 5: Run Baseline Pathfinding for Comparison (Shortest Unconstrained Path)
        baseline_path, baseline_edges, _ = self._run_pathfinding(
            origin_id=origin_node.id,
            destination_id=destination_node.id,
            mode=RoutingMode.SHORTEST,
            use_a_star=request.use_a_star,
        )

        # Step 6: Construct Path Geometry, Segments & Metrics
        path_nodes: List[Node] = []
        coordinates: List[List[float]] = []
        for nid in chosen_path:
            nd = self.graph.get_node(nid)
            if nd:
                path_nodes.append(nd)
                coordinates.append([nd.latitude, nd.longitude])

        segments: List[RouteSegment] = []
        total_dist_m = 0.0
        total_travel_time_sec: Optional[float] = 0.0
        travel_time_supported = True
        encountered_hazards: List[EdgeHazard] = []

        for edge, u_id, v_id in chosen_edges:
            total_dist_m += edge.distance_meters

            # Check travel time support
            if edge.travel_time_seconds is not None and travel_time_supported:
                total_travel_time_sec += edge.travel_time_seconds
            else:
                travel_time_supported = False
                total_travel_time_sec = None

            has_h = len(edge.hazards) > 0
            h_summary = ", ".join(f"{h.hazard_type}: {h.title}" for h in edge.hazards) if has_h else None

            for h in edge.hazards:
                if h not in encountered_hazards:
                    encountered_hazards.append(h)

            segments.append(
                RouteSegment(
                    edge_id=edge.id,
                    street_name=edge.street_name,
                    from_node_id=u_id,
                    to_node_id=v_id,
                    distance_meters=edge.distance_meters,
                    travel_time_seconds=edge.travel_time_seconds,
                    travel_time_supported=edge.travel_time_seconds is not None,
                    speed_limit_kmh=edge.speed_limit_kmh,
                    has_hazard=has_h,
                    hazard_summary=h_summary,
                )
            )

        total_dist_km = round(total_dist_m / 1000.0, 2)
        total_travel_min = (
            round(total_travel_time_sec / 60.0, 1) if total_travel_time_sec is not None else None
        )

        # Step 7: Identify Avoided Hazards & Formulate Route Change Explanation
        avoided_hazards: List[AvoidedHazard] = []
        route_explanation = ""

        if baseline_edges:
            chosen_edge_ids = {e[0].id for e in chosen_edges}
            for b_edge, _, _ in baseline_edges:
                if b_edge.id not in chosen_edge_ids:
                    for h in b_edge.hazards:
                        if h.is_confirmed_closure or (
                            request.mode == RoutingMode.MINIMIZE_HAZARDS and h.penalty_weight > 0
                        ):
                            avoided_hazards.append(
                                AvoidedHazard(
                                    incident_id=h.incident_id,
                                    title=h.title,
                                    hazard_type=h.hazard_type,
                                    status=h.status,
                                    severity=h.severity,
                                    location_name=h.location_name,
                                    reason=f"Avoided hazard on {b_edge.street_name} ({h.title})",
                                )
                            )

        # Compute baseline distance
        baseline_dist_m = sum(e[0].distance_meters for e in baseline_edges) if baseline_edges else total_dist_m
        dist_diff_m = round(total_dist_m - baseline_dist_m, 1)

        if avoided_hazards:
            avoided_names = ", ".join(dict.fromkeys(a.title for a in avoided_hazards))
            streets_used = list(dict.fromkeys(s.street_name for s in segments))
            route_explanation = (
                f"Route adjusted via {', '.join(streets_used[:3])} to bypass confirmed hazard: {avoided_names}. "
                f"Distance changed by +{dist_diff_m} m compared to baseline shortest corridor."
                if dist_diff_m > 0
                else f"Route adjusted via {', '.join(streets_used[:3])} to circumvent hazard ({avoided_names})."
            )
        elif request.mode == RoutingMode.SHORTEST:
            route_explanation = (
                "Baseline shortest path selected; calculated strictly by physical Euclidean/road distance."
            )
        else:
            route_explanation = (
                "Optimal direct route selected; no confirmed closures or high-risk hazards intersect this path."
            )

        # Step 8: Generate Visible Cautions for Nearby Unverified Reports
        # CRITICAL SPRINT 4 REQUIREMENT: Unverified social reports must NOT automatically close roads;
        # they may generate a visible caution when relevant.
        cautions: List[RouteCaution] = []
        if incidents:
            for inc in incidents:
                status = str(inc.get("status", "")).upper()
                if status == "UNVERIFIED":
                    inc_lat = float(inc.get("latitude", inc.get("lat", 0.0)))
                    inc_lng = float(inc.get("longitude", inc.get("lng", 0.0)))
                    inc_title = inc.get("title", "Community Hazard Report")
                    inc_id = inc.get("id", "UNV")
                    inc_sev = inc.get("severity", "medium")
                    inc_loc = inc.get("location_name") or inc.get("locationName")

                    # Check distance from incident to any node on the route
                    min_dist_to_route = float("inf")
                    for p_node in path_nodes:
                        d = haversine_distance(inc_lat, inc_lng, p_node.latitude, p_node.longitude)
                        if d < min_dist_to_route:
                            min_dist_to_route = d

                    # If within 350 meters of route, emit visible caution
                    if min_dist_to_route <= 350.0:
                        cautions.append(
                            RouteCaution(
                                incident_id=inc_id,
                                title=inc_title,
                                status=status,
                                severity=inc_sev,
                                location_name=inc_loc,
                                message=(
                                    f"Visible Caution: Unverified community report ({inc_title}) located "
                                    f"within {int(min_dist_to_route)}m of route corridor. Road remains open; "
                                    f"field units should exercise heightened vigilance."
                                ),
                                distance_to_route_meters=round(min_dist_to_route, 1),
                            )
                        )

        route_id = f"ROUTE-{abs(hash((origin_node.id, destination_node.id, request.mode.value, int(total_dist_m)))) % 100000:05d}"

        return RouteCalculationResponse(
            route_id=route_id,
            mode=request.mode,
            is_reachable=True,
            algorithm_used=algorithm_name,
            origin=origin_node,
            destination=destination_node,
            path_node_ids=chosen_path,
            path_nodes=path_nodes,
            segments=segments,
            coordinates=coordinates,
            total_distance_meters=round(total_dist_m, 1),
            total_distance_km=total_dist_km,
            total_travel_time_seconds=total_travel_time_sec,
            total_travel_time_minutes=total_travel_min,
            travel_time_supported=travel_time_supported,
            avoided_hazards=avoided_hazards,
            encountered_hazards=encountered_hazards,
            cautions=cautions,
            route_change_explanation=route_explanation,
            safety_disclaimer=(
                "Route conditions are dynamic and subject to ongoing field hazards. "
                "No route can be guaranteed completely safe; field units must exercise tactical caution."
            ),
            last_data_update=now_iso,
            graph_status=GraphStatus.COMPLETE,
            nodes_explored=explored_count,
        )

    def _run_pathfinding(
        self,
        origin_id: str,
        destination_id: str,
        mode: RoutingMode,
        use_a_star: bool,
    ) -> Tuple[Optional[List[str]], Optional[List[Tuple[Edge, str, str]]], int]:
        """
        Executes Dijkstra or A* search from origin_id to destination_id.
        Returns (node_id_list, list_of_(edge, from_node, to_node), nodes_explored_count).
        """
        dest_node = self.graph.get_node(destination_id)
        if not dest_node:
            return None, None, 0

        # Min-heap priority queue: (f_score, tie_breaker, current_node_id)
        counter = itertools.count()
        open_set: List[Tuple[float, int, str]] = []
        heapq.heappush(open_set, (0.0, next(counter), origin_id))

        g_scores: Dict[str, float] = {origin_id: 0.0}
        # node_id -> (predecessor_node_id, edge)
        came_from: Dict[str, Tuple[str, Edge]] = {}
        visited: Set[str] = set()
        explored_count = 0

        while open_set:
            current_f, _, current_id = heapq.heappop(open_set)
            if current_id in visited:
                continue
            visited.add(current_id)
            explored_count += 1

            if current_id == destination_id:
                # Reconstruct path
                path_node_ids = [current_id]
                edges_traversed: List[Tuple[Edge, str, str]] = []
                curr = current_id
                while curr in came_from:
                    prev, edge = came_from[curr]
                    path_node_ids.append(prev)
                    edges_traversed.append((edge, prev, curr))
                    curr = prev
                path_node_ids.reverse()
                edges_traversed.reverse()
                return path_node_ids, edges_traversed, explored_count

            current_g = g_scores[current_id]

            for neighbor_node, edge in self.graph.get_neighbors(current_id):
                if neighbor_node.id in visited:
                    continue

                # Cost evaluation for edge
                edge_cost = self._evaluate_edge_cost(edge, mode)
                if math.isinf(edge_cost):
                    continue  # Impassable edge under this mode

                tentative_g = current_g + edge_cost

                if tentative_g < g_scores.get(neighbor_node.id, float("inf")):
                    came_from[neighbor_node.id] = (current_id, edge)
                    g_scores[neighbor_node.id] = tentative_g

                    # A* heuristic
                    h = 0.0
                    if use_a_star:
                        h = haversine_distance(
                            neighbor_node.latitude,
                            neighbor_node.longitude,
                            dest_node.latitude,
                            dest_node.longitude,
                        )

                    f_score = tentative_g + h
                    heapq.heappush(open_set, (f_score, next(counter), neighbor_node.id))

        return None, None, explored_count

    def _evaluate_edge_cost(self, edge: Edge, mode: RoutingMode) -> float:
        """
        Determines the edge traversal cost based on the active RoutingMode.
        - Physical CLOSED availability: always infinity.
        - SHORTEST: nominal distance.
        - AVOID_CONFIRMED_CLOSURES: infinity if confirmed closure, else nominal distance.
        - MINIMIZE_HAZARDS: infinity if confirmed closure, else distance * (1.0 + risk penalty).
        """
        if edge.availability.upper() == "CLOSED":
            return float("inf")

        has_confirmed_closure = any(h.is_confirmed_closure for h in edge.hazards)

        if mode == RoutingMode.SHORTEST:
            return edge.distance_meters

        if mode == RoutingMode.AVOID_CONFIRMED_CLOSURES:
            if has_confirmed_closure:
                return float("inf")
            return edge.distance_meters

        if mode == RoutingMode.MINIMIZE_HAZARDS:
            if has_confirmed_closure:
                return float("inf")
            # Apply risk penalty for corroborated/active hazards
            # UNVERIFIED reports do NOT add closure penalties
            total_penalty = sum(h.penalty_weight for h in edge.hazards)
            return edge.distance_meters * (1.0 + total_penalty)

        return edge.distance_meters

    def _resolve_node(
        self,
        node_id: Optional[str],
        lat: Optional[float],
        lng: Optional[float],
        role: str,
    ) -> Tuple[Optional[Node], Optional[str]]:
        """
        Resolves a Node from either an explicit node ID or GPS coordinates.
        Returns (node, error_string_if_any).
        """
        if node_id:
            node = self.graph.get_node(node_id)
            if node:
                return node, None
            return None, f"{role.capitalize()} node ID '{node_id}' does not exist in the road network."

        if lat is not None and lng is not None:
            if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
                return None, f"Invalid {role} GPS coordinates: ({lat}, {lng}) out of WGS-84 geographic bounds."

            nearest, dist_m = self.graph.find_nearest_node(lat, lng, max_distance_meters=2500.0)
            if nearest:
                return nearest, None
            return None, (
                f"{role.capitalize()} coordinates ({lat}, {lng}) are outside the operational road graph coverage "
                f"threshold (nearest intersection is {int(dist_m)}m away, exceeding 2500m sector limit)."
            )

        return None, f"Neither node ID nor GPS coordinates were provided for {role}."

    def _build_error_response(
        self,
        origin_node: Node,
        destination_node: Node,
        mode: RoutingMode,
        status: GraphStatus,
        error_message: str,
        last_data_update: str,
    ) -> RouteCalculationResponse:
        return RouteCalculationResponse(
            route_id=f"ERR-{abs(hash(error_message)) % 10000:04d}",
            mode=mode,
            is_reachable=False,
            algorithm_used="None",
            origin=origin_node,
            destination=destination_node,
            path_node_ids=[],
            path_nodes=[],
            segments=[],
            coordinates=[],
            total_distance_meters=0.0,
            total_distance_km=0.0,
            total_travel_time_seconds=None,
            total_travel_time_minutes=None,
            travel_time_supported=False,
            avoided_hazards=[],
            encountered_hazards=[],
            cautions=[],
            route_change_explanation="No route calculated due to graph or network constraints.",
            safety_disclaimer=(
                "Route conditions are dynamic and subject to ongoing field hazards. "
                "No route can be guaranteed completely safe; field units must exercise tactical caution."
            ),
            last_data_update=last_data_update,
            graph_status=status,
            diagnostic_message=error_message,
            nodes_explored=0,
        )
