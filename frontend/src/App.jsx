import React, { useState, useEffect, useCallback } from "react";
import Header from "./components/layout/Header";
import DemoNotice from "./components/common/DemoNotice";
import IncidentMap from "./components/map/IncidentMap";
import IncidentList from "./components/incidents/IncidentList";
import IncidentDetailPanel from "./components/incidents/IncidentDetailPanel";
import ReportIssueView from "./components/report/ReportIssueView";
import RoutePlannerView from "./components/planner/RoutePlannerView";
import DataIngestionView from "./components/ingestion/DataIngestionView";
import AboutDataView from "./components/about/AboutDataView";
import { fetchIncidents, checkBackendHealth, fetchIngestionSources } from "./services/api";
import { INITIAL_INCIDENTS } from "./constants/demoData";

export default function App() {
  const [activeTab, setActiveTab] = useState("map");
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);
  const [backendHealth, setBackendHealth] = useState({ online: false, data: null });
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(60); // 0 = off, 30, 60, 120, 300
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sourcesHealth, setSourcesHealth] = useState({ total: 4, healthy: 2, disabled: 2 });

  // Probe backend health, ingestion sources, and load incidents
  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [health, incRes, sourcesRes] = await Promise.all([
        checkBackendHealth(),
        fetchIncidents(),
        fetchIngestionSources()
      ]);

      setBackendHealth(health);
      if (incRes?.incidents?.length > 0) {
        setIncidents(incRes.incidents);
      }
      if (sourcesRes?.sources?.length > 0) {
        const healthy = sourcesRes.sources.filter(s => s.health === "HEALTHY" || s.health === "ACTIVE").length;
        const disabled = sourcesRes.sources.filter(s => s.health === "DISABLED" || !s.enabled).length;
        setSourcesHealth({ total: sourcesRes.sources.length, healthy, disabled });
      }
      setLastSuccessfulUpdate(new Date());
    } catch (err) {
      console.warn("Data refresh completed with partial results:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    let ignore = false;
    async function init() {
      setIsRefreshing(true);
      try {
        const [health, incRes, sourcesRes] = await Promise.all([
          checkBackendHealth(),
          fetchIncidents(),
          fetchIngestionSources()
        ]);
        if (!ignore) {
          setBackendHealth(health);
          if (incRes?.incidents?.length > 0) {
            setIncidents(incRes.incidents);
          }
          if (sourcesRes?.sources?.length > 0) {
            const healthy = sourcesRes.sources.filter(s => s.health === "HEALTHY" || s.health === "ACTIVE").length;
            const disabled = sourcesRes.sources.filter(s => s.health === "DISABLED" || !s.enabled).length;
            setSourcesHealth({ total: sourcesRes.sources.length, healthy, disabled });
          }
          setLastSuccessfulUpdate(new Date());
        }
      } catch (err) {
        console.warn("Initial data load encountered partial failure:", err);
      } finally {
        if (!ignore) setIsRefreshing(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  // Configurable periodic polling (explicitly non-instantaneous REST polling)
  useEffect(() => {
    if (!pollingInterval || pollingInterval <= 0) return;
    const intervalMs = pollingInterval * 1000;
    const timer = setInterval(() => {
      loadData();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [pollingInterval, loadData]);

  // Handle new incident reported by user
  const handleIncidentCreated = newIncident => {
    setIncidents(prev => [newIncident, ...prev]);
    setSelectedIncident(newIncident);
  };

  // Switch to map and focus specific incident
  const handleNavigateToMapWithIncident = incident => {
    setSelectedIncident(incident);
    setActiveTab("map");
  };

  // Inspect route on map
  const handleInspectRouteOnMap = route => {
    setActiveRoute(route);
    setActiveTab("map");
  };

  const [statusFilter, setStatusFilter] = useState("all");

  // Handle updated incident (e.g. status transition)
  const handleIncidentUpdated = updated => {
    setIncidents(prev => prev.map(inc => (inc.id === updated.id ? updated : inc)));
    setSelectedIncident(updated);
  };

  const [routeOrigin, setRouteOrigin] = useState(null);
  const [routeDestination, setRouteDestination] = useState(null);

  // Plan detour from incident detail
  const handlePlanDetourFromIncident = incident => {
    setSelectedIncident(incident);
    const incLat = parseFloat(incident.latitude ?? incident.lat);
    const incLng = parseFloat(incident.longitude ?? incident.lng);
    if (!isNaN(incLat) && !isNaN(incLng)) {
      setRouteDestination({
        lat: incLat,
        lng: incLng,
        name: incident.title || incident.location_name || "Incident Hazard",
        type: "hazard"
      });
    }
    setActiveTab("planner");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "var(--bg-app)"
      }}
    >
      {/* Accessible skip link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Top Demo Simulation Banner */}
      <DemoNotice compact={false} />

      {/* Primary Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={tab => {
          setActiveTab(tab);
        }}
        backendHealth={backendHealth}
        onRefreshHealth={loadData}
        lastSuccessfulUpdate={lastSuccessfulUpdate}
        pollingInterval={pollingInterval}
        onPollingIntervalChange={setPollingInterval}
        sourcesHealth={sourcesHealth}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <div
        id="main-content"
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          overflow: "hidden"
        }}
      >
        {/* Map View - Kept stable and mounted across tab transitions to prevent Leaflet re-initialization */}
        <div
          style={{
            display: activeTab === "map" ? "flex" : "none",
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden"
          }}
        >
          {/* Collapsible Left Incident List */}
          <IncidentList
            incidents={incidents}
            selectedIncident={selectedIncident}
            onSelectIncident={inc => {
              setSelectedIncident(inc);
            }}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

          {/* Large Central Map Area */}
          <main
            style={{
              flex: 1,
              height: "100%",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
          >
            <IncidentMap
              incidents={incidents}
              selectedIncident={selectedIncident}
              onSelectIncident={inc => setSelectedIncident(inc)}
              activeRoute={activeRoute}
              onClearRoute={() => setActiveRoute(null)}
              onInspectRoute={setActiveRoute}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              isTabActive={activeTab === "map"}
              origin={routeOrigin}
              onSetOrigin={setRouteOrigin}
              destination={routeDestination}
              onSetDestination={setRouteDestination}
            />

            {/* Compact Floating Detail Panel */}
            {selectedIncident && (
              <IncidentDetailPanel
                incident={selectedIncident}
                allIncidents={incidents}
                onClose={() => setSelectedIncident(null)}
                onPlanDetour={handlePlanDetourFromIncident}
                onFocusMap={inc => {
                  setSelectedIncident({ ...inc, _refresh: Date.now() });
                }}
                onIncidentUpdated={handleIncidentUpdated}
                onSelectIncident={inc => setSelectedIncident(inc)}
              />
            )}
          </main>
        </div>

        {activeTab === "report" && (
          <ReportIssueView
            onIncidentCreated={handleIncidentCreated}
            onNavigateToMap={handleNavigateToMapWithIncident}
          />
        )}

        {activeTab === "planner" && (
          <RoutePlannerView
            incidents={incidents}
            onInspectRouteOnMap={handleInspectRouteOnMap}
            onChooseOnMap={() => setActiveTab("map")}
            lastSuccessfulUpdate={lastSuccessfulUpdate}
            onRefreshData={loadData}
            origin={routeOrigin}
            onSetOrigin={setRouteOrigin}
            destination={routeDestination}
            onSetDestination={setRouteDestination}
          />
        )}

        {activeTab === "feeds" && (
          <DataIngestionView
            onNavigateToMap={handleNavigateToMapWithIncident}
            onFeedRefreshed={loadData}
          />
        )}

        {activeTab === "about" && (
          <AboutDataView
            backendHealth={backendHealth}
            onRefreshHealth={loadData}
          />
        )}
      </div>
    </div>
  );
}

