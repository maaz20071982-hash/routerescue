import React, { useState, useEffect } from "react";
import {
  Activity,
  RefreshCw,
  ShieldCheck,
  Compass
} from "lucide-react";
import { ABOUT_DATA_SPECS } from "../../constants/demoData";
import Badge from "../common/Badge";
import { checkBackendHealth, fetchVerificationConfig } from "../../services/api";

export default function AboutDataView({ backendHealth, onRefreshHealth }) {
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [verificationConfig, setVerificationConfig] = useState(null);

  useEffect(() => {
    async function loadConfig() {
      const cfg = await fetchVerificationConfig();
      setVerificationConfig(cfg);
    }
    loadConfig();
  }, []);

  const handleTestHealth = async () => {
    setIsTesting(true);
    const start = performance.now();
    const result = await checkBackendHealth();
    const elapsed = Math.round(performance.now() - start);
    setTestResult({ ...result, latencyMs: elapsed });
    setIsTesting(false);
    if (onRefreshHealth) {
      onRefreshHealth();
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
          maxWidth: "880px",
          display: "flex",
          flexDirection: "column",
          gap: "24px"
        }}
      >
        {/* Title */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy-800)" }}>
              Data Provenance & System Specifications
            </h1>
            <Badge variant="demo" showDot={false}>DEMO DATA</Badge>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Full transparency regarding rule-based verification, multi-factor duplicate detection, freshness limits, and synthetic simulation indicators.
          </p>
        </div>

        {/* Sprint 3 Verification Configuration Card */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={18} style={{ color: "var(--navy-800)" }} aria-hidden="true" />
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--navy-800)" }}>
              Sprint 3: Evidence-Aware Verification Engine Settings
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Freshness Limit
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--navy-800)", margin: "4px 0" }}>
                {verificationConfig?.freshness_stale_hours ?? 6.0} hours
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Reports older than threshold are flagged as STALE without deleting records.
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Duplicate Proximity
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--navy-800)", margin: "4px 0" }}>
                {verificationConfig?.duplicate_proximity_meters ?? 800} meters
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Haversine distance boundary for candidate duplicate matching.
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Duplicate Time Window
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--navy-800)", margin: "4px 0" }}>
                {verificationConfig?.duplicate_time_window_hours ?? 6.0} hours
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Maximum temporal gap between matching candidate reports.
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Vocabulary Similarity
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--navy-800)", margin: "4px 0" }}>
                {Math.round((verificationConfig?.duplicate_text_similarity_threshold ?? 0.3) * 100)}% overlap
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Token Jaccard vocabulary similarity threshold.
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--status-low-bg)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--status-low-border)",
              fontSize: "12px",
              color: "var(--status-low-text)",
              lineHeight: 1.45
            }}
          >
            <strong>Core Verification Guarantee:</strong> No arbitrary confidence percentages are invented. Missing data is never treated as proof of falsity. Potential duplicates are flagged for operator review and never merged automatically.
          </div>
        </div>

        {/* Sprint 4 Hazard-Aware Routing Engine Card */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Compass size={18} style={{ color: "var(--navy-800)" }} aria-hidden="true" />
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--navy-800)" }}>
              Sprint 4: Hazard-Aware Routing Engine &amp; Graph Standards
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Pathfinding Algorithms
              </div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--navy-800)", margin: "4px 0" }}>
                A* Search &amp; Dijkstra
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Calculates provably optimal paths over intersection graph nodes and street segments.
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Routing Modes
              </div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--navy-800)", margin: "4px 0" }}>
                3 Tactical Modes
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Shortest, Avoid Confirmed Closures, and Minimize Hazard Exposure.
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Social Reports Policy
              </div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#b45309", margin: "4px 0" }}>
                Visible Cautions Only
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Unverified community submissions NEVER close roads automatically; they produce visible caution alerts.
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Epistemic Safety
              </div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--navy-800)", margin: "4px 0" }}>
                Strict Disclaimers
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Never claims a route is guaranteed safe. Explains route deviations and diagnoses unreachable goals.
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "#f0f9ff",
              borderRadius: "var(--radius-md)",
              border: "1px solid #bae6fd",
              fontSize: "12px",
              color: "#0369a1",
              lineHeight: 1.45
            }}
          >
            <strong>Supported Transit Duration Notice:</strong> Travel times are calculated strictly from nominal segment speed profiles. If a road segment lacks transit duration data, travel times are marked unsupported rather than fabricating numbers.
          </div>
        </div>

        {/* Live Backend Diagnostic Panel */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity size={18} style={{ color: "var(--navy-800)" }} aria-hidden="true" />
              <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--navy-800)" }}>
                FastAPI Backend Health Probe (GET /api/health)
              </h2>
            </div>

            <button
              onClick={handleTestHealth}
              disabled={isTesting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                backgroundColor: "var(--navy-800)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: isTesting ? "wait" : "pointer"
              }}
            >
              <RefreshCw size={13} className={isTesting ? "spin-animation" : ""} aria-hidden="true" />
              <span>{isTesting ? "Pinging..." : "Test Health Endpoint"}</span>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                Active Storage Backend
              </div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--navy-800)", marginTop: "2px" }}>
                {backendHealth?.storageBackend ? backendHealth.storageBackend.toUpperCase() : "DEMO_REPOSITORY"}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                Active State
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                <Badge variant={backendHealth?.online ? "low" : "neutral"}>
                  {backendHealth?.online ? "OPERATIONAL" : "OFFLINE / LOCAL FALLBACK"}
                </Badge>
              </div>
            </div>

            {testResult?.latencyMs !== undefined && (
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                  Round-trip Latency
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
                  {testResult.latencyMs} ms
                </div>
              </div>
            )}
          </div>

          {/* Response payload viewer */}
          {testResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Latest Probe Result
              </div>
              <pre
                style={{
                  padding: "12px",
                  backgroundColor: "#0a192f",
                  color: "#e2e8f0",
                  borderRadius: "var(--radius-md)",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  overflowX: "auto"
                }}
              >
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Data Principles */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)"
          }}
        >
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--navy-800)", marginBottom: "14px" }}>
            Operational Principles
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
            {ABOUT_DATA_SPECS.principles.map((p, idx) => (
              <div
                key={idx}
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)"
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--navy-800)", marginBottom: "6px" }}>
                  {p.title}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                  {p.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Dictionary */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--navy-800)" }}>
              Data Schema & Field Dictionary
            </h2>
            <Badge variant="demo" showDot={false}>DEMO DATA</Badge>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
              textAlign: "left"
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-subtle)" }}>
                <th style={{ padding: "8px 6px", color: "var(--navy-800)" }}>Field</th>
                <th style={{ padding: "8px 6px", color: "var(--navy-800)" }}>Data Type</th>
                <th style={{ padding: "8px 6px", color: "var(--navy-800)" }}>Operational Definition</th>
              </tr>
            </thead>
            <tbody>
              {ABOUT_DATA_SPECS.dataFields.map((f, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600, fontFamily: "monospace", color: "var(--navy-700)" }}>
                    {f.field}
                  </td>
                  <td style={{ padding: "8px 6px", color: "var(--text-secondary)" }}>
                    {f.type}
                  </td>
                  <td style={{ padding: "8px 6px", color: "var(--text-main)" }}>
                    {f.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
