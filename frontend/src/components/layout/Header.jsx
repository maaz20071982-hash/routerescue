import React, { useState } from "react";
import {
  Map,
  PlusCircle,
  Navigation,
  Info,
  Menu,
  X,
  Activity,
  Shield,
  RefreshCw,
  Radio,
  Clock
} from "lucide-react";


export default function Header({
  activeTab,
  onTabChange,
  backendHealth,
  onRefreshHealth,
  lastSuccessfulUpdate,
  pollingInterval = 60,
  onPollingIntervalChange,
  sourcesHealth,
  isRefreshing = false
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: "map", label: "Live Map", icon: Map },
    { id: "report", label: "Report an Issue", icon: PlusCircle },
    { id: "planner", label: "Route Planner", icon: Navigation },
    { id: "feeds", label: "Data Ingestion", icon: Radio },
    { id: "about", label: "About Data", icon: Info }
  ];

  const handleRefresh = async () => {
    if (onRefreshHealth) {
      await onRefreshHealth();
    }
  };

  const formatLastUpdate = (dt) => {
    if (!dt) return "Pending";
    try {
      const date = dt instanceof Date ? dt : new Date(dt);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "Recent";
    }
  };

  return (
    <header
      style={{
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        zIndex: 50
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "var(--header-height)",
          padding: "0 18px",
          maxWidth: "100%",
          gap: "12px"
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              backgroundColor: "var(--navy-800)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff"
            }}
          >
            <Shield size={19} aria-hidden="true" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "var(--navy-800)",
                  letterSpacing: "-0.01em"
                }}
              >
                RouteRescue
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  padding: "1px 6px",
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)"
                }}
              >
                Sprint 6
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1 }}>
              Integrated Operations
            </div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav
          aria-label="Main Navigation"
          style={{
            display: "none",
            alignItems: "center",
            gap: "4px"
          }}
          className="desktop-nav"
        >
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "7px 12px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--primary-text)" : "var(--text-secondary)",
                  backgroundColor: isActive ? "var(--primary)" : "transparent",
                  transition: "background-color 0.15s ease, color 0.15s ease",
                  border: "none",
                  cursor: "pointer"
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-surface-subtle)";
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status indicators, Polling controls & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {/* Source Feeds Health Badge */}
          <button
            onClick={() => onTabChange("feeds")}
            title="Registered ingestion sources health. Click to inspect feed statuses."
            className="hidden-mobile"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              backgroundColor: "var(--bg-surface-subtle)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              fontSize: "11px",
              color: "var(--text-secondary)",
              cursor: "pointer"
            }}
          >
            <Radio size={12} style={{ color: "var(--status-low-dot)" }} aria-hidden="true" />
            <span>Feeds: {sourcesHealth?.healthy ?? 2} Healthy, {sourcesHealth?.disabled ?? 2} Disabled</span>
          </button>

          {/* Configurable Periodic Polling Selector & Last Update */}
          <div
            className="hidden-mobile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              backgroundColor: "var(--bg-surface-subtle)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              fontSize: "11px"
            }}
          >
            <Clock size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Polling: {pollingInterval > 0 ? `${pollingInterval}s` : "Off"}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }} title="Timestamp of last successful data sync from backend">
                {formatLastUpdate(lastSuccessfulUpdate)}
              </span>
            </div>

            {onPollingIntervalChange && (
              <select
                value={pollingInterval}
                onChange={e => onPollingIntervalChange(Number(e.target.value))}
                aria-label="Configure background polling interval"
                title="Configurable periodic background polling interval (not instantaneous real-time streaming)"
                style={{
                  padding: "2px 4px",
                  fontSize: "11px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-main)",
                  cursor: "pointer"
                }}
              >
                <option value={0}>Manual Only</option>
                <option value={30}>Every 30s</option>
                <option value={60}>Every 60s (Default)</option>
                <option value={120}>Every 2m</option>
                <option value={300}>Every 5m</option>
              </select>
            )}
          </div>

          {/* Backend storage indicator */}
          <div
            title={backendHealth?.online ? "FastAPI server running and responding" : "FastAPI server offline, running in local demo mode"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              backgroundColor: "var(--bg-surface-subtle)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              fontSize: "12px"
            }}
          >
            <Activity
              size={13}
              style={{
                color: backendHealth?.online ? "var(--status-low-dot)" : "var(--status-neutral-dot)"
              }}
              aria-hidden="true"
            />
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }} className="hidden-mobile">
              {backendHealth?.online
                ? (backendHealth?.data?.storage_backend === "firestore" ? "Cloud Firestore" : "Demo Repository")
                : "Offline / Local"}
            </span>

            {/* Manual Refresh Button */}
            <button
              onClick={handleRefresh}
              aria-label="Manual refresh data from backend"
              title="Manual refresh: syncs incidents, route data, and source health"
              disabled={isRefreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px",
                color: "var(--text-muted)",
                marginLeft: "2px",
                cursor: isRefreshing ? "wait" : "pointer",
                background: "transparent",
                border: "none"
              }}
            >
              <RefreshCw
                size={13}
                className={isRefreshing ? "spin-animation" : ""}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Mobile hamburger toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="mobile-nav-toggle"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              color: "var(--navy-800)"
            }}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Notice bar reminding users that polling is periodic HTTP polling, not real-time WebSocket */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 18px",
          backgroundColor: "var(--bg-surface-subtle)",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: "10px",
          color: "var(--text-muted)"
        }}
      >
        <span>
          Background updates use periodic REST polling ({pollingInterval > 0 ? `${pollingInterval}s interval` : "paused"}) &mdash; not instantaneous real-time streaming.
        </span>
        <span>
          Last sync: <strong>{formatLastUpdate(lastSuccessfulUpdate)}</strong>
        </span>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile Navigation"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "14px 18px",
            borderTop: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-surface)"
          }}
        >
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setMobileMenuOpen(false);
                }}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "14px",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--primary-text)" : "var(--text-secondary)",
                  backgroundColor: isActive ? "var(--primary)" : "transparent",
                  textAlign: "left",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Mobile Polling and Status Settings */}
          <div
            style={{
              marginTop: "8px",
              paddingTop: "10px",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "12px",
              color: "var(--text-secondary)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Auto-Refresh Polling:</span>
              {onPollingIntervalChange && (
                <select
                  value={pollingInterval}
                  onChange={e => onPollingIntervalChange(Number(e.target.value))}
                  style={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)"
                  }}
                >
                  <option value={0}>Off (Manual Only)</option>
                  <option value={30}>Every 30s</option>
                  <option value={60}>Every 60s (Default)</option>
                  <option value={120}>Every 2m</option>
                  <option value={300}>Every 5m</option>
                </select>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Last Successful Update:</span>
              <strong>{formatLastUpdate(lastSuccessfulUpdate)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Source Feed Health:</span>
              <span>{sourcesHealth?.healthy ?? 2} Healthy, {sourcesHealth?.disabled ?? 2} Disabled</span>
            </div>
            <button
              onClick={() => {
                handleRefresh();
                setMobileMenuOpen(false);
              }}
              style={{
                marginTop: "6px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "var(--navy-800)",
                color: "#ffffff",
                borderRadius: "var(--radius-md)",
                border: "none",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <RefreshCw size={14} className={isRefreshing ? "spin-animation" : ""} />
              <span>Manual Refresh Now</span>
            </button>
          </div>
        </nav>
      )}

      <style>{`
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .mobile-nav-toggle {
            display: none !important;
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 0.7s linear infinite;
        }
      `}</style>
    </header>
  );
}
