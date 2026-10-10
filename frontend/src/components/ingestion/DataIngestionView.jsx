import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Key,
  MapPin,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import {
  fetchIngestionSources,
  refreshIngestionSource,
  refreshAllIngestionSources,
  fetchIngestionHistory,
  fetchIncidents
} from "../../services/api";

export default function DataIngestionView({ onNavigateToMap }) {
  const [sources, setSources] = useState([]);
  const [history, setHistory] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [refreshingFeedId, setRefreshingFeedId] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [actionNotification, setActionNotification] = useState(null);
  const [selectedFeedFilter, setSelectedFeedFilter] = useState("all");

  const loadIngestionData = useCallback(async () => {
    try {
      const [sourcesRes, histRes, incRes] = await Promise.all([
        fetchIngestionSources(),
        fetchIngestionHistory(25),
        fetchIncidents()
      ]);

      if (sourcesRes.sources) setSources(sourcesRes.sources);
      if (histRes.history) setHistory(histRes.history);
      if (incRes.incidents) setIncidents(incRes.incidents);
    } catch (err) {
      console.error("Failed to load ingestion telemetry:", err);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [sourcesRes, histRes, incRes] = await Promise.all([
          fetchIngestionSources(),
          fetchIngestionHistory(25),
          fetchIncidents()
        ]);
        if (!ignore) {
          if (sourcesRes.sources) setSources(sourcesRes.sources);
          if (histRes.history) setHistory(histRes.history);
          if (incRes.incidents) setIncidents(incRes.incidents);
        }
      } catch (err) {
        console.error("Failed to load ingestion telemetry:", err);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  const handleRefreshSource = async (feedId, forceFixture = false) => {
    setRefreshingFeedId(feedId);
    setActionNotification(null);

    const res = await refreshIngestionSource(feedId, forceFixture);
    setRefreshingFeedId(null);

    if (res.success && res.result) {
      const r = res.result;
      setActionNotification({
        type: "success",
        message: `[${r.feed_name}] Ingested ${r.records_fetched} records (${r.records_new} new, ${r.records_updated} deduplicated).`
      });
      loadIngestionData();
    } else {
      setActionNotification({
        type: "error",
        message: `[${feedId}] Ingestion failed: ${res.error || "Unknown error"}`
      });
    }
  };

  const handleRefreshAll = async (forceFixture = false) => {
    setRefreshingAll(true);
    setActionNotification(null);

    const res = await refreshAllIngestionSources(forceFixture);
    setRefreshingAll(false);

    if (res.success && res.results) {
      const totalFetched = res.results.reduce((acc, r) => acc + (r.records_fetched || 0), 0);
      const totalNew = res.results.reduce((acc, r) => acc + (r.records_new || 0), 0);
      setActionNotification({
        type: "success",
        message: `Ingestion pass complete across all feeds: ${totalFetched} records fetched (${totalNew} new records committed).`
      });
      loadIngestionData();
    } else {
      setActionNotification({
        type: "error",
        message: `Global refresh failed: ${res.error || "Unknown error"}`
      });
    }
  };

  const getHealthBadge = health => {
    switch (health) {
      case "HEALTHY":
        return {
          bg: "#dcfce7",
          color: "#166534",
          border: "#bbf7d0",
          icon: CheckCircle2,
          label: "HEALTHY"
        };
      case "DEGRADED":
        return {
          bg: "#fef3c7",
          color: "#92400e",
          border: "#fde68a",
          icon: AlertTriangle,
          label: "DEGRADED"
        };
      case "RATE_LIMITED":
        return {
          bg: "#f3e8ff",
          color: "#6b21a8",
          border: "#e9d5ff",
          icon: Clock,
          label: "RATE LIMITED"
        };
      case "ERROR":
        return {
          bg: "#fee2e2",
          color: "#991b1b",
          border: "#fecaca",
          icon: ShieldAlert,
          label: "ERROR"
        };
      case "DISABLED":
      default:
        return {
          bg: "#f1f5f9",
          color: "#475569",
          border: "#e2e8f0",
          icon: Key,
          label: "DISABLED"
        };
    }
  };

  // Filtered incidents
  const filteredIncidents = incidents.filter(inc => {
    if (selectedFeedFilter === "all") return true;
    if (selectedFeedFilter === "uncertain") return !!inc.location_uncertain;
    if (selectedFeedFilter === "cached") return !!inc.is_cached;
    return inc.source_feed_id === selectedFeedFilter;
  });

  const healthyCount = sources.filter(s => s.health === "HEALTHY").length;
  const disabledCount = sources.filter(s => s.health === "DISABLED").length;

  return (
    <div
      style={{
        flex: 1,
        height: "100%",
        overflowY: "auto",
        backgroundColor: "var(--bg-app)",
        padding: "24px 28px"
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Header Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "24px",
            flexWrap: "wrap",
            gap: "16px"
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--navy-800)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Radio size={20} />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color: "var(--navy-800)",
                    margin: 0,
                    letterSpacing: "-0.01em"
                  }}
                >
                  External Data Ingestion & Source Telemetry
                </h1>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  Source-independent polling, official NOAA/NWS alerts, authorized developer streams, and repeat deduplication.
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => handleRefreshAll(false)}
              disabled={refreshingAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 16px",
                backgroundColor: "var(--navy-800)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: refreshingAll ? "not-allowed" : "pointer",
                boxShadow: "var(--shadow-sm)"
              }}
            >
              <RefreshCw size={15} className={refreshingAll ? "animate-spin" : ""} />
              {refreshingAll ? "Polling Feeds..." : "Refresh Enabled Feeds"}
            </button>

            <button
              onClick={() => handleRefreshAll(true)}
              disabled={refreshingAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 14px",
                backgroundColor: "#ffffff",
                color: "var(--navy-800)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer"
              }}
              title="Loads deterministic saved responses without network latency"
            >
              <Sparkles size={15} color="var(--primary-600)" />
              Load Saved Fixtures (Demo)
            </button>
          </div>
        </div>

        {/* Global Notification Banner */}
        {actionNotification && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              marginBottom: "20px",
              fontSize: "13px",
              fontWeight: 500,
              backgroundColor: actionNotification.type === "success" ? "#dcfce7" : "#fee2e2",
              color: actionNotification.type === "success" ? "#166534" : "#991b1b",
              border: `1px solid ${actionNotification.type === "success" ? "#bbf7d0" : "#fecaca"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {actionNotification.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{actionNotification.message}</span>
            </div>
            <button
              onClick={() => setActionNotification(null)}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Status Metrics Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
            marginBottom: "24px"
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "16px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-xs)"
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Registered Adapters
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--navy-800)" }}>
              {sources.length} Total
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Source-independent architecture
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "16px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-xs)"
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Operational Status
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#166534" }}>
              {healthyCount} Active / Healthy
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
              {disabledCount} unconfigured / disabled
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "16px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-xs)"
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Active Database Records
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--navy-800)" }}>
              {incidents.length} Records
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
              {incidents.filter(i => i.location_uncertain).length} flagged for location review
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "16px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-xs)"
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Deduplication Policy
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy-800)", marginTop: "4px" }}>
              External ID + Source Key
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Repeat polls update timestamp without duplicating
            </div>
          </div>
        </div>

        {/* Section: Adapter Cards */}
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy-800)", marginBottom: "14px" }}>
          Registered External Data Adapters
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "18px",
            marginBottom: "32px"
          }}
        >
          {sources.map(feed => {
            const badge = getHealthBadge(feed.health);
            const BadgeIcon = badge.icon;
            const isRefreshing = refreshingFeedId === feed.feed_id;

            return (
              <div
                key={feed.feed_id}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border-subtle)",
                  padding: "20px",
                  boxShadow: "var(--shadow-xs)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between"
                }}
              >
                <div>
                  {/* Card Header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                      gap: "8px"
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          color: "var(--text-muted)",
                          letterSpacing: "0.04em",
                          marginBottom: "2px"
                        }}
                      >
                        {feed.provider_type.replace("_", " ")}
                      </div>
                      <h3
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          color: "var(--navy-800)",
                          margin: 0
                        }}
                      >
                        {feed.name}
                      </h3>
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "var(--radius-full)",
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`
                      }}
                    >
                      <BadgeIcon size={12} />
                      {badge.label}
                    </span>
                  </div>

                  {/* Endpoint detail */}
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-app)",
                      padding: "6px 10px",
                      borderRadius: "var(--radius-md)",
                      marginBottom: "14px",
                      wordBreak: "break-all",
                      fontFamily: "monospace"
                    }}
                  >
                    {feed.endpoint_url || "Local System Adapter"}
                  </div>

                  {/* Telemetry info */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Last Fetch</div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {feed.last_successful_fetch
                          ? new Date(feed.last_successful_fetch).toLocaleTimeString()
                          : "Never"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Records Ingested</div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {feed.total_records_ingested || 0}
                      </div>
                    </div>
                  </div>

                  {/* Disabled / Credentials Requirements Box */}
                  {feed.health === "DISABLED" && feed.setup_requirements && (
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#f8fafc",
                        borderRadius: "var(--radius-md)",
                        border: "1px dashed var(--border-default)",
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        marginBottom: "14px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "var(--navy-800)", marginBottom: "4px" }}>
                        <Key size={13} color="var(--primary-600)" />
                        Configuration Required
                      </div>
                      <p style={{ margin: "0 0 6px 0", lineHeight: 1.4 }}>
                        {feed.setup_requirements}
                      </p>
                      {feed.documentation_url && (
                        <a
                          href={feed.documentation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--primary-600)",
                            textDecoration: "none",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          View Official API Specs <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Rate limit warning if active */}
                  {feed.health === "RATE_LIMITED" && (
                    <div
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#f3e8ff",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid #e9d5ff",
                        fontSize: "11px",
                        color: "#6b21a8",
                        marginBottom: "14px"
                      }}
                    >
                      Rate limit backoff active. Reset: {feed.rate_limit_reset_at ? new Date(feed.rate_limit_reset_at).toLocaleTimeString() : "Pending"}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div style={{ display: "flex", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle)" }}>
                  <button
                    onClick={() => handleRefreshSource(feed.feed_id, false)}
                    disabled={isRefreshing || feed.health === "DISABLED"}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "8px 12px",
                      backgroundColor: feed.health === "DISABLED" ? "var(--bg-app)" : "var(--navy-800)",
                      color: feed.health === "DISABLED" ? "var(--text-muted)" : "#ffffff",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: feed.health === "DISABLED" || isRefreshing ? "not-allowed" : "pointer"
                    }}
                  >
                    <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
                    {isRefreshing ? "Fetching..." : "Poll Live"}
                  </button>

                  <button
                    onClick={() => handleRefreshSource(feed.feed_id, true)}
                    disabled={isRefreshing}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "8px 10px",
                      backgroundColor: "#ffffff",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                    title="Load saved example response fixture"
                  >
                    <Sparkles size={13} color="var(--primary-600)" />
                    Fixture
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section: Ingested Incidents & Location Uncertainty Stream */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            padding: "20px",
            boxShadow: "var(--shadow-xs)",
            marginBottom: "32px"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px"
            }}
          >
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy-800)", margin: "0 0 2px 0" }}>
                Ingested Incident Records & Location Review
              </h2>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
                Normalized records preserving original source URL, publication time, and fetched time.
              </p>
            </div>

            {/* Filter buttons */}
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { id: "all", label: "All Records" },
                { id: "uncertain", label: "Location Review Required" },
                { id: "cached", label: "Cached Only" },
                { id: "nws-weather-alerts", label: "NWS Alerts" },
                { id: "demo-feed", label: "Demo CAD" }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFeedFilter(f.id)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "11px",
                    fontWeight: selectedFeedFilter === f.id ? 700 : 500,
                    backgroundColor: selectedFeedFilter === f.id ? "var(--navy-800)" : "var(--bg-app)",
                    color: selectedFeedFilter === f.id ? "#ffffff" : "var(--text-secondary)",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Record / Source Feed</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Title & Hazard Category</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Location & Uncertainty Status</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Published At</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Source URL / Provenance</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>
                      No incidents match the active filter.
                    </td>
                  </tr>
                ) : (
                  filteredIncidents.slice(0, 15).map(inc => (
                    <tr
                      key={inc.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        transition: "background-color 0.1s ease"
                      }}
                    >
                      {/* Feed & Status */}
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: 600, color: "var(--navy-800)" }}>{inc.id}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {inc.source_feed_id || inc.source || "Feed"}
                        </div>
                      </td>

                      {/* Title & Category */}
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", maxWidth: "260px" }}>
                          {inc.title}
                        </div>
                        <div style={{ display: "flex", gap: "6px", marginTop: "3px" }}>
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "var(--bg-app)",
                              color: "var(--text-secondary)",
                              textTransform: "uppercase",
                              fontWeight: 600
                            }}
                          >
                            {inc.hazard_type}
                          </span>
                          {inc.is_cached && (
                            <span
                              style={{
                                fontSize: "10px",
                                padding: "1px 6px",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "#dbeafe",
                                color: "#1e40af",
                                fontWeight: 600
                              }}
                            >
                              Cached
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Location & Uncertainty */}
                      <td style={{ padding: "10px", maxWidth: "220px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <MapPin size={12} color="var(--text-muted)" />
                          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                            {inc.locationName || inc.location_name}
                          </span>
                        </div>
                        {inc.location_uncertain ? (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              marginTop: "4px",
                              padding: "2px 6px",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "#fef3c7",
                              color: "#92400e",
                              fontSize: "10px",
                              fontWeight: 600
                            }}
                            title={inc.location_review_reason || "Location uncertain"}
                          >
                            <AlertTriangle size={10} />
                            Location Review Required
                          </div>
                        ) : (
                          <div style={{ fontSize: "10px", color: "#166534", marginTop: "3px" }}>
                            Verified Coordinates
                          </div>
                        )}
                      </td>

                      {/* Published At */}
                      <td style={{ padding: "10px", fontSize: "11px", color: "var(--text-secondary)" }}>
                        <div>{inc.published_at ? new Date(inc.published_at).toLocaleDateString() : "Recent"}</div>
                        <div style={{ color: "var(--text-muted)" }}>
                          {inc.published_at ? new Date(inc.published_at).toLocaleTimeString() : ""}
                        </div>
                      </td>

                      {/* Source URL */}
                      <td style={{ padding: "10px", maxWidth: "180px" }}>
                        {inc.source_url ? (
                          <a
                            href={inc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--primary-600)",
                              textDecoration: "none",
                              fontSize: "11px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              wordBreak: "break-all"
                            }}
                          >
                            Source Link <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Internal Dispatch</span>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        <button
                          onClick={() => onNavigateToMap && onNavigateToMap(inc)}
                          style={{
                            padding: "4px 8px",
                            backgroundColor: "var(--bg-app)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "11px",
                            color: "var(--navy-800)",
                            cursor: "pointer",
                            fontWeight: 600
                          }}
                        >
                          View Map
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section: Ingestion History Audit Log */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            padding: "20px",
            boxShadow: "var(--shadow-xs)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <Activity size={18} color="var(--navy-800)" />
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy-800)", margin: 0 }}>
              Ingestion Audit History Log
            </h2>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
                  <th style={{ padding: "6px 8px" }}>Timestamp</th>
                  <th style={{ padding: "6px 8px" }}>Feed Provider</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>Fetched</th>
                  <th style={{ padding: "6px 8px" }}>New</th>
                  <th style={{ padding: "6px 8px" }}>Deduplicated</th>
                  <th style={{ padding: "6px 8px" }}>Latency</th>
                  <th style={{ padding: "6px 8px" }}>Log Message</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)" }}>
                      No recent ingestion events recorded. Click "Refresh Enabled Feeds" above to trigger a pass.
                    </td>
                  </tr>
                ) : (
                  history.slice(0, 10).map(entry => (
                    <tr key={entry.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: "6px 8px", fontWeight: 600, color: "var(--navy-800)" }}>
                        {entry.feed_name}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: entry.status === "HEALTHY" ? "#dcfce7" : "#fee2e2",
                            color: entry.status === "HEALTHY" ? "#166534" : "#991b1b"
                          }}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>{entry.records_fetched}</td>
                      <td style={{ padding: "6px 8px", color: "#166534", fontWeight: 600 }}>{entry.records_new}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>{entry.records_updated}</td>
                      <td style={{ padding: "6px 8px" }}>{entry.duration_ms}ms</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-secondary)", maxWidth: "340px" }}>
                        {entry.message}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
