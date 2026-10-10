/**
 * RouteRescue Real Road Routing & Hazard-Aware Engine
 * 
 * Supports:
 * - Arbitrary GPS coordinates for Origin and Destination
 * - Real road-network routing via OpenStreetMap OSRM driving service
 * - RouteRescue dynamic hazard overlay evaluation:
 *     * Detects intersected OFFICIALLY_CONFIRMED road closures
 *     * Detects CORROBORATED hazards along corridor
 *     * Flags UNVERIFIED reports as Visible Cautions without closing roads
 *     * Evaluates route alternatives to select the safest hazard-avoiding detour
 * - Transparent safety notices (never claims a route is guaranteed safe)
 * - Metric calculations (distance in km, duration in minutes)
 * - Handling of unreachable destinations and network failures
 */

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

/**
 * Calculates Haversine distance in meters between two lat/lng coordinates.
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes minimum distance in meters from a point to a polyline.
 */
export function distanceToPolylineMeters(pointLat, pointLng, polyline) {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return haversineDistanceMeters(pointLat, pointLng, polyline[0][0], polyline[0][1]);
  }

  let minDistance = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const [lat1, lng1] = polyline[i];
    const [lat2, lng2] = polyline[i + 1];

    // Compute segment length
    const dSegment = haversineDistanceMeters(lat1, lng1, lat2, lng2);
    if (dSegment === 0) {
      const d = haversineDistanceMeters(pointLat, pointLng, lat1, lng1);
      if (d < minDistance) minDistance = d;
      continue;
    }

    // Projection parameter t
    const d1 = haversineDistanceMeters(pointLat, pointLng, lat1, lng1);
    const d2 = haversineDistanceMeters(pointLat, pointLng, lat2, lng2);

    // Midpoint check for curvature approximation
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    const dMid = haversineDistanceMeters(pointLat, pointLng, midLat, midLng);

    const d = Math.min(d1, d2, dMid);
    if (d < minDistance) {
      minDistance = d;
    }
  }

  return minDistance;
}

/**
 * Evaluates a route geometry against active incidents.
 * Enforces RouteRescue verification rules:
 * - OFFICIALLY_CONFIRMED: Hard closures when within 70m of route
 * - CORROBORATED: Corroborated risk penalties (within 90m)
 * - UNVERIFIED: Caution notices only (within 160m), roads remain open
 * - RESOLVED: completely ignored
 */
export function evaluateRouteHazards(coordinates, incidents = []) {
  const confirmedClosures = [];
  const corroboratedHazards = [];
  const cautions = [];

  for (const inc of incidents) {
    const status = (inc.status || "UNVERIFIED").toUpperCase();
    if (status === "RESOLVED") continue;

    const incLat = parseFloat(inc.latitude ?? inc.lat);
    const incLng = parseFloat(inc.longitude ?? inc.lng);
    if (isNaN(incLat) || isNaN(incLng)) continue;

    const distToRoute = distanceToPolylineMeters(incLat, incLng, coordinates);

    if (status === "OFFICIALLY_CONFIRMED" && distToRoute <= 80) {
      confirmedClosures.push({
        incident_id: inc.id,
        title: inc.title,
        hazard_type: inc.hazard_type || inc.type || "flood",
        severity: inc.severity || "high",
        status: "OFFICIALLY_CONFIRMED",
        location_name: inc.location_name || inc.locationName,
        distance_to_route_meters: Math.round(distToRoute),
        description: inc.description
      });
    } else if (status === "CORROBORATED" && distToRoute <= 100) {
      corroboratedHazards.push({
        incident_id: inc.id,
        title: inc.title,
        hazard_type: inc.hazard_type || inc.type || "hazard",
        severity: inc.severity || "medium",
        status: "CORROBORATED",
        location_name: inc.location_name || inc.locationName,
        distance_to_route_meters: Math.round(distToRoute),
        description: inc.description
      });
    } else if (status === "UNVERIFIED" && distToRoute <= 180) {
      cautions.push({
        incident_id: inc.id,
        title: inc.title,
        status: "UNVERIFIED",
        severity: inc.severity || "low",
        location_name: inc.location_name || inc.locationName,
        message: `Visible Caution: Unverified community report (${inc.title}) within ${Math.round(distToRoute)}m. Road remains open; proceed with caution.`,
        distance_to_route_meters: Math.round(distToRoute)
      });
    }
  }

  return { confirmedClosures, corroboratedHazards, cautions };
}

/**
 * Calculates a real road network route between arbitrary GPS coordinates.
 * Evaluates route alternatives against RouteRescue verified hazards.
 *
 * @param {object} params
 *   origin: { lat, lng, name }
 *   destination: { lat, lng, name }
 *   mode: "AVOID_CONFIRMED_CLOSURES" | "MINIMIZE_HAZARDS" | "SHORTEST"
 *   incidents: Array of incident objects
 *   signal?: AbortSignal
 */
export async function calculateRealRoadRoute({
  origin,
  destination,
  mode = "AVOID_CONFIRMED_CLOSURES",
  incidents = [],
  signal = null
}) {
  const origLat = parseFloat(origin.lat ?? origin.latitude);
  const origLng = parseFloat(origin.lng ?? origin.longitude);
  const destLat = parseFloat(destination.lat ?? destination.latitude);
  const destLng = parseFloat(destination.lng ?? destination.longitude);

  if (isNaN(origLat) || isNaN(origLng) || isNaN(destLat) || isNaN(destLng)) {
    return {
      success: false,
      error: "Invalid origin or destination coordinates. Both must have valid latitude and longitude."
    };
  }

  // WGS-84 coordinate validation
  if (
    origLat < -90 || origLat > 90 || origLng < -180 || origLng > 180 ||
    destLat < -90 || destLat > 90 || destLng < -180 || destLng > 180
  ) {
    return {
      success: false,
      error: "Coordinates out of geographic WGS-84 bounds (-90 to 90 lat, -180 to 180 lng)."
    };
  }

  // Distance check between origin and destination
  const straightLineDistM = haversineDistanceMeters(origLat, origLng, destLat, destLng);
  if (straightLineDistM < 10) {
    return {
      success: false,
      error: "Origin and destination are at the exact same location (under 10 meters apart)."
    };
  }

  try {
    // Query OSRM routing with alternatives
    const osrmUrl = `${OSRM_BASE_URL}/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const mergedSignal = signal || controller.signal;

    const response = await fetch(osrmUrl, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: mergedSignal
    });
    clearTimeout(timeoutId);

    if (response.status === 429) {
      return {
        success: false,
        error: "Routing service rate limit reached. Please wait a moment and recalculate."
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Road routing service returned HTTP ${response.status}.`
      };
    }

    const data = await response.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      return {
        success: false,
        error: data.message || "Destination is unreachable via current road network."
      };
    }

    // Process all candidate routes returned by OSRM
    const candidateRoutes = data.routes.map((route, idx) => {
      // OSRM GeoJSON is [lon, lat] -> convert to Leaflet [lat, lon]
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      const distM = route.distance;
      const durationSec = route.duration;
      const hazardAnalysis = evaluateRouteHazards(coords, incidents);

      return {
        index: idx,
        coordinates: coords,
        total_distance_meters: Math.round(distM),
        total_distance_km: parseFloat((distM / 1000).toFixed(2)),
        total_travel_time_seconds: Math.round(durationSec),
        total_travel_time_minutes: parseFloat((durationSec / 60).toFixed(1)),
        ...hazardAnalysis
      };
    });

    // Select optimal route based on requested mode:
    // AVOID_CONFIRMED_CLOSURES: Pick route with 0 confirmed closures; if multiple, pick shortest
    // MINIMIZE_HAZARDS: Penalize closures (infinite) and corroborated hazards (extra weight)
    // SHORTEST: Pick route with minimum distance
    let chosenRoute = candidateRoutes[0];
    let avoidedHazards = [];

    if (mode === "AVOID_CONFIRMED_CLOSURES") {
      const cleanRoute = candidateRoutes.find(r => r.confirmedClosures.length === 0);
      if (cleanRoute) {
        chosenRoute = cleanRoute;
        // If candidate 0 had closures and candidate X didn't, candidate 0's closures were avoided
        if (candidateRoutes[0].confirmedClosures.length > 0 && cleanRoute.index !== 0) {
          avoidedHazards = candidateRoutes[0].confirmedClosures.map(c => ({
            incident_id: c.incident_id,
            title: c.title,
            hazard_type: c.hazard_type,
            status: c.status,
            severity: c.severity,
            location_name: c.location_name,
            reason: `Bypassed confirmed closure: route detoured via open road network (${cleanRoute.total_distance_km} km vs ${candidateRoutes[0].total_distance_km} km direct).`
          }));
        }
      } else {
        // All candidate routes intersect a closure
        chosenRoute = candidateRoutes[0];
      }
    } else if (mode === "MINIMIZE_HAZARDS") {
      let lowestScore = Infinity;
      for (const r of candidateRoutes) {
        const closurePenalty = r.confirmedClosures.length * 50000;
        const hazardPenalty = r.corroboratedHazards.length * 2000;
        const score = r.total_distance_meters + closurePenalty + hazardPenalty;
        if (score < lowestScore) {
          lowestScore = score;
          chosenRoute = r;
        }
      }
      if (candidateRoutes[0] !== chosenRoute) {
        avoidedHazards = candidateRoutes[0].confirmedClosures.concat(candidateRoutes[0].corroboratedHazards).map(c => ({
          incident_id: c.incident_id,
          title: c.title,
          hazard_type: c.hazard_type,
          status: c.status,
          severity: c.severity,
          location_name: c.location_name,
          reason: `Minimized hazard exposure detour selected.`
        }));
      }
    } else {
      // SHORTEST
      chosenRoute = candidateRoutes[0];
    }

    const hasIntersectedClosure = chosenRoute.confirmedClosures.length > 0;
    const origName = origin.name || `${origLat.toFixed(4)}, ${origLng.toFixed(4)}`;
    const destName = destination.name || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`;

    let explanation = "";
    if (avoidedHazards.length > 0) {
      explanation = `Detour active: Successfully circumvented ${avoidedHazards.length} confirmed closure(s) (${avoidedHazards.map(a => a.title).join(", ")}) via OpenStreetMap road network.`;
    } else if (hasIntersectedClosure) {
      explanation = `WARNING: Selected road route intersects ${chosenRoute.confirmedClosures.length} confirmed closure(s) (${chosenRoute.confirmedClosures.map(c => c.title).join(", ")}). No alternative bypass available on road graph.`;
    } else if (chosenRoute.cautions.length > 0) {
      explanation = `Route clear of confirmed closures. Traversing near ${chosenRoute.cautions.length} unverified advisory caution(s); roads remain open.`;
    } else {
      explanation = `Optimal clear road corridor calculated via OpenStreetMap real-world road graph.`;
    }

    const result = {
      route_id: `OSRM-${Date.now().toString(36).toUpperCase()}`,
      name: `${origName} → ${destName}`,
      origin: {
        id: "GEO_ORIGIN",
        name: origName,
        latitude: origLat,
        longitude: origLng
      },
      destination: {
        id: "GEO_DESTINATION",
        name: destName,
        latitude: destLat,
        longitude: destLng
      },
      coordinates: chosenRoute.coordinates,
      total_distance_meters: chosenRoute.total_distance_meters,
      total_distance_km: chosenRoute.total_distance_km,
      total_travel_time_seconds: chosenRoute.total_travel_time_seconds,
      total_travel_time_minutes: chosenRoute.total_travel_time_minutes,
      travel_time_supported: true,
      mode,
      is_reachable: true,
      has_closure_conflict: hasIntersectedClosure,
      avoided_hazards: avoidedHazards,
      intersected_closures: chosenRoute.confirmedClosures,
      corroborated_hazards: chosenRoute.corroboratedHazards,
      cautions: chosenRoute.cautions,
      route_change_explanation: explanation,
      routing_engine: "OpenStreetMap Road Network (OSRM)",
      safety_disclaimer:
        "Route conditions are dynamic and subject to ongoing weather and flood hazards. No route is guaranteed safe; field units must exercise tactical caution.",
      last_data_update: new Date().toISOString()
    };

    return {
      success: true,
      data: result
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, error: "Route calculation timed out or was aborted." };
    }
    return {
      success: false,
      error: `Network error connecting to routing service: ${err.message}`
    };
  }
}
