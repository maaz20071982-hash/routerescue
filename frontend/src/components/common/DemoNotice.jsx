import React from "react";
import { Info } from "lucide-react";
import { DEMO_NOTICE } from "../../constants/demoData";
import Badge from "./Badge";

export default function DemoNotice({ compact = false }) {
  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          backgroundColor: "#f8fafc",
          borderBottom: "1px solid var(--border-subtle)",
          fontSize: "12px",
          color: "var(--text-secondary)"
        }}
      >
        <Badge variant="demo" showDot={false}>{DEMO_NOTICE.badge}</Badge>
        <span>Simulation Environment — All incident feeds and routes are synthetic demo records.</span>
      </div>
    );
  }

  return (
    <aside
      aria-label="Simulation Notice"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "8px 16px",
        backgroundColor: "#f8fafc",
        borderBottom: "1px solid var(--border-subtle)",
        fontSize: "12px",
        color: "var(--text-secondary)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <Badge variant="demo">{DEMO_NOTICE.badge}</Badge>
        <span style={{ fontWeight: 500, color: "var(--text-main)" }}>
          {DEMO_NOTICE.bannerTitle}:
        </span>
        <span>{DEMO_NOTICE.disclaimer}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px" }}>
        <Info size={13} aria-hidden="true" />
        <span>Live 911 / Municipal Link Inactive</span>
      </div>
    </aside>
  );
}
