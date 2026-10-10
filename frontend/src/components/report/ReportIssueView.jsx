import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import {
  PlusCircle,
  CheckCircle2,
  Info,
  ArrowRight,
  Crosshair
} from "lucide-react";
import Badge from "../common/Badge";
import { submitIncident } from "../../services/api";

export default function ReportIssueView({ onIncidentCreated, onNavigateToMap }) {
  const [formData, setFormData] = useState({
    title: "",
    hazard_type: "flood",
    severity: "medium",
    lat: "37.7790",
    lng: "-122.4180",
    locationName: "Market St Corridor & 8th",
    description: "",
    source_url: ""
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [validationError, setValidationError] = useState("");

  const miniMapContainerRef = useRef(null);
  const miniMapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const presetLocations = [
    { name: "Downtown / Market St", lat: "37.7790", lng: "-122.4180" },
    { name: "Mission / 24th St", lat: "37.7525", lng: "-122.4183" },
    { name: "Financial District", lat: "37.7946", lng: "-122.3999" },
    { name: "SOMA / 4th St", lat: "37.7818", lng: "-122.4011" },
    { name: "Embarcadero / Pier 14", lat: "37.7910", lng: "-122.4010" }
  ];

  const initialCoordsRef = useRef({
    lat: parseFloat(formData.lat) || 37.7790,
    lng: parseFloat(formData.lng) || -122.4180
  });

  // Initialize interactive Leaflet mini-map for coordinate selection
  useEffect(() => {
    if (!miniMapContainerRef.current) return;
    if (miniMapInstanceRef.current) return;

    const initialLat = initialCoordsRef.current.lat;
    const initialLng = initialCoordsRef.current.lng;

    const map = L.map(miniMapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 13,
      zoomControl: true,
      attributionControl: true
    });

    // Standard OpenStreetMap tiles with attribution
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Initial pin marker
    const marker = L.marker([initialLat, initialLng], {
      draggable: true
    }).addTo(map);

    marker.bindTooltip("Click or drag to place incident pin", { permanent: false });
    markerRef.current = marker;

    // Update coordinates when marker is dragged
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      setFormData(prev => ({
        ...prev,
        lat: pos.lat.toFixed(4),
        lng: pos.lng.toFixed(4)
      }));
    });

    // Update marker and coordinates when map is clicked
    map.on("click", e => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      setFormData(prev => ({
        ...prev,
        lat: lat.toFixed(4),
        lng: lng.toFixed(4)
      }));
    });

    miniMapInstanceRef.current = map;

    return () => {
      map.remove();
      miniMapInstanceRef.current = null;
    };
  }, []);

  // Sync mini-map when coordinates change externally (e.g. preset click)
  const syncMapMarker = (lat, lng) => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      if (markerRef.current) {
        markerRef.current.setLatLng([latNum, lngNum]);
      }
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.panTo([latNum, lngNum]);
      }
    }
  };

  const handlePresetSelect = p => {
    setFormData(prev => ({
      ...prev,
      locationName: p.name,
      lat: p.lat,
      lng: p.lng
    }));
    syncMapMarker(p.lat, p.lng);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setValidationError("");

    if (!formData.title.trim() || formData.title.trim().length < 3) {
      setValidationError("Incident title must be at least 3 characters.");
      return;
    }

    if (!formData.description.trim() || formData.description.trim().length < 5) {
      setValidationError("Please provide a situation description (minimum 5 characters).");
      return;
    }

    const latNum = parseFloat(formData.lat);
    const lngNum = parseFloat(formData.lng);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setValidationError("Latitude must be a valid number between -90 and 90.");
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setValidationError("Longitude must be a valid number between -180 and 180.");
      return;
    }

    if (formData.source_url && formData.source_url.trim()) {
      const url = formData.source_url.trim().toLowerCase();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        setValidationError("Source URL must start with http:// or https://");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await submitIncident(formData);
      if (res.success) {
        setSubmissionResult({
          incident: res.data,
          message: res.message,
          savedRemotely: res.savedRemotely,
          storageBackend: res.storageBackend
        });
        if (onIncidentCreated) {
          onIncidentCreated(res.data);
        }
      } else {
        setValidationError(res.error || "Failed to submit incident report.");
      }
    } catch (err) {
      setValidationError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
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
          maxWidth: "760px",
          display: "flex",
          flexDirection: "column",
          gap: "20px"
        }}
      >
        {/* View Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy-800)" }}>
              Report a Route Incident or Hazard
            </h1>
            <Badge variant="unverified">UNVERIFIED DEFAULT</Badge>
            <Badge variant="demo" showDot={false}>DEMO DATA</Badge>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Submit an obstruction, flood, or roadway hazard with map coordinate selection. All initial submissions enter the <strong>UNVERIFIED</strong> triage queue.
          </p>
        </div>

        {/* Demo Notice Box */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            padding: "12px 14px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            fontSize: "12px",
            color: "var(--text-secondary)"
          }}
        >
          <Info size={16} style={{ color: "var(--navy-600)", flexShrink: 0, marginTop: "2px" }} aria-hidden="true" />
          <div>
            <strong>Evaluation System Notice:</strong> Backend credentials are kept strictly server-side.
            When remote Firestore credentials are not configured, submissions are held in the <strong>Local Demo Repository</strong> without claiming remote cloud storage.
          </div>
        </div>

        {/* Success Banner */}
        {submissionResult ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--status-low-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--status-low-text)" }}>
              <CheckCircle2 size={22} aria-hidden="true" />
              <h2 style={{ fontSize: "16px", fontWeight: 700 }}>
                Incident Report Registered
              </h2>
            </div>

            <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              <div>Assigned Identifier: <strong>{submissionResult.incident.id}</strong></div>
              <div>Verification Status: <strong>{submissionResult.incident.status}</strong></div>
              <div>Location: <strong>{submissionResult.incident.location_name || submissionResult.incident.locationName}</strong></div>
              <div style={{ marginTop: "6px", color: "var(--navy-800)" }}>
                <em>{submissionResult.message}</em>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
              <button
                onClick={() => onNavigateToMap(submissionResult.incident)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  backgroundColor: "var(--navy-800)",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "var(--radius-md)",
                  border: "none"
                }}
              >
                <span>View on Live Map</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
              <button
                onClick={() => {
                  setSubmissionResult(null);
                  setFormData({
                    title: "",
                    hazard_type: "flood",
                    severity: "medium",
                    lat: "37.7790",
                    lng: "-122.4180",
                    locationName: "Market St Corridor & 8th",
                    description: "",
                    source_url: ""
                  });
                }}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "var(--bg-surface-subtle)",
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)"
                }}
              >
                Submit Another Report
              </button>
            </div>
          </div>
        ) : (
          /* Report Form */
          <form
            onSubmit={handleSubmit}
            style={{
              padding: "22px",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "18px"
            }}
          >
            {validationError && (
              <div
                role="alert"
                style={{
                  padding: "10px 14px",
                  backgroundColor: "var(--status-critical-bg)",
                  border: "1px solid var(--status-critical-border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--status-critical-text)",
                  fontSize: "13px"
                }}
              >
                {validationError}
              </div>
            )}

            {/* Title */}
            <div>
              <label
                htmlFor="incident-title"
                style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}
              >
                Incident Title *
              </label>
              <input
                id="incident-title"
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Flooded Underpass at 10th Ave"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-main)"
                }}
              />
            </div>

            {/* Hazard Category & Operational Severity Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label
                  htmlFor="hazard-category-select"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}
                >
                  Hazard Category *
                </label>
                <select
                  id="hazard-category-select"
                  value={formData.hazard_type}
                  onChange={e => setFormData({ ...formData, hazard_type: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "13px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                >
                  <option value="flood">Flash Flood / Water Blockage</option>
                  <option value="hazard">Road Hazard / Physical Debris</option>
                  <option value="congestion">Severe Road Gridlock</option>
                  <option value="infrastructure">Infrastructure / Utility Failure</option>
                  <option value="fire">Fire / Hazardous Material Exclusion</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="incident-severity-select"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}
                >
                  Operational Severity *
                </label>
                <select
                  id="incident-severity-select"
                  value={formData.severity}
                  onChange={e => setFormData({ ...formData, severity: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "13px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                >
                  <option value="low">Low — Caution / Reduced speed</option>
                  <option value="medium">Medium — Single lane obstruction</option>
                  <option value="high">High — Corridor impassable / Detour needed</option>
                  <option value="critical">Critical — Full safety exclusion zone</option>
                </select>
              </div>
            </div>

            {/* Map / Location Selection Section (Sprint 2 Requirement) */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label
                  style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "5px" }}
                >
                  <Crosshair size={14} style={{ color: "var(--navy-700)" }} aria-hidden="true" />
                  <span>Map & Location Selection *</span>
                </label>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Click or drag map pin to place coordinates
                </span>
              </div>

              {/* Interactive Mini Leaflet Map */}
              <div
                style={{
                  width: "100%",
                  height: "220px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  overflow: "hidden",
                  marginBottom: "8px",
                  boxShadow: "var(--shadow-sm)"
                }}
              >
                <div
                  ref={miniMapContainerRef}
                  style={{ width: "100%", height: "100%" }}
                  aria-label="Location coordinate selection map"
                />
              </div>

              {/* Presets and Corridor Name */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", alignSelf: "center" }}>Presets:</span>
                {presetLocations.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handlePresetSelect(p)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "11px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                      color: "var(--text-secondary)"
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <input
                id="location-name-input"
                type="text"
                value={formData.locationName}
                onChange={e => setFormData({ ...formData, locationName: e.target.value })}
                placeholder="Corridor or intersection label (e.g. Market St & 8th)"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-main)"
                }}
              />
            </div>

            {/* Coordinates Lat / Lng Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label
                  htmlFor="incident-lat"
                  style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}
                >
                  Latitude (WGS-84, -90 to +90) *
                </label>
                <input
                  id="incident-lat"
                  type="text"
                  required
                  value={formData.lat}
                  onChange={e => {
                    setFormData({ ...formData, lat: e.target.value });
                    syncMapMarker(e.target.value, formData.lng);
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    fontSize: "13px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="incident-lng"
                  style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}
                >
                  Longitude (WGS-84, -180 to +180) *
                </label>
                <input
                  id="incident-lng"
                  type="text"
                  required
                  value={formData.lng}
                  onChange={e => {
                    setFormData({ ...formData, lng: e.target.value });
                    syncMapMarker(formData.lat, e.target.value);
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    fontSize: "13px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                />
              </div>
            </div>

            {/* Source URL & Publication Timestamp (Sprint 3 Evidence Preservation) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label
                  htmlFor="incident-source-url"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}
                >
                  Source URL / Reference Link
                </label>
                <input
                  id="incident-source-url"
                  type="url"
                  value={formData.source_url}
                  onChange={e => setFormData({ ...formData, source_url: e.target.value })}
                  placeholder="https://example.gov/bulletin"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "13px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="incident-published-at"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}
                >
                  Publication Time (Optional ISO)
                </label>
                <input
                  id="incident-published-at"
                  type="text"
                  value={formData.published_at || ""}
                  onChange={e => setFormData({ ...formData, published_at: e.target.value })}
                  placeholder="Defaults to current timestamp"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "13px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)"
                  }}
                />
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              Preserves origin source URL, publication time, and ingestion time. New submissions enter as UNVERIFIED pending rule-based corroboration.
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="incident-description"
                style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}
              >
                Situation Description & Impact Details *
              </label>
              <textarea
                id="incident-description"
                rows={4}
                required
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe road conditions, water depth, debris obstruction, or emergency transit impact..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-main)",
                  lineHeight: "1.4"
                }}
              />
            </div>

            {/* Submit Action */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "8px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Initial status: <strong>UNVERIFIED</strong>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 18px",
                  backgroundColor: "var(--navy-800)",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.7 : 1
                }}
              >
                <PlusCircle size={15} aria-hidden="true" />
                <span>{isSubmitting ? "Submitting..." : "Submit Incident Report"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
