import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import {
  Maximize2,
  Eye,
  EyeOff,
  ShieldCheck,
  Clock,
  Navigation,
  X,
  MapPin,
  LocateFixed,
  Search,
  ArrowLeftRight,
  Loader2,
  AlertCircle
} from "lucide-react";
import { STATUS_CONFIG, HAZARD_CONFIG } from "../../constants/demoData";
import { searchPlaces, reverseGeocode } from "../../services/geocoding";
import { calculateRealRoadRoute } from "../../services/routing";

// Helper function to safely escape strings for innerHTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function IncidentMap({
  incidents = [],
  selectedIncident = null,
  onSelectIncident,
  activeRoute = null,
  onClearRoute = null,
  onInspectRoute = null,
  statusFilter = "all",
  onStatusFilterChange = null,
  isTabActive = true,
  origin = null,
  onSetOrigin = null,
  destination = null,
  onSetDestination = null
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const selectionLayerRef = useRef(null);
  const gpsLayerRef = useRef(null);

  // Filter & Visibility States
  const [showLegend, setShowLegend] = useState(true);
  const [internalStatusFilter, setInternalStatusFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all"); // "all" | "fresh" | "stale"

  // Feature 1: Interactive Pin Selection State
  const [selectedPin, setSelectedPin] = useState(null); // { lat, lng, displayName, isResolving }
  const selectedPinRef = useRef(null);

  useEffect(() => {
    selectedPinRef.current = selectedPin;
  }, [selectedPin]);

  // Feature 2: Browser Geolocation State
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [_userLocation, setUserLocation] = useState(null); // { lat, lng, accuracy }

  // Feature 3: Real Place & Address Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchAbortRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Local Origin/Destination state fallback if not managed externally
  const [localOrigin, setLocalOrigin] = useState(null);
  const [localDestination, setLocalDestination] = useState(null);
  const [localActiveRoute, setLocalActiveRoute] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeCalcError, setRouteCalcError] = useState(null);
  const [routingMode] = useState("AVOID_CONFIRMED_CLOSURES");

  const effectiveOrigin = origin !== undefined ? origin : localOrigin;
  const effectiveDestination = destination !== undefined ? destination : localDestination;
  const effectiveRoute = activeRoute !== undefined ? activeRoute : localActiveRoute;

  const currentStatusFilter = onStatusFilterChange ? statusFilter : internalStatusFilter;
  const handleFilterChange = val => {
    if (onStatusFilterChange) {
      onStatusFilterChange(val);
    } else {
      setInternalStatusFilter(val);
    }
  };

  // Keep Leaflet map sized properly when tab becomes active
  useEffect(() => {
    if (isTabActive && mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 50);
    }
  }, [isTabActive]);

  // Handle setting origin
  const handleSetOrigin = useCallback(
    newOrigin => {
      if (onSetOrigin) {
        onSetOrigin(newOrigin);
      } else {
        setLocalOrigin(newOrigin);
      }
      setSelectedPin(null);
    },
    [onSetOrigin]
  );

  // Handle setting destination
  const handleSetDestination = useCallback(
    newDest => {
      if (onSetDestination) {
        onSetDestination(newDest);
      } else {
        setLocalDestination(newDest);
      }
      setSelectedPin(null);
    },
    [onSetDestination]
  );

  // Swap Origin and Destination
  const handleSwapEndpoints = useCallback(() => {
    const prevOrig = effectiveOrigin;
    const prevDest = effectiveDestination;
    if (onSetOrigin && onSetDestination) {
      onSetOrigin(prevDest);
      onSetDestination(prevOrig);
    } else {
      setLocalOrigin(prevDest);
      setLocalDestination(prevOrig);
    }
  }, [effectiveOrigin, effectiveDestination, onSetOrigin, onSetDestination]);

  // Calculate Real Road Route
  const handleFindRoute = useCallback(
    async (orig = effectiveOrigin, dest = effectiveDestination, mode = routingMode) => {
      if (!orig || !dest) return;
      setIsCalculatingRoute(true);
      setRouteCalcError(null);

      const res = await calculateRealRoadRoute({
        origin: orig,
        destination: dest,
        mode,
        incidents
      });

      if (res.success && res.data) {
        if (onInspectRoute) {
          onInspectRoute(res.data);
        } else {
          setLocalActiveRoute(res.data);
        }
      } else {
        setRouteCalcError(res.error || "Failed to calculate road route.");
      }
      setIsCalculatingRoute(false);
    },
    [effectiveOrigin, effectiveDestination, routingMode, incidents, onInspectRoute]
  );

  // ---------------------------------------------------------------------------
  // Leaflet Map Initialization (Stable across React renders)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Default center around San Francisco coordinate cluster
    const defaultCenter = [37.7749, -122.4194];
    const defaultZoom = 13;

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: false,
      attributionControl: true
    });

    // Standard OpenStreetMap Tile Layer with visible attribution
    const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
      minZoom: 3
    });
    osmLayer.addTo(map);

    // Zoom control at top-right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Separate feature group layers
    const markersGroup = L.featureGroup().addTo(map);
    const routeGroup = L.featureGroup().addTo(map);
    const selectionGroup = L.featureGroup().addTo(map);
    const gpsGroup = L.featureGroup().addTo(map);

    markersLayerRef.current = markersGroup;
    routeLayerRef.current = routeGroup;
    selectionLayerRef.current = selectionGroup;
    gpsLayerRef.current = gpsGroup;
    mapInstanceRef.current = map;

    // Feature 1: Click anywhere on map to drop/move pin
    // Note: Leaflet's 'click' does NOT fire when panning/zooming
    map.on("click", async e => {
      const { lat, lng } = e.latlng;
      const initialPin = {
        lat,
        lng,
        displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        isResolving: true
      };
      setSelectedPin(initialPin);

      // Perform reverse geocoding asynchronously
      const geoRes = await reverseGeocode(lat, lng);
      setSelectedPin(prev => {
        if (!prev || Math.abs(prev.lat - lat) > 0.0001 || Math.abs(prev.lng - lng) > 0.0001) {
          return prev; // Pin moved in the meantime
        }
        return {
          ...prev,
          displayName: geoRes.displayName || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          fullAddress: geoRes.fullDisplayName,
          isResolving: false
        };
      });
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Feature 1: Render Selection Pins & Dropped Pin on Map
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = selectionLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Render Confirmed Origin Marker (Green)
    if (effectiveOrigin) {
      const oLat = parseFloat(effectiveOrigin.lat ?? effectiveOrigin.latitude);
      const oLng = parseFloat(effectiveOrigin.lng ?? effectiveOrigin.longitude);
      if (!isNaN(oLat) && !isNaN(oLng)) {
        const originIcon = L.divIcon({
          className: "rr-pin-icon",
          html: `
            <div style="
              width: 32px;
              height: 32px;
              background-color: #16a34a;
              color: #ffffff;
              border: 3px solid #ffffff;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            ">
              <div style="transform: rotate(45deg); font-weight: 800; font-size: 13px;">A</div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const oMarker = L.marker([oLat, oLng], {
          icon: originIcon,
          draggable: true,
          title: `Route Origin: ${effectiveOrigin.name || "Start Point"}`
        }).addTo(group);

        oMarker.bindTooltip(`Origin: ${effectiveOrigin.name || "Start Point"} (Drag to adjust)`, {
          direction: "top"
        });

        oMarker.on("dragend", async ev => {
          const pos = ev.target.getLatLng();
          const geoRes = await reverseGeocode(pos.lat, pos.lng);
          const updated = {
            ...effectiveOrigin,
            lat: pos.lat,
            lng: pos.lng,
            name: geoRes.displayName || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`
          };
          handleSetOrigin(updated);
          if (effectiveDestination) {
            handleFindRoute(updated, effectiveDestination);
          }
        });
      }
    }

    // 2. Render Confirmed Destination Marker (Navy)
    if (effectiveDestination) {
      const dLat = parseFloat(effectiveDestination.lat ?? effectiveDestination.latitude);
      const dLng = parseFloat(effectiveDestination.lng ?? effectiveDestination.longitude);
      if (!isNaN(dLat) && !isNaN(dLng)) {
        const destIcon = L.divIcon({
          className: "rr-pin-icon",
          html: `
            <div style="
              width: 32px;
              height: 32px;
              background-color: #0f2942;
              color: #ffffff;
              border: 3px solid #ffffff;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            ">
              <div style="transform: rotate(45deg); font-weight: 800; font-size: 13px;">B</div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const dMarker = L.marker([dLat, dLng], {
          icon: destIcon,
          draggable: true,
          title: `Route Destination: ${effectiveDestination.name || "End Point"}`
        }).addTo(group);

        dMarker.bindTooltip(`Destination: ${effectiveDestination.name || "End Point"} (Drag to adjust)`, {
          direction: "top"
        });

        dMarker.on("dragend", async ev => {
          const pos = ev.target.getLatLng();
          const geoRes = await reverseGeocode(pos.lat, pos.lng);
          const updated = {
            ...effectiveDestination,
            lat: pos.lat,
            lng: pos.lng,
            name: geoRes.displayName || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`
          };
          handleSetDestination(updated);
          if (effectiveOrigin) {
            handleFindRoute(effectiveOrigin, updated);
          }
        });
      }
    }

    // 3. Render Draggable Selected Pin (Amber/Orange)
    if (selectedPin) {
      const pinIcon = L.divIcon({
        className: "rr-pin-icon",
        html: `
          <div style="
            width: 34px;
            height: 34px;
            background-color: #ea580c;
            color: #ffffff;
            border: 3px solid #ffffff;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(234, 88, 12, 0.4);
          ">
            <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 14px;">📍</span>
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });

      const pinMarker = L.marker([selectedPin.lat, selectedPin.lng], {
        icon: pinIcon,
        draggable: true,
        title: "Selected Location Pin (Drag to refine position)"
      }).addTo(group);

      // Popup content with reverse geocoding and Origin/Destination actions
      const popupDiv = document.createElement("div");
      popupDiv.style.minWidth = "220px";
      popupDiv.style.maxWidth = "260px";
      popupDiv.style.padding = "2px";

      popupDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px;">
          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">Selected Location</span>
          <span style="font-size: 10px; padding: 1px 5px; background: #ffedd5; color: #9a3412; border-radius: 3px; font-weight: 600;">Draggable</span>
        </div>
        <div style="font-size: 11px; color: #334155; margin-bottom: 3px; line-height: 1.3;">
          <strong>Address:</strong> <span id="pin-address-text">${escapeHtml(selectedPin.isResolving ? "Resolving address..." : selectedPin.displayName)}</span>
        </div>
        <div style="font-size: 10px; color: #64748b; font-family: monospace; margin-bottom: 8px;">
          ${selectedPin.lat.toFixed(5)}, ${selectedPin.lng.toFixed(5)}
        </div>
        <div style="display: flex; gap: 5px; margin-bottom: 4px;">
          <button id="pin-set-dest-btn" style="
            flex: 1;
            padding: 5px 8px;
            font-size: 11px;
            font-weight: 600;
            background: #0f2942;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">
            Set Destination
          </button>
          <button id="pin-set-orig-btn" style="
            flex: 1;
            padding: 5px 8px;
            font-size: 11px;
            font-weight: 600;
            background: #16a34a;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">
            Set Origin
          </button>
        </div>
        <div style="text-align: center;">
          <button id="pin-clear-btn" style="
            background: none;
            border: none;
            color: #64748b;
            font-size: 10px;
            cursor: pointer;
            text-decoration: underline;
          ">
            Remove Pin
          </button>
        </div>
      `;

      pinMarker.bindPopup(popupDiv).openPopup();

      pinMarker.on("popupopen", () => {
        const destBtn = document.getElementById("pin-set-dest-btn");
        const origBtn = document.getElementById("pin-set-orig-btn");
        const clearBtn = document.getElementById("pin-clear-btn");

        if (destBtn) {
          destBtn.onclick = () => {
            const current = selectedPinRef.current || selectedPin;
            handleSetDestination({
              lat: current.lat,
              lng: current.lng,
              name: current.displayName || `${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}`,
              type: "pin"
            });
          };
        }
        if (origBtn) {
          origBtn.onclick = () => {
            const current = selectedPinRef.current || selectedPin;
            handleSetOrigin({
              lat: current.lat,
              lng: current.lng,
              name: current.displayName || `${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}`,
              type: "pin"
            });
          };
        }
        if (clearBtn) {
          clearBtn.onclick = () => {
            setSelectedPin(null);
          };
        }
      });

      // Update coordinates after marker drag
      pinMarker.on("dragend", async ev => {
        const pos = ev.target.getLatLng();
        setSelectedPin({
          lat: pos.lat,
          lng: pos.lng,
          displayName: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
          isResolving: true
        });

        const geoRes = await reverseGeocode(pos.lat, pos.lng);
        setSelectedPin({
          lat: pos.lat,
          lng: pos.lng,
          displayName: geoRes.displayName || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
          fullAddress: geoRes.fullDisplayName,
          isResolving: false
        });
      });
    }
  }, [selectedPin, effectiveOrigin, effectiveDestination, handleSetOrigin, handleSetDestination, handleFindRoute]);

  // ---------------------------------------------------------------------------
  // Feature 2: Browser Geolocation Handler
  // ---------------------------------------------------------------------------
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async position => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude, accuracy });

        const map = mapInstanceRef.current;
        const gpsGroup = gpsLayerRef.current;

        if (map && gpsGroup) {
          gpsGroup.clearLayers();

          // Render accuracy circle (up to 1km radius max visual)
          if (accuracy && accuracy > 0) {
            L.circle([latitude, longitude], {
              radius: Math.min(accuracy, 1200),
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.12,
              weight: 1.5,
              interactive: false
            }).addTo(gpsGroup);
          }

          // Pulsating GPS marker
          const gpsIcon = L.divIcon({
            className: "rr-gps-marker-container",
            html: `<div class="rr-gps-marker" title="Current Location (±${Math.round(accuracy || 0)}m)"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });

          const gpsMarker = L.marker([latitude, longitude], {
            icon: gpsIcon,
            title: "Your Detected Location"
          }).addTo(gpsGroup);

          gpsMarker.bindTooltip(`My Location (±${Math.round(accuracy || 0)}m)`, { direction: "top" });

          // Smoothly pan & zoom to detected location without zooming excessively in/out
          map.setView([latitude, longitude], Math.max(map.getZoom(), 14));
        }

        // Reverse geocode to get readable address for origin prompt
        const geoRes = await reverseGeocode(latitude, longitude);
        const myLocName = geoRes.displayName || `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

        // Automatically offer to set as Origin
        handleSetOrigin({
          lat: latitude,
          lng: longitude,
          name: myLocName,
          type: "gps"
        });
      },
      error => {
        setIsLocating(false);
        let errorMsg = "Unable to retrieve your location.";
        if (error.code === 1) {
          errorMsg = "Location permission denied. Please allow location access in your browser or click on the map to set your location.";
        } else if (error.code === 2) {
          errorMsg = "Location information is unavailable. Please check your network or GPS connection.";
        } else if (error.code === 3) {
          errorMsg = "Location request timed out. Please try again or select your location on the map.";
        }
        setLocationError(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  }, [handleSetOrigin]);

  // ---------------------------------------------------------------------------
  // Feature 3: Real Place & Address Search Debounced Handler
  // ---------------------------------------------------------------------------
  const handleSearchChange = e => {
    const query = e.target.value;
    setSearchQuery(query);
    setSearchError(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowSearchDropdown(true);

    searchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;

      const res = await searchPlaces(query, {
        signal: controller.signal,
        limit: 5
      });

      if (res.success) {
        setSearchResults(res.results);
        setIsSearching(false);
      } else if (res.error !== "aborted") {
        setSearchError(res.error || "Search failed.");
        setIsSearching(false);
      }
    }, 450);
  };

  const handleSelectSearchResult = place => {
    setSearchQuery(place.name || place.displayName);
    setShowSearchDropdown(false);
    setSearchResults([]);

    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo([place.lat, place.lng], 15, { duration: 1.0 });
    }

    // Set pin at searched location
    setSelectedPin({
      lat: place.lat,
      lng: place.lng,
      displayName: place.displayName,
      isResolving: false
    });
  };

  // ---------------------------------------------------------------------------
  // Update Incident Markers (Preserve status, freshness, popup, evidence details)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    const filtered = incidents.filter(inc => {
      if (currentStatusFilter !== "all") {
        const incStatus = (inc.status || "UNVERIFIED").toUpperCase();
        if (incStatus !== currentStatusFilter.toUpperCase()) return false;
      }
      if (freshnessFilter === "fresh" && inc.is_stale) return false;
      if (freshnessFilter === "stale" && !inc.is_stale) return false;
      return true;
    });

    filtered.forEach(inc => {
      const lat = parseFloat(inc.latitude ?? inc.lat);
      const lng = parseFloat(inc.longitude ?? inc.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const isSelected = selectedIncident?.id === inc.id;
      const statusKey = (inc.status || "UNVERIFIED").toUpperCase();
      const statusConf = STATUS_CONFIG[statusKey] || STATUS_CONFIG.UNVERIFIED;
      const statusColor = statusConf.color;

      const hazardConf = HAZARD_CONFIG[inc.hazard_type || inc.type] || HAZARD_CONFIG.hazard;
      const hazardLabel = hazardConf.label;

      const isStale = !!inc.is_stale;
      const hasDuplicates = inc.potential_duplicates && inc.potential_duplicates.length > 0;
      const hasConflicts = inc.conflicting_reports && inc.conflicting_reports.length > 0;

      const markerHtml = `
        <div class="rr-marker ${isSelected ? "active" : ""}" style="
          width: ${isSelected ? "36px" : "30px"};
          height: ${isSelected ? "36px" : "30px"};
          background-color: #ffffff;
          border: 3px ${isStale ? "dashed" : "solid"} ${statusColor};
          box-shadow: ${isSelected ? `0 0 0 5px ${statusColor}44, 0 4px 10px rgba(0,0,0,0.25)` : "0 2px 6px rgba(0,0,0,0.18)"};
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          position: relative;
          transition: transform 0.15s ease;
        ">
          <div style="
            width: ${isSelected ? "14px" : "10px"};
            height: ${isSelected ? "14px" : "10px"};
            border-radius: 50%;
            background-color: ${statusColor};
          "></div>
          ${hasDuplicates ? `
            <div style="
              position: absolute;
              top: -3px;
              right: -3px;
              width: 9px;
              height: 9px;
              border-radius: 50%;
              background-color: #dc2626;
              border: 1.5px solid #ffffff;
            " title="Potential duplicate flagged"></div>
          ` : ""}
        </div>
      `;

      const customIcon = L.divIcon({
        className: "custom-rr-icon",
        html: markerHtml,
        iconSize: [isSelected ? 36 : 30, isSelected ? 36 : 30],
        iconAnchor: [isSelected ? 18 : 15, isSelected ? 18 : 15]
      });

      const marker = L.marker([lat, lng], {
        icon: customIcon,
        title: `${inc.title} (${statusKey})${isStale ? " [STALE]" : ""}`,
        keyboard: true
      });

      const popupWrapper = document.createElement("div");
      popupWrapper.style.minWidth = "250px";
      popupWrapper.style.maxWidth = "290px";
      popupWrapper.style.padding = "2px";

      const locName = escapeHtml(inc.location_name || inc.locationName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      const srcText = escapeHtml(inc.source || "DEMO DATA");
      const pubTimeText = escapeHtml(inc.published_at || inc.reported_at || inc.reportedAt || "Recent");
      const ingTimeText = escapeHtml(inc.ingested_at || inc.reported_at || inc.reportedAt || "Recent");
      const titleText = escapeHtml(inc.title || "Incident");
      const sanitizedUrl = inc.source_url && (inc.source_url.startsWith("http://") || inc.source_url.startsWith("https://"))
        ? escapeHtml(inc.source_url)
        : null;

      const independentCount = inc.evidence_summary?.independent_sources_count ?? (inc.sources_detail ? inc.sources_detail.filter(s => !s.is_repost).length : 1);
      const isOfficial = inc.evidence_summary?.has_official_source ?? (inc.sources_detail ? inc.sources_detail.some(s => s.is_official) : false);

      popupWrapper.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="
              font-size: 10px;
              font-weight: 700;
              padding: 2px 6px;
              border-radius: 4px;
              background: ${statusConf.bg};
              color: ${statusConf.text};
              border: 1px solid ${statusConf.border};
              text-transform: uppercase;
            ">
              ${escapeHtml(statusKey.replace("_", " "))}
            </span>
            ${isStale ? `
              <span style="
                font-size: 9px;
                font-weight: 700;
                padding: 1px 5px;
                border-radius: 3px;
                background: #fffbeb;
                color: #b45309;
                border: 1px solid #fde68a;
              " title="Report age exceeds freshness limit">
                STALE (>6h)
              </span>
            ` : `
              <span style="
                font-size: 9px;
                font-weight: 600;
                padding: 1px 5px;
                border-radius: 3px;
                background: #f0fdf4;
                color: #166534;
                border: 1px solid #bbf7d0;
              ">
                FRESH
              </span>
            `}
          </div>
          <span style="font-size: 11px; font-weight: 700; color: #64748b;">
            ${escapeHtml(inc.id)}
          </span>
        </div>

        ${hasDuplicates ? `
          <div style="
            font-size: 10px;
            font-weight: 600;
            padding: 3px 6px;
            background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fecaca;
            border-radius: 4px;
            margin-bottom: 6px;
          ">
            ⚠️ ${inc.potential_duplicates.length} duplicate flag(s) &bull; Preserved separately
          </div>
        ` : ""}

        ${hasConflicts ? `
          <div style="
            font-size: 10px;
            font-weight: 600;
            padding: 3px 6px;
            background: #fff7ed;
            color: #9a3412;
            border: 1px solid #fed7aa;
            border-radius: 4px;
            margin-bottom: 6px;
          ">
            ⚠️ Conflicting report detected nearby
          </div>
        ` : ""}

        <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 6px; line-height: 1.3;">
          ${titleText}
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #334155; margin-bottom: 10px;">
          <div>
            <strong style="color: #64748b;">Hazard Type:</strong> ${escapeHtml(hazardLabel)}
          </div>
          <div>
            <strong style="color: #64748b;">Location:</strong> ${locName}
          </div>
          <div>
            <strong style="color: #64748b;">Evidence:</strong>
            <span style="font-weight: 600;">
              ${independentCount} independent source(s)
              ${isOfficial ? " &bull; <span style='color: #059669;'>Official Agency</span>" : ""}
            </span>
          </div>
          <div>
            <strong style="color: #64748b;">Source URL / ID:</strong>
            ${sanitizedUrl ? `<a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer" style="color: #0369a1; text-decoration: underline; margin-left: 3px;">External Bulletin &rarr;</a>` : srcText}
          </div>
          <div>
            <strong style="color: #64748b;">Published:</strong> ${pubTimeText}
          </div>
          <div>
            <strong style="color: #64748b;">Ingested:</strong> ${ingTimeText}
          </div>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; gap: 4px;">
          <button id="map-set-hazard-dest-${inc.id}" style="
            font-size: 10px;
            font-weight: 600;
            background: #f1f5f9;
            color: #0f2942;
            border: 1px solid #cbd5e1;
            padding: 4px 6px;
            border-radius: 4px;
            cursor: pointer;
          ">
            Route Destination
          </button>
          <button id="map-inspect-${inc.id}" style="
            font-size: 11px;
            font-weight: 600;
            background: #0f2942;
            color: #ffffff;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
          ">
            Evidence & Details &rarr;
          </button>
        </div>
      `;

      marker.bindPopup(popupWrapper);

      marker.on("popupopen", () => {
        const inspectBtn = document.getElementById(`map-inspect-${inc.id}`);
        if (inspectBtn) {
          inspectBtn.onclick = () => {
            if (onSelectIncident) onSelectIncident(inc);
          };
        }
        const setDestBtn = document.getElementById(`map-set-hazard-dest-${inc.id}`);
        if (setDestBtn) {
          setDestBtn.onclick = () => {
            handleSetDestination({
              lat,
              lng,
              name: inc.title || locName,
              type: "hazard"
            });
            marker.closePopup();
          };
        }
      });

      marker.on("click", e => {
        L.DomEvent.stopPropagation(e);
        if (onSelectIncident) onSelectIncident(inc);
      });

      marker.addTo(markersGroup);
    });

    if (selectedIncident) {
      const sLat = parseFloat(selectedIncident.latitude ?? selectedIncident.lat);
      const sLng = parseFloat(selectedIncident.longitude ?? selectedIncident.lng);
      if (!isNaN(sLat) && !isNaN(sLng)) {
        map.flyTo([sLat, sLng], 14.5, { duration: 0.8 });
      }
    }
  }, [incidents, selectedIncident, currentStatusFilter, freshnessFilter, onSelectIncident, handleSetDestination]);

  // ---------------------------------------------------------------------------
  // Update Route Polyline Geometry
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

    const coords = effectiveRoute?.coordinates || effectiveRoute?.recommendation?.coordinates;
    if (coords && coords.length > 0) {
      const hasConflict = !!effectiveRoute.has_closure_conflict;
      const polylineColor = hasConflict ? "#dc2626" : "#0284c7";

      const polyline = L.polyline(coords, {
        color: polylineColor,
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(routeGroup);

      const distText = effectiveRoute.total_distance_km
        ? `${effectiveRoute.total_distance_km} km`
        : effectiveRoute.recommendation?.distance || "Calculated path";

      const timeText =
        effectiveRoute.travel_time_supported && effectiveRoute.total_travel_time_minutes != null
          ? `${effectiveRoute.total_travel_time_minutes} min`
          : effectiveRoute.recommendation?.duration || "Unsupported";

      const avoidedCount = effectiveRoute.avoided_hazards?.length || 0;
      const explanationText = escapeHtml(
        effectiveRoute.route_change_explanation ||
          effectiveRoute.recommendation?.notes ||
          "Optimal corridor calculated across road network."
      );
      const routeTitle = escapeHtml(effectiveRoute.name || "Emergency Calculated Route");
      const modeText = escapeHtml((effectiveRoute.mode || "AVOID_CONFIRMED_CLOSURES").replace("_", " "));

      polyline.bindPopup(`
        <div style="font-size: 12px; min-width: 220px; max-width: 280px; padding: 2px;">
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
            ${routeTitle}
          </div>
          <div style="display: flex; gap: 4px; margin-bottom: 8px;">
            <span style="font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">
              ${modeText}
            </span>
            ${avoidedCount > 0 ? `
              <span style="font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;">
                ${avoidedCount} Avoided Hazard(s)
              </span>
            ` : ""}
          </div>

          <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #334155; margin-bottom: 8px;">
            <div><strong style="color: #64748b;">Calculated Distance:</strong> ${distText}</div>
            <div>
              <strong style="color: #64748b;">Travel Time:</strong> ${timeText}
            </div>
          </div>

          <div style="font-size: 11px; color: #15803d; background: #f0fdf4; padding: 6px; border-radius: 4px; border: 1px solid #bbf7d0; margin-bottom: 6px; line-height: 1.3;">
            <strong>Selection Rationale:</strong> ${explanationText}
          </div>

          <div style="font-size: 9px; color: #64748b; line-height: 1.2;">
            <em>Safety Notice: Conditions are dynamic; no route is guaranteed safe.</em>
          </div>
        </div>
      `);

      map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    }
  }, [effectiveRoute]);

  const handleResetBounds = () => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (map && markersGroup && markersGroup.getLayers().length > 0) {
      map.fitBounds(markersGroup.getBounds(), { padding: [50, 50] });
    } else if (map) {
      map.setView([37.7749, -122.4194], 13);
    }
  };

  const counts = {
    all: incidents.length,
    UNVERIFIED: incidents.filter(i => (i.status || "").toUpperCase() === "UNVERIFIED").length,
    CORROBORATED: incidents.filter(i => (i.status || "").toUpperCase() === "CORROBORATED").length,
    OFFICIALLY_CONFIRMED: incidents.filter(i => (i.status || "").toUpperCase() === "OFFICIALLY_CONFIRMED").length,
    RESOLVED: incidents.filter(i => (i.status || "").toUpperCase() === "RESOLVED").length,
    stale: incidents.filter(i => !!i.is_stale).length
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* Map DOM Element with OpenStreetMap */}
      <div
        ref={mapContainerRef}
        role="region"
        aria-label="Interactive RouteRescue Incident Map (OpenStreetMap)"
        style={{ width: "100%", height: "100%", outline: "none" }}
      />

      {/* TOP FLOATING CONTROLS: Search Place & Geolocation Toolbar */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          right: "12px",
          zIndex: 400,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "none"
        }}
      >
        {/* Row 1: Real Address Search Box & "Use My Location" Quick Action */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            maxWidth: "600px",
            width: "100%",
            pointerEvents: "auto"
          }}
        >
          {/* Address Search Bar */}
          <div style={{ position: "relative", flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "rgba(255, 255, 255, 0.98)",
                backdropFilter: "blur(4px)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-md)",
                padding: "2px 8px"
              }}
            >
              <Search size={15} style={{ color: "var(--text-muted)", marginRight: "6px" }} />
              <input
                type="text"
                placeholder="Search real address, street, or landmark..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                aria-label="Search real place or street address"
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  padding: "6px 2px",
                  fontSize: "12px",
                  backgroundColor: "transparent",
                  color: "var(--text-main)"
                }}
              />
              {isSearching && <Loader2 size={14} className="animate-spin" style={{ color: "var(--navy-800)" }} />}
              {searchQuery && !isSearching && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setShowSearchDropdown(false);
                  }}
                  title="Clear search"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    color: "var(--text-muted)"
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Autocomplete Search Dropdown */}
            {showSearchDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  backgroundColor: "#ffffff",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  maxHeight: "240px",
                  overflowY: "auto",
                  zIndex: 500
                }}
              >
                {searchResults.length > 0 ? (
                  searchResults.map(place => (
                    <div
                      key={place.id}
                      onClick={() => handleSelectSearchResult(place)}
                      style={{
                        padding: "8px 10px",
                        fontSize: "12px",
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "6px"
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-surface-subtle)")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#ffffff")}
                    >
                      <MapPin size={13} style={{ color: "#ea580c", marginTop: "2px", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--navy-800)" }}>{place.name}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.2" }}>
                          {place.displayName}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "12px", fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                    {searchError || "No matches found. Click anywhere on the map to place a pin manually."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* "Use My Location" Button */}
          <button
            onClick={handleUseMyLocation}
            disabled={isLocating}
            title="Detect your current location (requires permission)"
            aria-label="Use My Location"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              backgroundColor: "rgba(255, 255, 255, 0.98)",
              backdropFilter: "blur(4px)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--navy-800)",
              cursor: isLocating ? "wait" : "pointer",
              whiteSpace: "nowrap"
            }}
          >
            {isLocating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <LocateFixed size={14} style={{ color: "#2563eb" }} />
            )}
            <span>{isLocating ? "Locating..." : "Use My Location"}</span>
          </button>
        </div>

        {/* Location Error Toast Notice */}
        {locationError && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "8px 12px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "var(--radius-md)",
              color: "#991b1b",
              fontSize: "12px",
              maxWidth: "600px",
              boxShadow: "var(--shadow-md)",
              pointerEvents: "auto"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <AlertCircle size={15} />
              <span>{locationError}</span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={handleUseMyLocation}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  backgroundColor: "#ffffff",
                  border: "1px solid #fca5a5",
                  color: "#991b1b",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Retry
              </button>
              <button
                onClick={() => setLocationError(null)}
                style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Row 2: Selected Origin & Destination Status Pills & Quick Route Finding */}
        {(effectiveOrigin || effectiveDestination || selectedPin) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
              backgroundColor: "rgba(255, 255, 255, 0.98)",
              backdropFilter: "blur(4px)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              padding: "6px 10px",
              maxWidth: "760px",
              pointerEvents: "auto"
            }}
          >
            {/* Origin Pill */}
            {effectiveOrigin ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 8px",
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "11px",
                  color: "#166534"
                }}
              >
                <span style={{ fontWeight: 700 }}>Origin:</span>
                <span style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {effectiveOrigin.name}
                </span>
                <button
                  onClick={() => handleSetOrigin(null)}
                  title="Remove origin"
                  style={{ background: "none", border: "none", color: "#166534", cursor: "pointer", padding: "1px" }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Origin: Not set</span>
            )}

            {/* Swap Button */}
            {effectiveOrigin && effectiveDestination && (
              <button
                onClick={handleSwapEndpoints}
                title="Swap origin and destination"
                aria-label="Swap origin and destination"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--navy-800)",
                  cursor: "pointer"
                }}
              >
                <ArrowLeftRight size={12} />
              </button>
            )}

            {/* Destination Pill */}
            {effectiveDestination ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 8px",
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "11px",
                  color: "#1e40af"
                }}
              >
                <span style={{ fontWeight: 700 }}>Dest:</span>
                <span style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {effectiveDestination.name}
                </span>
                <button
                  onClick={() => handleSetDestination(null)}
                  title="Remove destination"
                  style={{ background: "none", border: "none", color: "#1e40af", cursor: "pointer", padding: "1px" }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Dest: Not set</span>
            )}

            {/* Dropped Pin Quick Action Pill */}
            {selectedPin && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 6px",
                  backgroundColor: "#fff7ed",
                  border: "1px solid #ffedd5",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "11px",
                  color: "#9a3412"
                }}
              >
                <span>Pin: {selectedPin.displayName?.slice(0, 20)}...</span>
                <button
                  onClick={() =>
                    handleSetOrigin({
                      lat: selectedPin.lat,
                      lng: selectedPin.lng,
                      name: selectedPin.displayName,
                      type: "pin"
                    })
                  }
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    backgroundColor: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: "3px",
                    padding: "2px 5px",
                    cursor: "pointer"
                  }}
                >
                  &rarr; Origin
                </button>
                <button
                  onClick={() =>
                    handleSetDestination({
                      lat: selectedPin.lat,
                      lng: selectedPin.lng,
                      name: selectedPin.displayName,
                      type: "pin"
                    })
                  }
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    backgroundColor: "#0f2942",
                    color: "#fff",
                    border: "none",
                    borderRadius: "3px",
                    padding: "2px 5px",
                    cursor: "pointer"
                  }}
                >
                  &rarr; Dest
                </button>
                <button
                  onClick={() => setSelectedPin(null)}
                  style={{ background: "none", border: "none", color: "#9a3412", cursor: "pointer" }}
                >
                  <X size={11} />
                </button>
              </div>
            )}

            {/* Find Route Button */}
            {effectiveOrigin && effectiveDestination && (
              <button
                onClick={() => handleFindRoute(effectiveOrigin, effectiveDestination)}
                disabled={isCalculatingRoute}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  backgroundColor: "var(--navy-800)",
                  color: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  cursor: isCalculatingRoute ? "wait" : "pointer",
                  marginLeft: "auto"
                }}
              >
                {isCalculatingRoute ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                <span>{effectiveRoute ? "Recalculate Route" : "Find Road Route"}</span>
              </button>
            )}
          </div>
        )}

        {/* Route Error Notification */}
        {routeCalcError && (
          <div
            role="alert"
            style={{
              padding: "6px 10px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "var(--radius-md)",
              color: "#991b1b",
              fontSize: "11px",
              maxWidth: "600px",
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <span>{routeCalcError}</span>
            <button
              onClick={() => setRouteCalcError(null)}
              style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer" }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Row 3: Verification Status Filters Bar */}
        <div
          role="toolbar"
          aria-label="Incident status and freshness filters"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "4px",
            boxShadow: "var(--shadow-md)",
            overflowX: "auto",
            maxWidth: "calc(100% - 150px)",
            pointerEvents: "auto",
            scrollbarWidth: "none"
          }}
        >
          <button
            onClick={() => handleFilterChange("all")}
            aria-pressed={currentStatusFilter === "all"}
            style={{
              padding: "5px 10px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              backgroundColor: currentStatusFilter === "all" ? "var(--primary)" : "transparent",
              color: currentStatusFilter === "all" ? "#ffffff" : "var(--text-secondary)",
              whiteSpace: "nowrap"
            }}
          >
            All ({counts.all})
          </button>

          <button
            onClick={() => handleFilterChange("UNVERIFIED")}
            aria-pressed={currentStatusFilter === "UNVERIFIED"}
            title="Single community reports awaiting corroboration"
            style={{
              padding: "5px 9px",
              fontSize: "11px",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              backgroundColor: currentStatusFilter === "UNVERIFIED" ? STATUS_CONFIG.UNVERIFIED.bg : "transparent",
              color: currentStatusFilter === "UNVERIFIED" ? STATUS_CONFIG.UNVERIFIED.text : "var(--text-secondary)",
              border:
                currentStatusFilter === "UNVERIFIED"
                  ? `1px solid ${STATUS_CONFIG.UNVERIFIED.border}`
                  : "1px solid transparent",
              whiteSpace: "nowrap"
            }}
          >
            Unverified ({counts.UNVERIFIED})
          </button>

          <button
            onClick={() => handleFilterChange("CORROBORATED")}
            aria-pressed={currentStatusFilter === "CORROBORATED"}
            title="Corroborated by independent field reports"
            style={{
              padding: "5px 9px",
              fontSize: "11px",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              backgroundColor: currentStatusFilter === "CORROBORATED" ? STATUS_CONFIG.CORROBORATED.bg : "transparent",
              color: currentStatusFilter === "CORROBORATED" ? STATUS_CONFIG.CORROBORATED.text : "var(--text-secondary)",
              border:
                currentStatusFilter === "CORROBORATED"
                  ? `1px solid ${STATUS_CONFIG.CORROBORATED.border}`
                  : "1px solid transparent",
              whiteSpace: "nowrap"
            }}
          >
            Corroborated ({counts.CORROBORATED})
          </button>

          <button
            onClick={() => handleFilterChange("OFFICIALLY_CONFIRMED")}
            aria-pressed={currentStatusFilter === "OFFICIALLY_CONFIRMED"}
            title="Officially confirmed by authorized agency / dispatch"
            style={{
              padding: "5px 9px",
              fontSize: "11px",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              backgroundColor:
                currentStatusFilter === "OFFICIALLY_CONFIRMED" ? STATUS_CONFIG.OFFICIALLY_CONFIRMED.bg : "transparent",
              color:
                currentStatusFilter === "OFFICIALLY_CONFIRMED"
                  ? STATUS_CONFIG.OFFICIALLY_CONFIRMED.text
                  : "var(--text-secondary)",
              border:
                currentStatusFilter === "OFFICIALLY_CONFIRMED"
                  ? `1px solid ${STATUS_CONFIG.OFFICIALLY_CONFIRMED.border}`
                  : "1px solid transparent",
              whiteSpace: "nowrap"
            }}
          >
            Confirmed ({counts.OFFICIALLY_CONFIRMED})
          </button>

          <button
            onClick={() => handleFilterChange("RESOLVED")}
            aria-pressed={currentStatusFilter === "RESOLVED"}
            title="Hazard cleared; normal flow restored"
            style={{
              padding: "5px 9px",
              fontSize: "11px",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              backgroundColor: currentStatusFilter === "RESOLVED" ? STATUS_CONFIG.RESOLVED.bg : "transparent",
              color: currentStatusFilter === "RESOLVED" ? STATUS_CONFIG.RESOLVED.text : "var(--text-secondary)",
              border:
                currentStatusFilter === "RESOLVED"
                  ? `1px solid ${STATUS_CONFIG.RESOLVED.border}`
                  : "1px solid transparent",
              whiteSpace: "nowrap"
            }}
          >
            Resolved ({counts.RESOLVED})
          </button>

          <div style={{ width: "1px", height: "16px", backgroundColor: "var(--border-subtle)", margin: "0 4px" }} />

          {/* Freshness Toggle */}
          <button
            onClick={() =>
              setFreshnessFilter(freshnessFilter === "all" ? "fresh" : freshnessFilter === "fresh" ? "stale" : "all")
            }
            title="Toggle between All, Fresh, or Stale reports"
            style={{
              padding: "5px 8px",
              fontSize: "11px",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              backgroundColor: freshnessFilter !== "all" ? "var(--bg-surface-subtle)" : "transparent",
              color: freshnessFilter === "stale" ? "#b45309" : "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              whiteSpace: "nowrap"
            }}
          >
            <Clock size={11} />
            <span>
              {freshnessFilter === "all"
                ? `Freshness (${counts.stale} stale)`
                : freshnessFilter === "fresh"
                ? "Fresh Only"
                : "Stale Only"}
            </span>
          </button>
        </div>
      </div>

      {/* TOP-RIGHT UTILITY CONTROLS: Fit View & Toggle Legend */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          zIndex: 400,
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}
      >
        <button
          onClick={handleResetBounds}
          title="Fit view to show all markers"
          aria-label="Fit view to all markers"
          style={{
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            color: "var(--navy-800)",
            boxShadow: "var(--shadow-md)",
            cursor: "pointer"
          }}
        >
          <Maximize2 size={15} aria-hidden="true" />
        </button>

        <button
          onClick={() => setShowLegend(!showLegend)}
          title={showLegend ? "Hide map legend" : "Show map legend"}
          aria-label={showLegend ? "Hide map legend" : "Show map legend"}
          style={{
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            color: "var(--navy-800)",
            boxShadow: "var(--shadow-md)",
            cursor: "pointer"
          }}
        >
          {showLegend ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        </button>
      </div>

      {/* Floating Map Legend (Bottom-Left) */}
      {showLegend && (
        <div
          role="complementary"
          aria-label="Map status and hazard legend"
          style={{
            position: "absolute",
            bottom: "22px",
            left: "14px",
            zIndex: 400,
            backgroundColor: "rgba(255, 255, 255, 0.96)",
            backdropFilter: "blur(4px)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            boxShadow: "var(--shadow-md)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "11px",
            maxWidth: "240px"
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: "var(--navy-800)",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "5px"
            }}
          >
            <ShieldCheck size={13} />
            <span>Map Markers & Status</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {Object.values(STATUS_CONFIG).map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "11px",
                    height: "11px",
                    borderRadius: "50%",
                    backgroundColor: s.color,
                    border: "2px solid #ffffff",
                    boxShadow: "0 0 0 1px " + s.color,
                    flexShrink: 0
                  }}
                />
                <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{s.label}</span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                paddingTop: "2px",
                borderTop: "1px dashed var(--border-subtle)"
              }}
            >
              <span
                style={{
                  width: "11px",
                  height: "11px",
                  borderRadius: "50%",
                  border: "2px dashed #b45309",
                  flexShrink: 0
                }}
              />
              <span style={{ color: "var(--text-muted)" }}>Dashed = Stale report (&gt;6h)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "11px",
                  height: "11px",
                  borderRadius: "50% 50% 50% 0",
                  transform: "rotate(-45deg)",
                  backgroundColor: "#ea580c",
                  border: "1px solid #ffffff",
                  flexShrink: 0
                }}
              />
              <span style={{ color: "var(--text-muted)" }}>Orange Pin = Selection pin</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Active Route Card (Bottom-Right) */}
      {effectiveRoute && (effectiveRoute.coordinates || effectiveRoute.recommendation?.coordinates) && (
        <aside
          aria-label="Active emergency calculated route details"
          style={{
            position: "absolute",
            bottom: "22px",
            right: "14px",
            maxWidth: "380px",
            zIndex: 400,
            backgroundColor: "rgba(255, 255, 255, 0.98)",
            backdropFilter: "blur(6px)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 14px",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "12px"
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                <Navigation size={13} style={{ color: "#0284c7" }} />
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy-800)" }}>
                  {effectiveRoute.name || "Calculated Route"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: "3px",
                    backgroundColor: "#eff6ff",
                    color: "#1e40af",
                    border: "1px solid #bfdbfe"
                  }}
                >
                  {(effectiveRoute.mode || "AVOID_CONFIRMED_CLOSURES").replace("_", " ")}
                </span>
                {(effectiveRoute.avoided_hazards?.length || 0) > 0 && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: "3px",
                      backgroundColor: "#f0fdf4",
                      color: "#166534",
                      border: "1px solid #bbf7d0"
                    }}
                  >
                    {effectiveRoute.avoided_hazards.length} Avoided Hazard(s)
                  </span>
                )}
                {effectiveRoute.cautions?.length > 0 && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: "3px",
                      backgroundColor: "#fffbeb",
                      color: "#b45309",
                      border: "1px solid #fde68a"
                    }}
                  >
                    ⚠️ {effectiveRoute.cautions.length} Caution(s)
                  </span>
                )}
                {effectiveRoute.routing_engine && (
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 600,
                      padding: "1px 5px",
                      borderRadius: "3px",
                      backgroundColor: "var(--bg-surface-subtle)",
                      color: "var(--text-muted)"
                    }}
                  >
                    {effectiveRoute.routing_engine}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (onClearRoute) onClearRoute();
                setLocalActiveRoute(null);
              }}
              title="Dismiss route from map"
              aria-label="Clear route from map"
              style={{
                width: "22px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
                cursor: "pointer"
              }}
            >
              <X size={13} />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: "14px",
              padding: "6px 8px",
              backgroundColor: "var(--bg-surface-subtle)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px"
            }}
          >
            <div>
              <span style={{ color: "var(--text-muted)" }}>Distance:</span>{" "}
              <strong>
                {effectiveRoute.total_distance_km
                  ? `${effectiveRoute.total_distance_km} km`
                  : effectiveRoute.recommendation?.distance}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Duration:</span>{" "}
              <strong>
                {effectiveRoute.travel_time_supported && effectiveRoute.total_travel_time_minutes != null
                  ? `${effectiveRoute.total_travel_time_minutes} min`
                  : effectiveRoute.recommendation?.duration || "N/A"}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Updated:</span>{" "}
              <span>
                {effectiveRoute.last_data_update
                  ? new Date(effectiveRoute.last_data_update).toLocaleTimeString()
                  : "Live"}
              </span>
            </div>
          </div>

          {effectiveRoute.route_change_explanation && (
            <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.3" }}>
              {effectiveRoute.route_change_explanation}
            </p>
          )}

          <div
            style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              borderTop: "1px dashed var(--border-subtle)",
              paddingTop: "4px"
            }}
          >
            <em>Safety Notice: Conditions are dynamic; no route is guaranteed safe.</em>
          </div>
        </aside>
      )}
    </div>
  );
}
