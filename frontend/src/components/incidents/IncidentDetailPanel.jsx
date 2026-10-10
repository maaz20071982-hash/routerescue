import React, { useEffect, useState } from "react";
import {
  X,
  Clock,
  AlertTriangle,
  CornerDownRight,
  Navigation,
  ExternalLink,
  CheckCircle2,
  Lock,
  ShieldCheck,
  FileText,
  Plus,
  AlertCircle
} from "lucide-react";
import Badge from "../common/Badge";
import { HAZARD_CONFIG } from "../../constants/demoData";
import {
  updateIncidentStatus,
  addIncidentEvidence,
  reviewIncidentDuplicate
} from "../../services/api";

export default function IncidentDetailPanel({
  incident,
  allIncidents = [],
  onClose,
  onPlanDetour,
  onFocusMap,
  onIncidentUpdated,
  onSelectIncident
}) {
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "evidence"
  const [showStatusChanger, setShowStatusChanger] = useState(false);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showDuplicateReview, setShowDuplicateReview] = useState(null); // flag_id being reviewed
  const [prevIncidentId, setPrevIncidentId] = useState(incident?.id);

  // Status update state
  const [targetStatus, setTargetStatus] = useState(incident?.status || "UNVERIFIED");
  const [statusNotes, setStatusNotes] = useState("");
  const [reviewerRole, setReviewerRole] = useState("Operations Dispatcher");
  const [authorizedBy, setAuthorizedBy] = useState("Incident Command");
  const [adminKey, setAdminKey] = useState("routerescue-admin-sprint2");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState("");

  // Add evidence state
  const [evidenceName, setEvidenceName] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceExcerpt, setEvidenceExcerpt] = useState("");
  const [evidencePublishedAt, setEvidencePublishedAt] = useState("");
  const [evidenceIsRepost, setEvidenceIsRepost] = useState(false);
  const [isAddingEvidence, setIsAddingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceSuccess, setEvidenceSuccess] = useState("");

  // Duplicate review state
  const [dupDecision, setDupDecision] = useState("CONFIRMED_DUPLICATE_KEPT_SEPARATE");
  const [dupNotes, setDupNotes] = useState("");
  const [isReviewingDup, setIsReviewingDup] = useState(false);
  const [dupError, setDupError] = useState("");

  if (incident && incident.id !== prevIncidentId) {
    setPrevIncidentId(incident.id);
    setTargetStatus(incident.status || "UNVERIFIED");
    setUpdateError("");
    setUpdateSuccess("");
    setShowStatusChanger(false);
    setShowAddEvidence(false);
    setShowDuplicateReview(null);
    setEvidenceError("");
    setEvidenceSuccess("");
  }

  // Allow ESC key to close the detail panel
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!incident) return null;

  const currentStatusKey = (incident.status || "UNVERIFIED").toUpperCase();
  const hazardConf = HAZARD_CONFIG[incident.hazard_type || incident.type] || HAZARD_CONFIG.hazard;

  const latNum = parseFloat(incident.latitude ?? incident.lat);
  const lngNum = parseFloat(incident.longitude ?? incident.lng);
  const locName = incident.location_name || incident.locationName || `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`;
  const timeStr = incident.reported_at || incident.reportedAt || "Recent";
  const pubTimeStr = incident.published_at || incident.publishedAt || timeStr;
  const ingTimeStr = incident.ingested_at || incident.ingestedAt || timeStr;
  const sourceName = incident.source || "DEMO DATA";

  const isValidUrl =
    incident.source_url &&
    (incident.source_url.startsWith("http://") || incident.source_url.startsWith("https://"));

  const isStale = !!incident.is_stale;
  const potentialDuplicates = incident.potential_duplicates || [];
  const conflictingReports = incident.conflicting_reports || [];
  const sourcesDetail = incident.sources_detail || [];
  const verificationHistory = incident.verification_history || [];
  const evidenceSummary = incident.evidence_summary || {
    total_sources: sourcesDetail.length || 1,
    independent_sources_count: sourcesDetail.filter(s => !s.is_repost).length || 1,
    repost_count: sourcesDetail.filter(s => s.is_repost).length || 0,
    official_sources_count: sourcesDetail.filter(s => s.is_official).length || 0,
    has_official_source: sourcesDetail.some(s => s.is_official),
    is_stale: isStale,
    rule_evaluation_notes: []
  };

  const handleStatusSubmit = async e => {
    e.preventDefault();
    setUpdateError("");
    setUpdateSuccess("");

    // Inline rule check: OFFICIALLY_CONFIRMED requires official source or explicit review notes
    if (targetStatus === "OFFICIALLY_CONFIRMED" && !evidenceSummary.has_official_source && (!statusNotes || statusNotes.trim().length < 5)) {
      setUpdateError(
        "Sprint 3 Rule Violation: Cannot transition to OFFICIALLY_CONFIRMED without an authorized official agency source or explicit authorized review notes explaining the confirmation basis (min 5 characters)."
      );
      return;
    }

    setIsUpdating(true);
    try {
      const res = await updateIncidentStatus(
        incident.id,
        targetStatus,
        statusNotes,
        adminKey,
        reviewerRole,
        authorizedBy
      );
      if (res.success) {
        setUpdateSuccess(`Status successfully transitioned to ${targetStatus}`);
        if (onIncidentUpdated) {
          onIncidentUpdated(res.data);
        }
      } else {
        setUpdateError(res.error || "Failed to update incident status.");
      }
    } catch (err) {
      setUpdateError(`Unexpected error: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddEvidenceSubmit = async e => {
    e.preventDefault();
    setEvidenceError("");
    setEvidenceSuccess("");

    if (!evidenceName.trim()) {
      setEvidenceError("Please provide a source or agency name.");
      return;
    }

    setIsAddingEvidence(true);
    try {
      const res = await addIncidentEvidence(
        incident.id,
        {
          source_name: evidenceName.trim(),
          source_url: evidenceUrl.trim() || null,
          excerpt: evidenceExcerpt.trim() || null,
          published_at: evidencePublishedAt.trim() || new Date().toISOString(),
          is_repost: evidenceIsRepost
        },
        adminKey
      );

      if (res.success) {
        setEvidenceSuccess("Corroborating evidence successfully attached!");
        setEvidenceName("");
        setEvidenceUrl("");
        setEvidenceExcerpt("");
        setEvidencePublishedAt("");
        setEvidenceIsRepost(false);
        setShowAddEvidence(false);
        if (onIncidentUpdated) {
          onIncidentUpdated(res.data);
        }
      } else {
        setEvidenceError(res.error || "Failed to attach evidence.");
      }
    } catch (err) {
      setEvidenceError(`Error: ${err.message}`);
    } finally {
      setIsAddingEvidence(false);
    }
  };

  const handleReviewDuplicateSubmit = async (flagId, e) => {
    e.preventDefault();
    setDupError("");
    setIsReviewingDup(true);

    try {
      const res = await reviewIncidentDuplicate(
        incident.id,
        flagId,
        dupDecision,
        dupNotes,
        adminKey
      );
      if (res.success) {
        setShowDuplicateReview(null);
        setDupNotes("");
        if (onIncidentUpdated) {
          onIncidentUpdated(res.data);
        }
      } else {
        setDupError(res.error || "Duplicate review update failed.");
      }
    } catch (err) {
      setDupError(`Error: ${err.message}`);
    } finally {
      setIsReviewingDup(false);
    }
  };

  return (
    <section
      role="dialog"
      aria-labelledby="incident-detail-title"
      aria-modal="false"
      style={{
        position: "absolute",
        top: "14px",
        right: "14px",
        width: "420px",
        maxWidth: "calc(100vw - 28px)",
        maxHeight: "calc(100% - 28px)",
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        flexDirection: "column",
        zIndex: 410,
        overflow: "hidden"
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          backgroundColor: "var(--bg-surface-subtle)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>
              {incident.id}
            </span>
            <Badge variant={currentStatusKey.toLowerCase()}>{currentStatusKey.replace("_", " ")}</Badge>
            <Badge variant={incident.severity || "medium"}>{(incident.severity || "medium").toUpperCase()}</Badge>
            {isStale && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: "3px",
                  backgroundColor: "#fffbeb",
                  color: "#b45309",
                  border: "1px solid #fde68a"
                }}
              >
                STALE (&gt;6h)
              </span>
            )}
            <Badge variant="demo" showDot={false}>DEMO</Badge>
          </div>
          <h2
            id="incident-detail-title"
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "var(--navy-800)",
              lineHeight: "1.3"
            }}
          >
            {incident.title}
          </h2>
        </div>

        <button
          onClick={onClose}
          aria-label="Close detail panel"
          title="Close panel (Esc)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-surface)",
            flexShrink: 0
          }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Tab Navigation Header */}
      <div
        role="tablist"
        aria-label="Incident details sections"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-subtle)",
          backgroundColor: "var(--bg-surface)"
        }}
      >
        <button
          role="tab"
          aria-selected={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 600,
            color: activeTab === "overview" ? "var(--navy-800)" : "var(--text-secondary)",
            borderBottom: activeTab === "overview" ? "2px solid var(--navy-800)" : "2px solid transparent",
            backgroundColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px"
          }}
        >
          <FileText size={13} />
          <span>Incident Overview</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "evidence"}
          onClick={() => setActiveTab("evidence")}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 600,
            color: activeTab === "evidence" ? "var(--navy-800)" : "var(--text-secondary)",
            borderBottom: activeTab === "evidence" ? "2px solid var(--navy-800)" : "2px solid transparent",
            backgroundColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px"
          }}
        >
          <ShieldCheck size={13} />
          <span>Evidence & Verification</span>
          {potentialDuplicates.length > 0 && (
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#dc2626"
              }}
              title="Duplicate flagged"
            />
          )}
        </button>
      </div>

      {/* Panel Scrollable Body */}
      <div
        style={{
          padding: "16px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          fontSize: "13px"
        }}
      >
        {activeTab === "overview" ? (
          <>
            {/* Core Attributes Grid */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}
            >
              {/* Hazard Type */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>Hazard Type:</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy-800)" }}>{hazardConf.label}</span>
              </div>

              {/* Lifecycle Status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>Status:</span>
                <Badge variant={currentStatusKey.toLowerCase()}>{currentStatusKey.replace("_", " ")}</Badge>
              </div>

              {/* Location */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", flexShrink: 0 }}>Location:</span>
                <span style={{ fontSize: "12px", color: "var(--text-main)", textAlign: "right", fontWeight: 500 }}>
                  {locName}
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    GPS: {latNum.toFixed(4)}, {lngNum.toFixed(4)}
                  </div>
                </span>
              </div>

              {/* Sprint 5 Location Uncertainty Notice */}
              {incident.location_uncertain && (
                <div
                  style={{
                    padding: "8px 10px",
                    backgroundColor: "#fef3c7",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid #fde68a",
                    color: "#92400e",
                    fontSize: "11px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "6px",
                    marginTop: "2px"
                  }}
                >
                  <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <div style={{ fontWeight: 700 }}>Location Uncertainty — Review Required</div>
                    <div style={{ fontSize: "10.5px", marginTop: "2px", lineHeight: 1.3 }}>
                      {incident.location_review_reason || "Coordinates approximated from broad area centroid or post text."}
                    </div>
                  </div>
                </div>
              )}

              {/* Sprint 5 Cached Feed Notice */}
              {incident.is_cached && (
                <div
                  style={{
                    padding: "6px 10px",
                    backgroundColor: "#eff6ff",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid #bfdbfe",
                    color: "#1e40af",
                    fontSize: "11px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Clock size={12} />
                  <span>Cached Feed Record (Cached: {incident.cached_at ? new Date(incident.cached_at).toLocaleTimeString() : "Recent"})</span>
                </div>
              )}

              {/* Primary Source */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", flexShrink: 0 }}>Primary Source:</span>
                <div style={{ fontSize: "12px", color: "var(--text-main)", textAlign: "right" }}>
                  <span>{sourceName}</span>
                  {isValidUrl && (
                    <div>
                      <a
                        href={incident.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          color: "var(--navy-600)",
                          textDecoration: "underline",
                          fontSize: "11px",
                          marginTop: "2px"
                        }}
                      >
                        <span>External Report</span>
                        <ExternalLink size={10} aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Publication & Ingestion Timestamps */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>Published:</span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Clock size={12} aria-hidden="true" />
                  <span>{pubTimeStr}</span>
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>Ingested:</span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  {ingTimeStr}
                </span>
              </div>
            </div>

            {/* Situation Description */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
                Situation Description
              </div>
              <p style={{ color: "var(--text-main)", fontSize: "13px", lineHeight: "1.45" }}>
                {incident.description}
              </p>
            </div>

            {/* Impacted Corridors */}
            {incident.affectedRoutes && incident.affectedRoutes.length > 0 && (
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                  Impacted Corridors
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                  {incident.affectedRoutes.map((route, idx) => (
                    <li
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        color: "var(--text-secondary)"
                      }}
                    >
                      <AlertTriangle size={12} style={{ color: "var(--status-high-dot)" }} aria-hidden="true" />
                      <span>{route}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended Action / Detour */}
            {incident.recommendedDetour && (
              <div
                style={{
                  padding: "10px 12px",
                  backgroundColor: "var(--status-low-bg)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--status-low-border)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--status-low-text)",
                    textTransform: "uppercase",
                    marginBottom: "4px"
                  }}
                >
                  <CornerDownRight size={13} aria-hidden="true" />
                  <span>Recommended Bypass Action</span>
                </div>
                <p style={{ color: "var(--text-main)", fontSize: "12px", lineHeight: "1.4" }}>
                  {incident.recommendedDetour}
                </p>
              </div>
            )}

            {/* Privileged Status Lifecycle Transition Box */}
            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy-800)", display: "flex", alignItems: "center", gap: "5px" }}>
                  <Lock size={13} aria-hidden="true" />
                  <span>Privileged Status Control</span>
                </span>
                <button
                  onClick={() => setShowStatusChanger(!showStatusChanger)}
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--navy-700)",
                    textDecoration: "underline"
                  }}
                >
                  {showStatusChanger ? "Hide Form" : "Update Status"}
                </button>
              </div>

              {showStatusChanger && (
                <form
                  onSubmit={handleStatusSubmit}
                  style={{
                    padding: "12px",
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px"
                  }}
                >
                  {updateError && (
                    <div
                      role="alert"
                      style={{
                        padding: "8px",
                        backgroundColor: "var(--status-critical-bg)",
                        border: "1px solid var(--status-critical-border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--status-critical-text)",
                        fontSize: "12px"
                      }}
                    >
                      {updateError}
                    </div>
                  )}

                  {updateSuccess && (
                    <div
                      role="alert"
                      style={{
                        padding: "8px",
                        backgroundColor: "var(--status-low-bg)",
                        border: "1px solid var(--status-low-border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--status-low-text)",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <CheckCircle2 size={13} />
                      <span>{updateSuccess}</span>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="target-status-select"
                      style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}
                    >
                      Target Lifecycle Status:
                    </label>
                    <select
                      id="target-status-select"
                      value={targetStatus}
                      onChange={e => setTargetStatus(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-surface)"
                      }}
                    >
                      <option value="UNVERIFIED">UNVERIFIED (Community Report)</option>
                      <option value="CORROBORATED">CORROBORATED (Multi-Report)</option>
                      <option value="OFFICIALLY_CONFIRMED">OFFICIALLY_CONFIRMED (Authorized Official/Review)</option>
                      <option value="RESOLVED">RESOLVED (Hazard Cleared)</option>
                    </select>
                  </div>

                  {targetStatus === "OFFICIALLY_CONFIRMED" && !evidenceSummary.has_official_source && (
                    <div
                      style={{
                        padding: "6px 8px",
                        backgroundColor: "#fef3c7",
                        border: "1px solid #fde68a",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "11px",
                        color: "#92400e"
                      }}
                    >
                      ⚠️ <strong>Rule Requirement:</strong> This report lacks a verified .gov agency source. Transition to OFFICIALLY_CONFIRMED requires explicit authorized review notes explaining on-scene verification.
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="status-admin-key"
                      style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}
                    >
                      Administrator Key (Required):
                    </label>
                    <input
                      id="status-admin-key"
                      type="password"
                      value={adminKey}
                      onChange={e => setAdminKey(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-surface)"
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "3px" }}>
                        Reviewer Credential:
                      </label>
                      <input
                        type="text"
                        value={reviewerRole}
                        onChange={e => setReviewerRole(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "5px 6px",
                          fontSize: "11px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)"
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "3px" }}>
                        Authorizing Body:
                      </label>
                      <input
                        type="text"
                        value={authorizedBy}
                        onChange={e => setAuthorizedBy(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "5px 6px",
                          fontSize: "11px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)"
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="status-notes-input"
                      style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}
                    >
                      Audit & Triage Notes:
                    </label>
                    <input
                      id="status-notes-input"
                      type="text"
                      value={statusNotes}
                      onChange={e => setStatusNotes(e.target.value)}
                      placeholder="e.g. On-scene fire unit verified depth 1.2m"
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-surface)"
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdating}
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "var(--navy-800)",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 600,
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      cursor: isUpdating ? "wait" : "pointer"
                    }}
                  >
                    {isUpdating ? "Applying Transition..." : "Commit Status Transition"}
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          /* EVIDENCE & VERIFICATION TAB */
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Top Evidence Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div
                style={{
                  padding: "10px",
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Independent Sources</span>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--navy-800)" }}>
                  {evidenceSummary.independent_sources_count}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                  Threshold for CORROBORATED: &ge; 2
                </span>
              </div>

              <div
                style={{
                  padding: "10px",
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Citations / Reposts</span>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-secondary)" }}>
                  {evidenceSummary.repost_count}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                  Excluded from corroboration
                </span>
              </div>

              <div
                style={{
                  padding: "10px",
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Official Authority</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: evidenceSummary.has_official_source ? "#059669" : "var(--text-secondary)", marginTop: "3px" }}>
                  {evidenceSummary.has_official_source ? "Verified Agency" : "None / Community"}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                  Required for CONFIRMED
                </span>
              </div>

              <div
                style={{
                  padding: "10px",
                  backgroundColor: isStale ? "#fffbeb" : "var(--bg-surface-subtle)",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${isStale ? "#fde68a" : "var(--border-subtle)"}`,
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <span style={{ fontSize: "11px", color: isStale ? "#b45309" : "var(--text-muted)", fontWeight: 600 }}>Freshness Limit</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: isStale ? "#b45309" : "#166534", marginTop: "3px" }}>
                  {isStale ? `STALE (> ${evidenceSummary.freshness_limit_hours || 6}h)` : "FRESH"}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                  Age: {evidenceSummary.age_hours ? `${evidenceSummary.age_hours.toFixed(1)}h` : "Recent"}
                </span>
              </div>
            </div>

            {/* Rule-Based Transparent Explanation Card */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <ShieldCheck size={14} style={{ color: "var(--navy-800)" }} />
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy-800)" }}>
                  Rule Engine Evaluation
                </span>
              </div>
              <ul style={{ paddingLeft: "18px", margin: 0, fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                {(evidenceSummary.rule_evaluation_notes || []).map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px", fontStyle: "italic" }}>
                Notice: RouteRescue enforces rule-based verification. Missing data is never treated as proof of falsity, and confidence scores are never invented.
              </div>
            </div>

            {/* Potential Duplicates Card */}
            {potentialDuplicates.length > 0 && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fef2f2",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #fecaca"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <AlertTriangle size={14} style={{ color: "#b91c1c" }} />
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#991b1b" }}>
                    Potential Duplicate Flagged ({potentialDuplicates.length})
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: "#7f1d1d", margin: "0 0 8px 0" }}>
                  Flagged based on proximity, hazard category, text similarity, and time difference. <strong>Records are preserved separately and not automatically merged.</strong>
                </p>

                {potentialDuplicates.map((dup, idx) => {
                  const targetMatch = allIncidents.find(i => i.id === dup.target_incident_id);
                  const isReviewed = dup.reviewed;

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: "8px",
                        backgroundColor: "#ffffff",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid #fca5a5",
                        marginBottom: "6px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--navy-800)" }}>
                          Target: {dup.target_incident_id}
                        </span>
                        {isReviewed ? (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#166534", backgroundColor: "#f0fdf4", padding: "1px 5px", borderRadius: "3px" }}>
                            {dup.review_decision || "REVIEWED"}
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#991b1b" }}>
                            FLAGGED (Unreviewed)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-main)", margin: "3px 0" }}>
                        {dup.target_title || targetMatch?.title || "Incident"}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        Proximity: {dup.distance_meters ? `${dup.distance_meters.toFixed(0)}m` : "Nearby"} &bull; Time diff: {dup.time_diff_minutes ? `${dup.time_diff_minutes}m` : "Close"} &bull; Vocabulary overlap: {dup.text_similarity ? `${Math.round(dup.text_similarity * 100)}%` : "High"}
                      </div>

                      <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                        {targetMatch && onSelectIncident && (
                          <button
                            type="button"
                            onClick={() => onSelectIncident(targetMatch)}
                            style={{
                              fontSize: "10px",
                              fontWeight: 600,
                              color: "var(--navy-700)",
                              backgroundColor: "var(--bg-surface-subtle)",
                              border: "1px solid var(--border-subtle)",
                              padding: "3px 8px",
                              borderRadius: "3px",
                              cursor: "pointer"
                            }}
                          >
                            Inspect Target Record &rarr;
                          </button>
                        )}

                        {!isReviewed && (
                          <button
                            type="button"
                            onClick={() => setShowDuplicateReview(dup.flag_id)}
                            style={{
                              fontSize: "10px",
                              fontWeight: 600,
                              color: "#ffffff",
                              backgroundColor: "var(--navy-800)",
                              border: "none",
                              padding: "3px 8px",
                              borderRadius: "3px",
                              cursor: "pointer"
                            }}
                          >
                            Review Flag
                          </button>
                        )}
                      </div>

                      {/* Review Modal / Inline Box */}
                      {showDuplicateReview === dup.flag_id && (
                        <form
                          onSubmit={e => handleReviewDuplicateSubmit(dup.flag_id, e)}
                          style={{
                            marginTop: "8px",
                            padding: "8px",
                            backgroundColor: "var(--bg-surface-subtle)",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-subtle)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px"
                          }}
                        >
                          {dupError && <div style={{ color: "#dc2626", fontSize: "10px" }}>{dupError}</div>}
                          <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)" }}>
                            Reviewer Determination:
                          </label>
                          <select
                            value={dupDecision}
                            onChange={e => setDupDecision(e.target.value)}
                            style={{ fontSize: "11px", padding: "4px" }}
                          >
                            <option value="CONFIRMED_DUPLICATE_KEPT_SEPARATE">
                              Confirm Duplicate (Keep Separate Records)
                            </option>
                            <option value="DISMISSED_NOT_DUPLICATE">
                              Dismiss Flag (Distinct Events)
                            </option>
                          </select>
                          <input
                            type="text"
                            placeholder="Review notes / explanation..."
                            value={dupNotes}
                            onChange={e => setDupNotes(e.target.value)}
                            style={{ fontSize: "11px", padding: "4px" }}
                          />
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="submit"
                              disabled={isReviewingDup}
                              style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "4px 8px",
                                backgroundColor: "var(--navy-800)",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "3px"
                              }}
                            >
                              {isReviewingDup ? "Saving..." : "Confirm Review"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowDuplicateReview(null)}
                              style={{
                                fontSize: "10px",
                                padding: "4px 8px",
                                backgroundColor: "transparent",
                                border: "1px solid var(--border-subtle)"
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Conflicting Reports Card */}
            {conflictingReports.length > 0 && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fff7ed",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #fed7aa"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <AlertCircle size={14} style={{ color: "#c2410c" }} />
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#9a3412" }}>
                    Conflicting Report Detected Nearby
                  </span>
                </div>
                {conflictingReports.map((c, idx) => (
                  <div key={idx} style={{ fontSize: "11px", color: "#7c2d12" }}>
                    &bull; {c.description}
                  </div>
                ))}
              </div>
            )}

            {/* Source Provenance Ledger */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy-800)" }}>
                  Source Provenance Ledger ({sourcesDetail.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddEvidence(!showAddEvidence)}
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--navy-700)",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px"
                  }}
                >
                  <Plus size={12} />
                  <span>{showAddEvidence ? "Close Form" : "Attach Evidence"}</span>
                </button>
              </div>

              {/* Add Evidence Form */}
              {showAddEvidence && (
                <form
                  onSubmit={handleAddEvidenceSubmit}
                  style={{
                    padding: "10px",
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    marginBottom: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--navy-800)" }}>
                    Attach Corroborating Source / Report
                  </div>
                  {evidenceError && <div style={{ color: "#dc2626", fontSize: "11px" }}>{evidenceError}</div>}
                  {evidenceSuccess && <div style={{ color: "#16a34a", fontSize: "11px" }}>{evidenceSuccess}</div>}

                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Source / Agency Name:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Field Unit 7 Witness Report"
                      value={evidenceName}
                      onChange={e => setEvidenceName(e.target.value)}
                      style={{ width: "100%", padding: "5px", fontSize: "11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Source URL / Report Reference (Optional):
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={evidenceUrl}
                      onChange={e => setEvidenceUrl(e.target.value)}
                      style={{ width: "100%", padding: "5px", fontSize: "11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Original Publication Timestamp (Optional ISO):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2026-10-10T06:30:00Z"
                      value={evidencePublishedAt}
                      onChange={e => setEvidencePublishedAt(e.target.value)}
                      style={{ width: "100%", padding: "5px", fontSize: "11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Excerpt / Observed Conditions:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Field observation notes..."
                      value={evidenceExcerpt}
                      onChange={e => setEvidenceExcerpt(e.target.value)}
                      style={{ width: "100%", padding: "5px", fontSize: "11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="checkbox"
                      id="evidence-repost-check"
                      checked={evidenceIsRepost}
                      onChange={e => setEvidenceIsRepost(e.target.checked)}
                    />
                    <label htmlFor="evidence-repost-check" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Is Repost / Citation of earlier report (Excludes from independent tally)
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingEvidence}
                    style={{
                      padding: "6px 10px",
                      backgroundColor: "var(--navy-800)",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 600,
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      cursor: "pointer"
                    }}
                  >
                    {isAddingEvidence ? "Submitting..." : "Add Evidence to Ledger"}
                  </button>
                </form>
              )}

              {/* Source List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {sourcesDetail.map((src, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 10px",
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--navy-800)" }}>
                        {src.source_id}: {src.source_name}
                      </span>
                      {src.is_official ? (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 5px", backgroundColor: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: "3px" }}>
                          OFFICIAL AGENCY
                        </span>
                      ) : src.is_repost ? (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 5px", backgroundColor: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "3px" }}>
                          REPOST / CITATION
                        </span>
                      ) : (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 5px", backgroundColor: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: "3px" }}>
                          INDEPENDENT
                        </span>
                      )}
                    </div>

                    {src.source_url && (
                      <div>
                        <a
                          href={src.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            fontSize: "10px",
                            color: "var(--navy-600)",
                            textDecoration: "underline",
                            wordBreak: "break-all"
                          }}
                        >
                          <span>{src.source_url}</span>
                          <ExternalLink size={9} />
                        </a>
                      </div>
                    )}

                    <div style={{ fontSize: "10px", color: "var(--text-muted)", display: "flex", gap: "10px" }}>
                      <span>Pub: {src.published_at || "N/A"}</span>
                      <span>Ingested: {src.ingested_at || "N/A"}</span>
                    </div>

                    {src.excerpt && (
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px", fontStyle: "italic" }}>
                        &ldquo;{src.excerpt}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Verification History Timeline */}
            <div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy-800)", marginBottom: "6px" }}>
                Verification Audit History ({verificationHistory.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", position: "relative", paddingLeft: "14px", borderLeft: "2px solid var(--border-subtle)" }}>
                {verificationHistory.map((vh, idx) => (
                  <div key={idx} style={{ position: "relative", fontSize: "11px" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: "-19px",
                        top: "2px",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "var(--navy-800)"
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: "var(--navy-800)", fontSize: "10px" }}>
                        {vh.action}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "9px" }}>
                        {vh.timestamp}
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Actor: {vh.actor}
                    </div>
                    <div style={{ color: "var(--text-main)", fontSize: "11px", marginTop: "2px", lineHeight: "1.3" }}>
                      {vh.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Panel Footer Actions */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-subtle)",
          backgroundColor: "var(--bg-surface-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <div style={{ display: "flex", gap: "6px" }}>
          {onFocusMap && (
            <button
              onClick={() => onFocusMap(incident)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "8px 12px",
                backgroundColor: "var(--bg-surface)",
                color: "var(--navy-800)",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                cursor: "pointer"
              }}
            >
              <Navigation size={13} aria-hidden="true" />
              <span>Center Map</span>
            </button>
          )}

          {onPlanDetour && (
            <button
              onClick={() => onPlanDetour(incident)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                backgroundColor: "var(--navy-800)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer"
              }}
            >
              <CornerDownRight size={13} aria-hidden="true" />
              <span>Plan Detour</span>
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            padding: "8px 14px",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            fontSize: "12px",
            fontWeight: 600,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            cursor: "pointer"
          }}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
