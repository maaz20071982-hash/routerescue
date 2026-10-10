import React, { useState } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  AlertTriangle
} from "lucide-react";
import Badge from "../common/Badge";
import { STATUS_CONFIG, HAZARD_CONFIG } from "../../constants/demoData";

export default function IncidentList({
  incidents = [],
  selectedIncident,
  onSelectIncident,
  isCollapsed,
  onToggleCollapse,
  statusFilter = "all",
  onStatusFilterChange = null
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all"); // "all" | "fresh" | "stale"
  const [internalStatusFilter, setInternalStatusFilter] = useState("all");

  const currentStatusFilter = onStatusFilterChange ? statusFilter : internalStatusFilter;
  const setStatus = (val) => {
    if (onStatusFilterChange) {
      onStatusFilterChange(val);
    } else {
      setInternalStatusFilter(val);
    }
  };

  const filteredIncidents = incidents.filter(item => {
    const itemStatus = (item.status || "UNVERIFIED").toUpperCase();
    const itemHazard = (item.hazard_type || item.type || "").toLowerCase();
    const itemSev = (item.severity || "").toLowerCase();
    const isStale = !!item.is_stale;

    const matchesSearch =
      (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.id && item.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.locationName && item.locationName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.location_name && item.location_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      itemHazard.includes(searchQuery.toLowerCase()) ||
      itemStatus.includes(searchQuery.toUpperCase());

    const matchesStatus =
      currentStatusFilter === "all" || itemStatus === currentStatusFilter.toUpperCase();

    const matchesSeverity =
      selectedSeverity === "all" || itemSev === selectedSeverity.toLowerCase();

    const matchesFreshness =
      freshnessFilter === "all" ||
      (freshnessFilter === "fresh" && !isStale) ||
      (freshnessFilter === "stale" && isStale);

    return matchesSearch && matchesStatus && matchesSeverity && matchesFreshness;
  });

  if (isCollapsed) {
    return (
      <div
        style={{
          width: "48px",
          height: "100%",
          backgroundColor: "var(--bg-surface)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "14px",
          zIndex: 30,
          flexShrink: 0
        }}
      >
        <button
          onClick={onToggleCollapse}
          aria-label="Expand incident sidebar"
          title="Expand incident list"
          style={{
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--navy-800)"
          }}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        <div
          style={{
            marginTop: "16px",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--text-secondary)",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span>INCIDENTS ({incidents.length})</span>
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label="Incident List"
      style={{
        width: "var(--sidebar-width)",
        maxWidth: "100%",
        height: "100%",
        backgroundColor: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        zIndex: 30,
        flexShrink: 0
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--navy-800)" }}>
              Incidents & Hazards
            </h2>
            <Badge variant="demo" showDot={false}>DEMO DATA</Badge>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            Showing {filteredIncidents.length} of {incidents.length} records
          </p>
        </div>

        <button
          onClick={onToggleCollapse}
          aria-label="Collapse incident sidebar"
          title="Collapse sidebar to maximize map"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "30px",
            height: "30px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)"
          }}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Search & Status / Freshness Filter Controls */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          backgroundColor: "var(--bg-surface-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}
      >
        {/* Search Input */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center"
          }}
        >
          <Search
            size={14}
            style={{
              position: "absolute",
              left: "10px",
              color: "var(--text-muted)",
              pointerEvents: "none"
            }}
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search title, corridor, ID, or hazard..."
            aria-label="Search incidents"
            style={{
              width: "100%",
              padding: "7px 10px 7px 32px",
              fontSize: "13px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-main)"
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute",
                right: "8px",
                fontSize: "12px",
                color: "var(--text-muted)",
                padding: "2px"
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Status Lifecycle Filter Chips */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase" }}>
            Verification Status
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All" },
              { id: "UNVERIFIED", label: "Unverified" },
              { id: "CORROBORATED", label: "Corroborated" },
              { id: "OFFICIALLY_CONFIRMED", label: "Confirmed" },
              { id: "RESOLVED", label: "Resolved" }
            ].map(chip => {
              const isSelected = currentStatusFilter === chip.id;
              const conf = STATUS_CONFIG[chip.id];
              return (
                <button
                  key={chip.id}
                  onClick={() => setStatus(chip.id)}
                  aria-pressed={isSelected}
                  style={{
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm)",
                    border: isSelected ? `1px solid ${conf ? conf.border : "var(--primary)"}` : "1px solid var(--border-subtle)",
                    backgroundColor: isSelected ? (conf ? conf.bg : "var(--primary)") : "var(--bg-surface)",
                    color: isSelected ? (conf ? conf.text : "#ffffff") : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Freshness Filter Chips */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase" }}>
            Freshness Limit (6h Threshold)
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {[
              { id: "all", label: "All Ages" },
              { id: "fresh", label: "Fresh Only" },
              { id: "stale", label: "Stale Only" }
            ].map(chip => {
              const isSelected = freshnessFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setFreshnessFilter(chip.id)}
                  aria-pressed={isSelected}
                  style={{
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm)",
                    border: isSelected ? "1px solid var(--navy-800)" : "1px solid var(--border-subtle)",
                    backgroundColor: isSelected ? "var(--navy-800)" : "var(--bg-surface)",
                    color: isSelected ? "#ffffff" : "var(--text-secondary)",
                    cursor: "pointer"
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Incident Cards Scrollable Area */}
      <div
        role="list"
        aria-label="Incidents"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}
      >
        {filteredIncidents.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "13px"
            }}
          >
            <AlertTriangle size={24} style={{ margin: "0 auto 8px auto", opacity: 0.6 }} />
            <p>No incidents match the active filters.</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setStatus("all");
                setSelectedSeverity("all");
                setFreshnessFilter("all");
              }}
              style={{
                marginTop: "8px",
                color: "var(--navy-700)",
                textDecoration: "underline",
                fontSize: "12px",
                fontWeight: 600
              }}
            >
              Reset all filters
            </button>
          </div>
        ) : (
          filteredIncidents.map(inc => {
            const isSelected = selectedIncident?.id === inc.id;
            const statusKey = (inc.status || "UNVERIFIED").toUpperCase();
            const hazardConf = HAZARD_CONFIG[inc.hazard_type || inc.type] || HAZARD_CONFIG.hazard;
            const locName = inc.location_name || inc.locationName || "Unknown Corridor";
            const timeStr = inc.reported_at || inc.reportedAt || "Recent";
            const isStale = !!inc.is_stale;
            const hasDuplicates = inc.potential_duplicates && inc.potential_duplicates.length > 0;
            const independentCount = inc.evidence_summary?.independent_sources_count ?? (inc.sources_detail ? inc.sources_detail.filter(s => !s.is_repost).length : 1);
            const isOfficial = inc.evidence_summary?.has_official_source ?? (inc.sources_detail ? inc.sources_detail.some(s => s.is_official) : false);

            return (
              <div
                key={inc.id}
                role="listitem"
                tabIndex={0}
                onClick={() => onSelectIncident(inc)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectIncident(inc);
                  }
                }}
                style={{
                  padding: "12px",
                  borderRadius: "var(--radius-md)",
                  border: isSelected ? "2px solid var(--navy-700)" : "1px solid var(--border-subtle)",
                  backgroundColor: isSelected ? "var(--bg-surface-subtle)" : "var(--bg-surface)",
                  boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                  cursor: "pointer",
                  transition: "border-color 0.15s ease, background-color 0.15s ease",
                  outline: "none"
                }}
              >
                {/* Top Row: ID, Status Badge, Stale Badge, Duplicate Tag */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "6px",
                    marginBottom: "6px",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>
                      {inc.id}
                    </span>
                    <Badge variant={statusKey.toLowerCase()}>{statusKey.replace("_", " ")}</Badge>
                    {isStale && (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          padding: "1px 4px",
                          borderRadius: "3px",
                          backgroundColor: "#fffbeb",
                          color: "#b45309",
                          border: "1px solid #fde68a"
                        }}
                      >
                        STALE
                      </span>
                    )}
                    {inc.location_uncertain && (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          padding: "1px 4px",
                          borderRadius: "3px",
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          border: "1px solid #fde68a"
                        }}
                        title={inc.location_review_reason || "Location uncertain"}
                      >
                        LOC REVIEW
                      </span>
                    )}
                  </div>
                  <Badge variant={inc.severity || "medium"}>{(inc.severity || "medium").toUpperCase()}</Badge>
                </div>

                {/* Duplicate Notification Banner */}
                {hasDuplicates && (
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "2px 5px",
                      backgroundColor: "#fef2f2",
                      color: "#991b1b",
                      borderRadius: "3px",
                      border: "1px solid #fecaca",
                      marginBottom: "4px"
                    }}
                  >
                    ⚠️ Duplicate flagged ({inc.potential_duplicates.length})
                  </div>
                )}

                {/* Card Title */}
                <h3
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--text-main)",
                    lineHeight: "1.35",
                    marginBottom: "4px"
                  }}
                >
                  {inc.title}
                </h3>

                {/* Hazard Type & Evidence Snippet */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--navy-700)", fontWeight: 600, marginBottom: "4px" }}>
                  <span>{hazardConf.label}</span>
                  <span style={{ fontSize: "10px", color: isOfficial ? "#059669" : "var(--text-muted)", fontWeight: 600 }}>
                    {independentCount} source(s){isOfficial ? " (Official)" : ""}
                  </span>
                </div>

                {/* Location */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginBottom: "6px"
                  }}
                >
                  <MapPin size={13} style={{ flexShrink: 0, color: "var(--text-muted)" }} aria-hidden="true" />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {locName}
                  </span>
                </div>

                {/* Card Footer: Source, Time, and Inspect hint */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    borderTop: "1px solid var(--border-subtle)",
                    paddingTop: "6px",
                    marginTop: "6px"
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={11} aria-hidden="true" />
                    <span>{timeStr}</span>
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--navy-700)" }}>
                    Evidence & Details &rarr;
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
