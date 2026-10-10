import React from "react";

/**
 * Restrained status indicator badge.
 * Supports severity levels, demo labels, and Sprint 2 incident statuses:
 * UNVERIFIED, CORROBORATED, OFFICIALLY_CONFIRMED, RESOLVED.
 */
export default function Badge({
  variant = "neutral",
  children,
  showDot = true,
  className = ""
}) {
  const getVariantStyles = () => {
    switch (variant.toLowerCase()) {
      case "unverified":
        return {
          bg: "#fffbeb",
          text: "#b45309",
          border: "#fde68a",
          dot: "#f59e0b"
        };
      case "corroborated":
        return {
          bg: "#f0f9ff",
          text: "#0369a1",
          border: "#bae6fd",
          dot: "#0284c7"
        };
      case "officially_confirmed":
      case "confirmed":
        return {
          bg: "#ecfdf5",
          text: "#047857",
          border: "#a7f3d0",
          dot: "#059669"
        };
      case "resolved":
        return {
          bg: "#f1f5f9",
          text: "#475569",
          border: "#cbd5e1",
          dot: "#64748b"
        };
      case "critical":
        return {
          bg: "var(--status-critical-bg)",
          text: "var(--status-critical-text)",
          border: "var(--status-critical-border)",
          dot: "var(--status-critical-dot)"
        };
      case "high":
        return {
          bg: "var(--status-high-bg)",
          text: "var(--status-high-text)",
          border: "var(--status-high-border)",
          dot: "var(--status-high-dot)"
        };
      case "medium":
      case "warning":
        return {
          bg: "var(--status-medium-bg)",
          text: "var(--status-medium-text)",
          border: "var(--status-medium-border)",
          dot: "var(--status-medium-dot)"
        };
      case "low":
      case "success":
        return {
          bg: "var(--status-low-bg)",
          text: "var(--status-low-text)",
          border: "var(--status-low-border)",
          dot: "var(--status-low-dot)"
        };
      case "demo":
        return {
          bg: "#eff6ff",
          text: "#1e40af",
          border: "#bfdbfe",
          dot: "#3b82f6"
        };
      case "neutral":
      default:
        return {
          bg: "var(--status-neutral-bg)",
          text: "var(--status-neutral-text)",
          border: "var(--status-neutral-border)",
          dot: "var(--status-neutral-dot)"
        };
    }
  };

  const style = getVariantStyles();

  return (
    <span
      className={`rr-badge ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.02em",
        borderRadius: "var(--radius-sm)",
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        lineHeight: "1.3",
        whiteSpace: "nowrap"
      }}
    >
      {showDot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: style.dot,
            flexShrink: 0
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
