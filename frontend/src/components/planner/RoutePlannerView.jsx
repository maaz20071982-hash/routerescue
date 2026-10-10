import React, { useEffect, useState, useRef } from "react";
import {
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Compass,
  AlertCircle,
  ShieldAlert,
  ArrowLeftRight,
  Search,
  MapPin,
  LocateFixed,
  Loader2
} from "lucide-react";
import Badge from "../common/Badge";
import {
  calculateEmergencyRoute,
  fetchRoutingNetwork,
  fetchRoutingPresets,
  searchPlaces,
  reverseGeocode
} from "../../services/api";
import { DEMO_ROUTES } from "../../constants/demoData";

export default function RoutePlannerView({
  onInspectRouteOnMap,
  onChooseOnMap = null,
  incidents = [],
  lastSuccessfulUpdate = null,
  onRefreshData = null,
  origin = null,
  onSetOrigin = null,
  destination = null,
  onSetDestination = null
}) {
  const [presets, setPresets] = useState(DEMO_ROUTES);
  const [networkNodes, setNetworkNodes] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState(DEMO_ROUTES[0].id);

  // Input Selection Mode: "REAL_WORLD" (default) | "PRESET_CORRIDORS" | "GRAPH_NODES"
  const [inputMode, setInputMode] = useState("REAL_WORLD");

  // Form State: Intersection IDs
  const [originNodeId, setOriginNodeId] = useState(DEMO_ROUTES[0].origin_node_id || "INT_MARKET_VAN_NESS");
  const [destinationNodeId, setDestinationNodeId] = useState(DEMO_ROUTES[0].destination_node_id || "INT_MARKET_4TH");
  const [routingMode, setRoutingMode] = useState("AVOID_CONFIRMED_CLOSURES");
  const [useAStar, setUseAStar] = useState(true);

  // Real-World Address Search State
  const [originSearchState, setOriginSearch] = useState(null);
  const [originResults, setOriginResults] = useState([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const originTimeoutRef = useRef(null);

  const [destSearchState, setDestSearch] = useState(null);
  const [destResults, setDestResults] = useState([]);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const destTimeoutRef = useRef(null);

  // Local fallback for origin and destination
  const [localOrigin, setLocalOrigin] = useState(
    origin || {
      lat: 37.7753,
      lng: -122.4194,
      name: "Market St & Van Ness Ave (Civic Center)"
    }
  );
  const [localDestination, setLocalDestination] = useState(
    destination || {
      lat: 37.7835,
      lng: -122.4078,
      name: "Market St & 4th St (Downtown Medical Hub)"
    }
  );

  const effectiveOrigin = origin !== undefined && origin !== null ? origin : localOrigin;
  const effectiveDestination = destination !== undefined && destination !== null ? destination : localDestination;

  const originSearch = originSearchState !== null ? originSearchState : (effectiveOrigin?.name || "");
  const destSearch = destSearchState !== null ? destSearchState : (effectiveDestination?.name || "");

  // Browser Geolocation in Planner
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  // Calculation Results
  const [activeRoute, setActiveRoute] = useState(DEMO_ROUTES[0]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState("");

  // Load presets and network on mount
  useEffect(() => {
    async function loadData() {
      const fetchedPresets = await fetchRoutingPresets();
      if (fetchedPresets && fetchedPresets.length > 0) {
        setPresets(fetchedPresets);
      }
      const net = await fetchRoutingNetwork();
      if (net && net.nodes) {
        setNetworkNodes(net.nodes);
      }
    }
    loadData();
  }, []);

  // Handle Debounced Origin Place Search
  const handleOriginSearchChange = e => {
    const val = e.target.value;
    setOriginSearch(val);
    if (originTimeoutRef.current) clearTimeout(originTimeoutRef.current);

    if (!val || val.trim().length < 2) {
      setOriginResults([]);
      setShowOriginDropdown(false);
      setIsSearchingOrigin(false);
      return;
    }

    setIsSearchingOrigin(true);
    setShowOriginDropdown(true);

    originTimeoutRef.current = setTimeout(async () => {
      const res = await searchPlaces(val, { limit: 5 });
      if (res.success) {
        setOriginResults(res.results);
      }
      setIsSearchingOrigin(false);
    }, 400);
  };

  // Handle Debounced Destination Place Search
  const handleDestSearchChange = e => {
    const val = e.target.value;
    setDestSearch(val);
    if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current);

    if (!val || val.trim().length < 2) {
      setDestResults([]);
      setShowDestDropdown(false);
      setIsSearchingDest(false);
      return;
    }

    setIsSearchingDest(true);
    setShowDestDropdown(true);

    destTimeoutRef.current = setTimeout(async () => {
      const res = await searchPlaces(val, { limit: 5 });
      if (res.success) {
        setDestResults(res.results);
      }
      setIsSearchingDest(false);
    }, 400);
  };

  // Select Origin from search results
  const handleSelectOriginPlace = place => {
    const newOrig = {
      lat: place.lat,
      lng: place.lng,
      name: place.displayName,
      type: "search"
    };
    if (onSetOrigin) onSetOrigin(newOrig);
    setLocalOrigin(newOrig);
    setOriginSearch(place.displayName);
    setShowOriginDropdown(false);
  };

  // Select Destination from search results
  const handleSelectDestPlace = place => {
    const newDest = {
      lat: place.lat,
      lng: place.lng,
      name: place.displayName,
      type: "search"
    };
    if (onSetDestination) onSetDestination(newDest);
    setLocalDestination(newDest);
    setDestSearch(place.displayName);
    setShowDestDropdown(false);
  };

  // Use My Location for Origin
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async pos => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const geoRes = await reverseGeocode(latitude, longitude);
        const locName = geoRes.displayName || `My Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

        const newOrig = {
          lat: latitude,
          lng: longitude,
          name: locName,
          type: "gps"
        };
        if (onSetOrigin) onSetOrigin(newOrig);
        setLocalOrigin(newOrig);
        setOriginSearch(locName);
      },
      err => {
        setIsLocating(false);
        if (err.code === 1) {
          setGeoError("Location permission denied. Please enable location permissions in browser.");
        } else {
          setGeoError("Location request timed out or was unavailable. Please select on map.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Swap Origin and Destination
  const handleSwap = () => {
    const prevOrig = effectiveOrigin;
    const prevDest = effectiveDestination;
    const prevOrigSearch = originSearch;
    const prevDestSearch = destSearch;

    if (onSetOrigin && onSetDestination) {
      onSetOrigin(prevDest);
      onSetDestination(prevOrig);
    }
    setLocalOrigin(prevDest);
    setLocalDestination(prevOrig);
    setOriginSearch(prevDestSearch);
    setDestSearch(prevOrigSearch);
  };

  // Handle Preset Selection
  const handleSelectPreset = preset => {
    setSelectedPresetId(preset.id);
    if (preset.origin_node_id) setOriginNodeId(preset.origin_node_id);
    if (preset.destination_node_id) setDestinationNodeId(preset.destination_node_id);
    if (preset.default_mode) setRoutingMode(preset.default_mode);

    if (preset.coordinates) {
      setActiveRoute(preset);
      setCalculationError("");
    } else {
      handleCalculateWithPayload({
        origin_node_id: preset.origin_node_id,
        destination_node_id: preset.destination_node_id,
        mode: preset.default_mode || routingMode,
        use_a_star: useAStar
      });
    }
  };

  // Execute Route Calculation
  const handleCalculateWithPayload = async payload => {
    setIsCalculating(true);
    setCalculationError("");

    const res = await calculateEmergencyRoute(payload, incidents);

    if (res.success && res.data) {
      const origTitle =
        res.data.origin?.name || payload.origin_name || payload.origin_node_id || "Origin";
      const destTitle =
        res.data.destination?.name || payload.destination_name || payload.destination_node_id || "Destination";
      const routeData = {
        ...res.data,
        name: `${origTitle} → ${destTitle}`
      };
      setActiveRoute(routeData);
      if (!res.data.is_reachable) {
        setCalculationError(
          res.data.diagnostic_message || "Destination is unreachable under current graph/closure constraints."
        );
      }
    } else {
      setCalculationError(res.error || "Route calculation failed. Check network connectivity.");
    }
    setIsCalculating(false);
  };

  // Run calculation based on current input mode
  const handleCalculateCurrent = () => {
    if (inputMode === "REAL_WORLD" && effectiveOrigin && effectiveDestination) {
      handleCalculateWithPayload({
        origin_lat: effectiveOrigin.lat,
        origin_lng: effectiveOrigin.lng,
        origin_name: effectiveOrigin.name,
        destination_lat: effectiveDestination.lat,
        destination_lng: effectiveDestination.lng,
        destination_name: effectiveDestination.name,
        mode: routingMode,
        use_a_star: useAStar
      });
    } else {
      handleCalculateWithPayload({
        origin_node_id: originNodeId,
        destination_node_id: destinationNodeId,
        mode: routingMode,
        use_a_star: useAStar
      });
    }
  };

  return (
    <main
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 20px",
        backgroundColor: "var(--bg-app)",
        display: "flex",
        justifyContent: "center"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "920px",
          display: "flex",
          flexDirection: "column",
          gap: "20px"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy-800)" }}>
                Hazard-Aware Route Planner
              </h1>
              <Badge variant="demo" showDot={false}>REAL ROAD NETWORK &amp; A* ENGINE</Badge>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Calculate evidence-aware emergency corridors avoiding confirmed closures across real street addresses and road networks.
            </p>
          </div>

          {activeRoute && activeRoute.is_reachable && (
            <button
              onClick={() => onInspectRouteOnMap(activeRoute)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                backgroundColor: "var(--navy-800)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer"
              }}
            >
              <Navigation size={14} aria-hidden="true" />
              <span>Inspect Route on Live Map</span>
            </button>
          )}
        </div>

        {/* Backend Data Parity & Active Closures Status Card */}
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            fontSize: "12px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldAlert size={15} style={{ color: "var(--navy-800)" }} aria-hidden="true" />
              <strong style={{ color: "var(--navy-800)" }}>Unified Backend Data Source:</strong>
            </div>
            <span style={{ color: "var(--text-secondary)" }}>
              Routing synchronized with <strong>{incidents.length}</strong> hazards (
              <span style={{ color: "var(--status-critical-text)", fontWeight: 600 }}>
                {incidents.filter(i => i.status === "OFFICIALLY_CONFIRMED").length} Confirmed Closures
              </span>
              ,{" "}
              <span style={{ color: "var(--status-medium-text)", fontWeight: 600 }}>
                {incidents.filter(i => i.status === "CORROBORATED").length} Corroborated
              </span>
              ,{" "}
              <span style={{ color: "var(--status-low-text)", fontWeight: 600 }}>
                {incidents.filter(i => i.status === "UNVERIFIED").length} Unverified Cautions
              </span>
              )
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {lastSuccessfulUpdate && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Last synced:{" "}
                {lastSuccessfulUpdate instanceof Date
                  ? lastSuccessfulUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                  : "Live"}
              </span>
            )}
            {onRefreshData && (
              <button
                onClick={async () => {
                  await onRefreshData();
                  handleCalculateCurrent();
                }}
                disabled={isCalculating}
                title="Refresh incidents and recalculate route"
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                  color: "var(--navy-800)",
                  cursor: isCalculating ? "wait" : "pointer"
                }}
              >
                Sync &amp; Recalculate
              </button>
            )}
          </div>
        </div>

        {/* Route Planner Control Card */}
        <div
          style={{
            padding: "18px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}
        >
          {/* Mode Switch Tabs: Real Address Search vs Preset Corridors vs Intersections */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", gap: "4px" }}>
            <button
              onClick={() => setInputMode("REAL_WORLD")}
              style={{
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: inputMode === "REAL_WORLD" ? 700 : 500,
                color: inputMode === "REAL_WORLD" ? "var(--navy-800)" : "var(--text-muted)",
                borderBottom: inputMode === "REAL_WORLD" ? "2px solid var(--navy-800)" : "2px solid transparent",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer"
              }}
            >
              Real Places &amp; Address Search
            </button>
            <button
              onClick={() => setInputMode("PRESET_CORRIDORS")}
              style={{
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: inputMode === "PRESET_CORRIDORS" ? 700 : 500,
                color: inputMode === "PRESET_CORRIDORS" ? "var(--navy-800)" : "var(--text-muted)",
                borderBottom: inputMode === "PRESET_CORRIDORS" ? "2px solid var(--navy-800)" : "2px solid transparent",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer"
              }}
            >
              Preset Transit Corridors
            </button>
            <button
              onClick={() => setInputMode("GRAPH_NODES")}
              style={{
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: inputMode === "GRAPH_NODES" ? 700 : 500,
                color: inputMode === "GRAPH_NODES" ? "var(--navy-800)" : "var(--text-muted)",
                borderBottom: inputMode === "GRAPH_NODES" ? "2px solid var(--navy-800)" : "2px solid transparent",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer"
              }}
            >
              Intersection Graph Nodes
            </button>
          </div>

          {/* TAB 1: REAL-WORLD PLACE & ADDRESS SEARCH */}
          {inputMode === "REAL_WORLD" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "10px", alignItems: "flex-start" }}>
                {/* Origin Search */}
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--navy-800)" }}>
                      Origin Location:
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={handleUseMyLocation}
                        disabled={isLocating}
                        title="Use my current GPS location"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "3px",
                          border: "1px solid var(--border-subtle)",
                          backgroundColor: "var(--bg-surface-subtle)",
                          color: "#2563eb",
                          cursor: "pointer"
                        }}
                      >
                        {isLocating ? <Loader2 size={11} className="animate-spin" /> : <LocateFixed size={11} />}
                        <span>My Location</span>
                      </button>
                      {onChooseOnMap && (
                        <button
                          onClick={onChooseOnMap}
                          title="Click on the interactive map to select a pin"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: "3px",
                            border: "1px solid var(--border-subtle)",
                            backgroundColor: "var(--bg-surface-subtle)",
                            color: "var(--navy-800)",
                            cursor: "pointer"
                          }}
                        >
                          <MapPin size={11} />
                          <span>Choose on Map</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 8px",
                      backgroundColor: "var(--bg-surface)"
                    }}
                  >
                    <Search size={14} style={{ color: "var(--text-muted)", marginRight: "6px" }} />
                    <input
                      type="text"
                      placeholder="Search street address, place, or landmark..."
                      value={originSearch}
                      onChange={handleOriginSearchChange}
                      onFocus={() => {
                        if (originResults.length > 0) setShowOriginDropdown(true);
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        fontSize: "12px",
                        backgroundColor: "transparent"
                      }}
                    />
                    {isSearchingOrigin && <Loader2 size={13} className="animate-spin" />}
                  </div>

                  {/* Origin Dropdown Results */}
                  {showOriginDropdown && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: "#ffffff",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-lg)",
                        maxHeight: "220px",
                        overflowY: "auto",
                        zIndex: 100
                      }}
                    >
                      {originResults.length > 0 ? (
                        originResults.map(p => (
                          <div
                            key={p.id}
                            onClick={() => handleSelectOriginPlace(p)}
                            style={{
                              padding: "8px 10px",
                              fontSize: "12px",
                              borderBottom: "1px solid var(--border-subtle)",
                              cursor: "pointer"
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-surface-subtle)")}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#ffffff")}
                          >
                            <div style={{ fontWeight: 600, color: "var(--navy-800)" }}>{p.name}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{p.displayName}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "10px", fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                          No results found. Choose on map to drop a pin manually.
                        </div>
                      )}
                    </div>
                  )}

                  {effectiveOrigin && (
                    <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-muted)" }}>
                      Lat: {effectiveOrigin.lat?.toFixed(5)}, Lng: {effectiveOrigin.lng?.toFixed(5)}
                    </div>
                  )}
                </div>

                {/* Swap Button */}
                <div style={{ paddingTop: "26px" }}>
                  <button
                    onClick={handleSwap}
                    title="Swap origin and destination"
                    aria-label="Swap endpoints"
                    style={{
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                      color: "var(--navy-800)",
                      cursor: "pointer"
                    }}
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                </div>

                {/* Destination Search */}
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--navy-800)" }}>
                      Destination Location:
                    </label>
                    {onChooseOnMap && (
                      <button
                        onClick={onChooseOnMap}
                        title="Click on the interactive map to drop destination pin"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "3px",
                          border: "1px solid var(--border-subtle)",
                          backgroundColor: "var(--bg-surface-subtle)",
                          color: "var(--navy-800)",
                          cursor: "pointer"
                        }}
                      >
                        <MapPin size={11} />
                        <span>Choose on Map</span>
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 8px",
                      backgroundColor: "var(--bg-surface)"
                    }}
                  >
                    <Search size={14} style={{ color: "var(--text-muted)", marginRight: "6px" }} />
                    <input
                      type="text"
                      placeholder="Search street address, place, or landmark..."
                      value={destSearch}
                      onChange={handleDestSearchChange}
                      onFocus={() => {
                        if (destResults.length > 0) setShowDestDropdown(true);
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        fontSize: "12px",
                        backgroundColor: "transparent"
                      }}
                    />
                    {isSearchingDest && <Loader2 size={13} className="animate-spin" />}
                  </div>

                  {/* Destination Dropdown Results */}
                  {showDestDropdown && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: "#ffffff",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-lg)",
                        maxHeight: "220px",
                        overflowY: "auto",
                        zIndex: 100
                      }}
                    >
                      {destResults.length > 0 ? (
                        destResults.map(p => (
                          <div
                            key={p.id}
                            onClick={() => handleSelectDestPlace(p)}
                            style={{
                              padding: "8px 10px",
                              fontSize: "12px",
                              borderBottom: "1px solid var(--border-subtle)",
                              cursor: "pointer"
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-surface-subtle)")}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#ffffff")}
                          >
                            <div style={{ fontWeight: 600, color: "var(--navy-800)" }}>{p.name}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{p.displayName}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "10px", fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                          No results found. Choose on map to drop a pin manually.
                        </div>
                      )}
                    </div>
                  )}

                  {effectiveDestination && (
                    <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-muted)" }}>
                      Lat: {effectiveDestination.lat?.toFixed(5)}, Lng: {effectiveDestination.lng?.toFixed(5)}
                    </div>
                  )}
                </div>
              </div>

              {geoError && (
                <div style={{ fontSize: "11px", color: "#b91c1c", backgroundColor: "#fef2f2", padding: "6px 10px", borderRadius: "4px" }}>
                  {geoError}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PRESET TRANSIT CORRIDORS */}
          {inputMode === "PRESET_CORRIDORS" && (
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                Select Emergency Transit Corridor:
              </label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {presets.map(p => {
                  const isSelected = p.id === selectedPresetId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPreset(p)}
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: isSelected ? 600 : 500,
                        borderRadius: "var(--radius-md)",
                        border: isSelected ? "1.5px solid var(--navy-800)" : "1px solid var(--border-subtle)",
                        backgroundColor: isSelected ? "var(--bg-surface)" : "var(--bg-surface-subtle)",
                        color: isSelected ? "var(--navy-800)" : "var(--text-secondary)",
                        cursor: "pointer"
                      }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: GRAPH INTERSECTION NODES */}
          {inputMode === "GRAPH_NODES" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
              <div>
                <label htmlFor="origin-select" style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--navy-800)", marginBottom: "4px" }}>
                  Origin Intersection:
                </label>
                <select
                  id="origin-select"
                  value={originNodeId}
                  onChange={e => {
                    setOriginNodeId(e.target.value);
                    setSelectedPresetId("CUSTOM");
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                >
                  {networkNodes.length > 0 ? (
                    networkNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.id})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="INT_MARKET_VAN_NESS">Market St &amp; Van Ness Ave</option>
                      <option value="INT_MARKET_11TH">Market St &amp; 11th St</option>
                      <option value="INT_GEARY_VAN_NESS">Geary Blvd &amp; Van Ness Ave</option>
                      <option value="INT_CASTRO_18TH">Castro St &amp; 18th St</option>
                      <option value="INT_MISSION_11TH">Mission St &amp; 11th St</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="destination-select" style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--navy-800)", marginBottom: "4px" }}>
                  Destination Intersection:
                </label>
                <select
                  id="destination-select"
                  value={destinationNodeId}
                  onChange={e => {
                    setDestinationNodeId(e.target.value);
                    setSelectedPresetId("CUSTOM");
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                >
                  {networkNodes.length > 0 ? (
                    networkNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.id})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="INT_MARKET_4TH">Market St &amp; 4th St</option>
                      <option value="INT_GEARY_LEAVENWORTH">Geary Blvd &amp; Leavenworth St</option>
                      <option value="INT_HARRISON_6TH">Harrison St &amp; 6th St</option>
                      <option value="INT_MARKET_11TH">Market St &amp; 11th St</option>
                      <option value="INT_ISOLATED_DEPOT">Restricted Outpost (Disconnected Grid)</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Mode & Calculation Trigger */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: "5px" }}>
                Routing Strategy Mode:
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                {[
                  { id: "AVOID_CONFIRMED_CLOSURES", label: "Avoid Confirmed Closures" },
                  { id: "MINIMIZE_HAZARDS", label: "Minimize Hazard Exposure" },
                  { id: "SHORTEST", label: "Shortest Distance" }
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setRoutingMode(m.id);
                      if (inputMode === "REAL_WORLD" && effectiveOrigin && effectiveDestination) {
                        handleCalculateWithPayload({
                          origin_lat: effectiveOrigin.lat,
                          origin_lng: effectiveOrigin.lng,
                          origin_name: effectiveOrigin.name,
                          destination_lat: effectiveDestination.lat,
                          destination_lng: effectiveDestination.lng,
                          destination_name: effectiveDestination.name,
                          mode: m.id,
                          use_a_star: useAStar
                        });
                      } else {
                        handleCalculateWithPayload({
                          origin_node_id: originNodeId,
                          destination_node_id: destinationNodeId,
                          mode: m.id,
                          use_a_star: useAStar
                        });
                      }
                    }}
                    style={{
                      padding: "5px 10px",
                      fontSize: "11px",
                      fontWeight: routingMode === m.id ? 700 : 500,
                      borderRadius: "var(--radius-sm)",
                      border: routingMode === m.id ? "1px solid var(--navy-800)" : "1px solid var(--border-subtle)",
                      backgroundColor: routingMode === m.id ? "var(--navy-800)" : "var(--bg-surface)",
                      color: routingMode === m.id ? "#ffffff" : "var(--text-secondary)",
                      cursor: "pointer"
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={useAStar}
                  onChange={e => setUseAStar(e.target.checked)}
                />
                <span>A* Heuristic (vs Dijkstra)</span>
              </label>

              <button
                onClick={handleCalculateCurrent}
                disabled={isCalculating}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  backgroundColor: "var(--navy-800)",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  cursor: isCalculating ? "wait" : "pointer"
                }}
              >
                {isCalculating ? <Loader2 size={14} className="animate-spin" /> : <Compass size={14} aria-hidden="true" />}
                <span>{isCalculating ? "Calculating..." : "Calculate Route"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Calculation Error or Unreachable Warning */}
        {calculationError && (
          <div
            role="alert"
            style={{
              padding: "14px 16px",
              backgroundColor: "var(--status-critical-bg)",
              border: "1px solid var(--status-critical-border)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              color: "var(--status-critical-text)",
              fontSize: "13px"
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden="true" />
            <div>
              <strong style={{ display: "block", marginBottom: "2px" }}>Routing Warning:</strong>
              {calculationError}
            </div>
          </div>
        )}

        {/* Route Results Display Card */}
        {activeRoute && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}
          >
            {/* Top Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
              {/* Calculated Distance */}
              <div
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                  Calculated Distance
                </span>
                <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--navy-800)" }}>
                  {activeRoute.total_distance_km ? `${activeRoute.total_distance_km} km` : `${activeRoute.recommendation?.distance || "0 km"}`}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {activeRoute.total_distance_meters ? `${activeRoute.total_distance_meters} m total road geometry` : "Measured road distance"}
                </span>
              </div>

              {/* Supported Travel Time */}
              <div
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                    Transit Duration
                  </span>
                  {activeRoute.travel_time_supported ? (
                    <Badge variant="low" showDot={false}>ESTIMATED</Badge>
                  ) : (
                    <Badge variant="demo" showDot={false}>UNSUPPORTED</Badge>
                  )}
                </div>

                <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--navy-800)" }}>
                  {activeRoute.travel_time_supported && activeRoute.total_travel_time_minutes != null
                    ? `${activeRoute.total_travel_time_minutes} min`
                    : activeRoute.recommendation?.duration || "N/A"}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {activeRoute.travel_time_supported
                    ? `Transit time estimate (${activeRoute.total_travel_time_seconds || 0}s)`
                    : "Speed profile unsupported; duration omitted"}
                </span>
              </div>

              {/* Avoided Hazards Count */}
              <div
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                  Avoided Hazards
                </span>
                <span style={{ fontSize: "22px", fontWeight: 800, color: (activeRoute.avoided_hazards?.length || 0) > 0 ? "#16a34a" : "var(--text-secondary)" }}>
                  {activeRoute.avoided_hazards?.length || 0}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  Confirmed road closures circumvented
                </span>
              </div>

              {/* Routing Engine & Last Update */}
              <div
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                  Routing Engine
                </span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--navy-800)", marginTop: "4px" }}>
                  {activeRoute.routing_engine || "OpenStreetMap / Graph Engine"}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Updated: {activeRoute.last_data_update ? new Date(activeRoute.last_data_update).toLocaleTimeString() : "Live Session"}
                </span>
              </div>
            </div>

            {/* Route Change Explanation Banner */}
            <div
              style={{
                padding: "14px 16px",
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px"
              }}
            >
              <CheckCircle2 size={18} style={{ color: "#16a34a", flexShrink: 0, marginTop: "2px" }} aria-hidden="true" />
              <div>
                <strong style={{ display: "block", color: "#166534", fontSize: "13px", marginBottom: "2px" }}>
                  Why This Route Was Selected:
                </strong>
                <p style={{ margin: 0, fontSize: "12px", color: "#14532d", lineHeight: "1.4" }}>
                  {activeRoute.route_change_explanation || activeRoute.recommendation?.notes || "Optimal route calculated across road network."}
                </p>
              </div>
            </div>

            {/* Visible Caution Alerts for Nearby Unverified Reports */}
            {activeRoute.cautions && activeRoute.cautions.length > 0 && (
              <div
                style={{
                  padding: "12px 14px",
                  backgroundColor: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#b45309", fontWeight: 700, fontSize: "12px" }}>
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>Visible Advisory Cautions ({activeRoute.cautions.length}):</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {activeRoute.cautions.map((c, idx) => (
                    <div key={idx} style={{ fontSize: "11px", color: "#92400e", display: "flex", alignItems: "baseline", gap: "6px" }}>
                      <span style={{ fontWeight: 600 }}>&bull;</span>
                      <span>
                        <strong>{c.location_name || c.title}:</strong> {c.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Avoided Hazards Detailed Breakdown */}
            {activeRoute.avoided_hazards && activeRoute.avoided_hazards.length > 0 && (
              <div
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--navy-800)" }}>
                    Bypassed Confirmed Closures ({activeRoute.avoided_hazards.length})
                  </h3>
                  <Badge variant="low">STRICT EXCLUSION</Badge>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {activeRoute.avoided_hazards.map(h => (
                    <div
                      key={h.incident_id}
                      style={{
                        padding: "10px",
                        backgroundColor: "var(--bg-surface-subtle)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "10px"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--navy-800)", marginBottom: "2px" }}>
                          {h.title} ({h.incident_id})
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          {h.reason}
                        </div>
                      </div>
                      <Badge variant="critical">CONFIRMED CLOSURE</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Epistemic Safety Disclaimer */}
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: "var(--bg-surface)",
                border: "1px dashed var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                fontSize: "11px",
                color: "var(--text-muted)",
                lineHeight: "1.4"
              }}
            >
              <strong>Operational Epistemic Safety Notice:</strong>{" "}
              {activeRoute.safety_disclaimer ||
                "Route conditions are dynamic and subject to ongoing flood conditions. No corridor is guaranteed safe; field responders must exercise tactical discretion."}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
