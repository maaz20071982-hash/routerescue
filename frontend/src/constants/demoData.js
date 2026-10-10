// RouteRescue Demo Data — Sprint 3: Evidence-Aware Verification
// CRITICAL: ALL CONTENT IS DEMO SIMULATION DATA — NO FABRICATED LIVE STATUS

export const DEMO_NOTICE = {
  badge: "DEMO DATA",
  bannerTitle: "Simulated Demonstration Environment",
  disclaimer: "All incidents, routes, and alerts shown are synthetic demonstration records for system evaluation. This application does not connect to live 911 or live municipal dispatch feeds."
};

export const STATUS_CONFIG = {
  UNVERIFIED: {
    id: "UNVERIFIED",
    label: "Unverified",
    badgeVariant: "unverified",
    color: "#f59e0b",
    dotColor: "#f59e0b",
    bg: "#fffbeb",
    text: "#b45309",
    border: "#fde68a",
    description: "Single community or field report awaiting independent corroboration or official dispatch review"
  },
  CORROBORATED: {
    id: "CORROBORATED",
    label: "Corroborated",
    badgeVariant: "corroborated",
    color: "#0284c7",
    dotColor: "#0284c7",
    bg: "#f0f9ff",
    text: "#0369a1",
    border: "#bae6fd",
    description: "Multiple independent field or witness reports aligned in spatial and temporal proximity"
  },
  OFFICIALLY_CONFIRMED: {
    id: "OFFICIALLY_CONFIRMED",
    label: "Confirmed",
    badgeVariant: "officially_confirmed",
    color: "#059669",
    dotColor: "#059669",
    bg: "#ecfdf5",
    text: "#047857",
    border: "#a7f3d0",
    description: "Verified by authorized emergency command, government agency bulletin, or explicit authorized review"
  },
  RESOLVED: {
    id: "RESOLVED",
    label: "Resolved",
    badgeVariant: "resolved",
    color: "#64748b",
    dotColor: "#64748b",
    bg: "#f1f5f9",
    text: "#475569",
    border: "#cbd5e1",
    description: "Hazard cleared; normal emergency and traffic flow restored"
  }
};

export const HAZARD_CONFIG = {
  flood: {
    id: "flood",
    label: "Flash Flood / Water Blockage",
    shortLabel: "Flood",
    iconName: "Waves"
  },
  hazard: {
    id: "hazard",
    label: "Road Hazard / Debris",
    shortLabel: "Hazard",
    iconName: "AlertTriangle"
  },
  congestion: {
    id: "congestion",
    label: "Severe Traffic Gridlock",
    shortLabel: "Gridlock",
    iconName: "TrafficCone"
  },
  infrastructure: {
    id: "infrastructure",
    label: "Infrastructure / Utility Failure",
    shortLabel: "Infrastructure",
    iconName: "PowerOff"
  },
  fire: {
    id: "fire",
    label: "Fire / Chemical Exclusion Zone",
    shortLabel: "Fire / Exclusion",
    iconName: "Flame"
  }
};

export const SEVERITY_CONFIG = {
  critical: {
    label: "Critical",
    badgeClass: "badge-critical",
    dotColor: "#dc2626",
    priority: 1,
    description: "Full road closure / Life safety risk"
  },
  high: {
    label: "High",
    badgeClass: "badge-high",
    dotColor: "#e11d48",
    priority: 2,
    description: "Major corridor blockage / Emergency detour needed"
  },
  medium: {
    label: "Medium",
    badgeClass: "badge-medium",
    dotColor: "#d97706",
    priority: 3,
    description: "Partial blockage / Significant delays"
  },
  low: {
    label: "Low",
    badgeClass: "badge-low",
    dotColor: "#16a34a",
    priority: 4,
    description: "Minor caution / Reduced speed"
  }
};

export const INITIAL_INCIDENTS = [
  {
    id: "DEMO-INC-101",
    title: "Flooded Underpass & Road Blockage",
    type: "flood",
    hazard_type: "flood",
    severity: "high",
    status: "OFFICIALLY_CONFIRMED",
    lat: 37.7749,
    lng: -122.4194,
    latitude: 37.7749,
    longitude: -122.4194,
    locationName: "Market St & 10th Ave Underpass",
    location_name: "Market St & 10th Ave Underpass",
    description: "Flash runoff collected in the depressed underpass. Depth ~1.2 meters. Inaccessible to standard ambulance and police transport.",
    reportedAt: "25 min ago (05:40 UTC)",
    reported_at: "2026-10-10T05:40:00Z",
    published_at: "2026-10-10T05:35:00Z",
    ingested_at: "2026-10-10T05:40:00Z",
    affectedRoutes: ["Market St to Mission Corridor", "10th Ave Underpass"],
    affected_routes: ["Market St to Mission Corridor", "10th Ave Underpass"],
    recommendedDetour: "Divert via 11th Ave Elevated Flyover. Adds ~3.4 min transit time.",
    recommended_action: "Divert via 11th Ave Elevated Flyover. Adds ~3.4 min transit time.",
    verified: true,
    source: "SF Municipal Transportation Agency",
    source_url: "https://example.gov/demo-bulletin/101",
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)",
    is_stale: false,
    sources_detail: [
      {
        source_id: "SRC-101-1",
        source_name: "SF Municipal Transportation Agency Bulletin",
        source_url: "https://example.gov/demo-bulletin/101",
        published_at: "2026-10-10T05:35:00Z",
        ingested_at: "2026-10-10T05:40:00Z",
        is_official: true,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Severe water runoff accumulation across 10th Ave underpass; both lanes closed.",
        notes: "Verified official municipal dispatch bulletin #101"
      }
    ],
    verification_history: [
      {
        id: "VH-101-1",
        timestamp: "2026-10-10T05:40:00Z",
        action: "INGESTION",
        from_status: null,
        to_status: "UNVERIFIED",
        actor: "Municipal Dispatch Feed",
        reason: "Official transportation bulletin received via https://example.gov/demo-bulletin/101."
      },
      {
        id: "VH-101-2",
        timestamp: "2026-10-10T05:40:02Z",
        action: "RULE_EVALUATION",
        from_status: "UNVERIFIED",
        to_status: "OFFICIALLY_CONFIRMED",
        actor: "VerificationRuleEngine",
        reason: "Transitioned to OFFICIALLY_CONFIRMED: Authorized official government authority verified (example.gov)."
      }
    ],
    evidence_summary: {
      total_sources: 1,
      independent_sources_count: 1,
      repost_count: 0,
      official_sources_count: 1,
      has_official_source: true,
      is_stale: false,
      freshness_limit_hours: 6.0,
      age_hours: 0.4,
      duplicate_flags_count: 1,
      conflict_flags_count: 0,
      rule_evaluation_notes: [
        "Authorized official source verified: SF Municipal Transportation Agency Bulletin.",
        "Single primary official report. Status set to OFFICIALLY_CONFIRMED.",
        "Report is fresh (0.4h old, within 6.0h threshold)."
      ]
    },
    potential_duplicates: [
      {
        flag_id: "DUP-DEMO-INC-101-DEMO-INC-106",
        target_incident_id: "DEMO-INC-106",
        target_title: "Flooded Roadway at 9th and Market",
        distance_meters: 185.0,
        time_diff_minutes: 10.0,
        text_similarity: 0.54,
        hazard_match: true,
        reasons: [
          "Within spatial proximity: 185.0m",
          "Matching hazard category: 'flood'",
          "Reported within 10 min window",
          "Text vocabulary overlap: 54%"
        ],
        flagged_at: "2026-10-10T05:50:00Z",
        reviewed: false,
        review_decision: null,
        policy_notice: "Flagged for operator review. Record preserved separately and not automatically merged."
      }
    ],
    conflicting_reports: []
  },
  {
    id: "DEMO-INC-102",
    title: "Structural Scaffolding Collapse",
    type: "hazard",
    hazard_type: "hazard",
    severity: "medium",
    status: "CORROBORATED",
    lat: 37.7833,
    lng: -122.4167,
    latitude: 37.7833,
    longitude: -122.4167,
    locationName: "Geary Blvd Eastbound at Larkin",
    location_name: "Geary Blvd Eastbound at Larkin",
    description: "Commercial building construction scaffolding collapsed into outer eastern lanes. Single lane squeeze with speed limit restricted to 20 km/h.",
    reportedAt: "48 min ago (05:17 UTC)",
    reported_at: "2026-10-10T06:12:00Z",
    published_at: "2026-10-10T06:10:00Z",
    ingested_at: "2026-10-10T06:12:00Z",
    affectedRoutes: ["Geary Blvd Eastbound"],
    affected_routes: ["Geary Blvd Eastbound"],
    recommendedDetour: "Heavy rescue vehicles reroute via Sutter St or Post St.",
    recommended_action: "Heavy rescue vehicles reroute via Sutter St or Post St.",
    verified: true,
    source: "Traffic Alert Radio & Field Spotters",
    source_url: null,
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)",
    is_stale: false,
    sources_detail: [
      {
        source_id: "SRC-102-1",
        source_name: "Field Spotter Alert (Unit 12)",
        source_url: null,
        published_at: "2026-10-10T06:10:00Z",
        ingested_at: "2026-10-10T06:12:00Z",
        is_official: false,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Scaffolding pipes fallen across sidewalk and curb lane on Geary.",
        notes: "First independent field sighting"
      },
      {
        source_id: "SRC-102-2",
        source_name: "Commercial Transit Driver Report",
        source_url: null,
        published_at: "2026-10-10T06:18:00Z",
        ingested_at: "2026-10-10T06:20:00Z",
        is_official: false,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Heavy debris and scaffolding blocking eastbound right lane at Larkin.",
        notes: "Second independent eyewitness confirmation"
      },
      {
        source_id: "SRC-102-3",
        source_name: "Social Channel Repost",
        source_url: null,
        published_at: "2026-10-10T06:25:00Z",
        ingested_at: "2026-10-10T06:26:00Z",
        is_official: false,
        is_repost: true,
        repost_of_source_id: "SRC-102-1",
        excerpt: "RT @alert_sf Scaffolding collapsed on Geary at Larkin, avoid right lane.",
        notes: "Identified as repost; excluded from independent corroboration tally"
      }
    ],
    verification_history: [
      {
        id: "VH-102-1",
        timestamp: "2026-10-10T06:12:00Z",
        action: "INGESTION",
        from_status: null,
        to_status: "UNVERIFIED",
        actor: "Field Spotter Intake",
        reason: "Initial report submitted by Field Spotter."
      },
      {
        id: "VH-102-2",
        timestamp: "2026-10-10T06:20:00Z",
        action: "SOURCE_CORROBORATION",
        from_status: "UNVERIFIED",
        to_status: "CORROBORATED",
        actor: "VerificationRuleEngine",
        reason: "Transitioned to CORROBORATED: 2 independent sources aligned within 400m and 10 min."
      },
      {
        id: "VH-102-3",
        timestamp: "2026-10-10T06:26:00Z",
        action: "REPOST_FILTERED",
        from_status: "CORROBORATED",
        to_status: "CORROBORATED",
        actor: "VerificationRuleEngine",
        reason: "Third report detected as RT/quote attribution; marked as repost without inflating count."
      }
    ],
    evidence_summary: {
      total_sources: 3,
      independent_sources_count: 2,
      repost_count: 1,
      official_sources_count: 0,
      has_official_source: false,
      is_stale: false,
      freshness_limit_hours: 6.0,
      age_hours: 0.8,
      duplicate_flags_count: 0,
      conflict_flags_count: 0,
      rule_evaluation_notes: [
        "No authorized official or government agency source on record.",
        "Corroborated by 2 independent, non-repost sources within 400m.",
        "1 citation identified as a repost/quote and excluded from independent tally.",
        "Report is fresh (0.8h old, within 6.0h threshold)."
      ]
    },
    potential_duplicates: [],
    conflicting_reports: []
  },
  {
    id: "DEMO-INC-103",
    title: "Signal Controller Failure & Hospital Gridlock",
    type: "congestion",
    hazard_type: "congestion",
    severity: "high",
    status: "UNVERIFIED",
    lat: 37.7650,
    lng: -122.4320,
    latitude: 37.7650,
    longitude: -122.4320,
    locationName: "Castro & 18th St Medical Corridor",
    location_name: "Castro & 18th St Medical Corridor",
    description: "Traffic signal controller offline. Intersection deadlocked in all four directions, impacting primary access route to Memorial Hospital Emergency Wing.",
    reportedAt: "12 min ago (05:53 UTC)",
    reported_at: "2026-10-10T06:25:00Z",
    published_at: "2026-10-10T06:22:00Z",
    ingested_at: "2026-10-10T06:25:00Z",
    affectedRoutes: ["Castro St Corridor", "18th St Cross-town"],
    affected_routes: ["Castro St Corridor", "18th St Cross-town"],
    recommendedDetour: "Use Sanchez St to 19th St. Manual traffic warden deployed.",
    recommended_action: "Use Sanchez St to 19th St. Manual traffic warden deployed.",
    verified: false,
    source: "Citizen Community Report",
    source_url: null,
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)",
    is_stale: false,
    sources_detail: [
      {
        source_id: "SRC-103-1",
        source_name: "Citizen Community Report",
        source_url: null,
        published_at: "2026-10-10T06:22:00Z",
        ingested_at: "2026-10-10T06:25:00Z",
        is_official: false,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Lights flashing dark, traffic jammed around 18th & Castro near hospital.",
        notes: "Single source report awaiting corroboration"
      }
    ],
    verification_history: [
      {
        id: "VH-103-1",
        timestamp: "2026-10-10T06:25:00Z",
        action: "INGESTION",
        from_status: null,
        to_status: "UNVERIFIED",
        actor: "Community Intake Portal",
        reason: "Single community submission received. Missing secondary corroboration; status remains UNVERIFIED."
      }
    ],
    evidence_summary: {
      total_sources: 1,
      independent_sources_count: 1,
      repost_count: 0,
      official_sources_count: 0,
      has_official_source: false,
      is_stale: false,
      freshness_limit_hours: 6.0,
      age_hours: 0.2,
      duplicate_flags_count: 0,
      conflict_flags_count: 0,
      rule_evaluation_notes: [
        "No authorized official source on record.",
        "Single independent source report. Awaiting secondary independent corroboration.",
        "Missing data is not treated as proof of falsity; status remains UNVERIFIED.",
        "Report is fresh (0.2h old, within 6.0h threshold)."
      ]
    },
    potential_duplicates: [],
    conflicting_reports: []
  },
  {
    id: "DEMO-INC-104",
    title: "Fallen Utility Line — Hazard Cleared",
    type: "infrastructure",
    hazard_type: "infrastructure",
    severity: "low",
    status: "RESOLVED",
    lat: 37.7910,
    lng: -122.4010,
    latitude: 37.7910,
    longitude: -122.4010,
    locationName: "Embarcadero Pier 14 Access",
    location_name: "Embarcadero Pier 14 Access",
    description: "Downed low-voltage telecommunication cable was secured and safely removed by city electrical crew. Normal traffic restored.",
    reportedAt: "1 hr 45 min ago (04:20 UTC)",
    reported_at: "2026-10-10T04:15:00Z",
    published_at: "2026-10-10T04:10:00Z",
    ingested_at: "2026-10-10T04:15:00Z",
    affectedRoutes: ["Embarcadero Southbound Service Lane"],
    affected_routes: ["Embarcadero Southbound Service Lane"],
    recommendedDetour: "All lanes clear; proceed normally.",
    recommended_action: "All lanes clear; proceed normally.",
    verified: true,
    source: "City Electrical Crew Dispatch",
    source_url: "https://example.gov/demo-bulletin/104",
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)",
    is_stale: false,
    sources_detail: [
      {
        source_id: "SRC-104-1",
        source_name: "City Electrical Utility Crew Dispatch",
        source_url: "https://example.gov/demo-bulletin/104",
        published_at: "2026-10-10T04:10:00Z",
        ingested_at: "2026-10-10T04:15:00Z",
        is_official: true,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Telecommunication line cleared and verified safe by City Electrical Crew #7.",
        notes: "Official municipal work completion record"
      }
    ],
    verification_history: [
      {
        id: "VH-104-1",
        timestamp: "2026-10-10T04:15:00Z",
        action: "INGESTION",
        from_status: null,
        to_status: "OFFICIALLY_CONFIRMED",
        actor: "City Utility Portal",
        reason: "Ingested from official utility bulletin."
      },
      {
        id: "VH-104-2",
        timestamp: "2026-10-10T05:00:00Z",
        action: "STATUS_TRANSITION",
        from_status: "OFFICIALLY_CONFIRMED",
        to_status: "RESOLVED",
        actor: "On-Scene Supervisor #7",
        reason: "Hazard fully cleared and lanes opened to public."
      }
    ],
    evidence_summary: {
      total_sources: 1,
      independent_sources_count: 1,
      repost_count: 0,
      official_sources_count: 1,
      has_official_source: true,
      is_stale: false,
      freshness_limit_hours: 6.0,
      age_hours: 1.8,
      duplicate_flags_count: 0,
      conflict_flags_count: 0,
      rule_evaluation_notes: [
        "Authorized official source verified (example.gov).",
        "Hazard marked RESOLVED following on-scene clearance.",
        "Report is fresh (1.8h old)."
      ]
    },
    potential_duplicates: [],
    conflicting_reports: []
  },
  {
    id: "DEMO-INC-105",
    title: "Chemical / Gas Leak Exclusion Zone",
    type: "fire",
    hazard_type: "fire",
    severity: "critical",
    status: "OFFICIALLY_CONFIRMED",
    lat: 37.7580,
    lng: -122.4140,
    latitude: 37.7580,
    longitude: -122.4140,
    locationName: "Valencia St between 20th & 22nd",
    location_name: "Valencia St between 20th & 22nd",
    description: "Ruptured natural gas distribution main. Fire Department incident command has established a mandatory 300-meter exclusion zone. All thoroughfares impassable.",
    reportedAt: "8 min ago (05:57 UTC)",
    reported_at: "2026-10-10T06:35:00Z",
    published_at: "2026-10-10T06:30:00Z",
    ingested_at: "2026-10-10T06:35:00Z",
    affectedRoutes: ["Valencia St", "Mission St (Partial)", "21st St"],
    affected_routes: ["Valencia St", "Mission St (Partial)", "21st St"],
    recommendedDetour: "Mandatory reroute via South Van Ness Ave or Guerrero St. Do not enter perimeter.",
    recommended_action: "Mandatory reroute via South Van Ness Ave or Guerrero St. Do not enter perimeter.",
    verified: true,
    source: "SF Fire Department Command",
    source_url: "https://example.gov/demo-dispatch/105",
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)",
    is_stale: false,
    sources_detail: [
      {
        source_id: "SRC-105-1",
        source_name: "SF Fire Department Command Bulletin",
        source_url: "https://example.gov/demo-dispatch/105",
        published_at: "2026-10-10T06:30:00Z",
        ingested_at: "2026-10-10T06:35:00Z",
        is_official: true,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Mandatory 300-meter exclusion perimeter established around natural gas leak.",
        notes: "Authorized emergency command advisory #105"
      }
    ],
    verification_history: [
      {
        id: "VH-105-1",
        timestamp: "2026-10-10T06:35:00Z",
        action: "INGESTION",
        from_status: null,
        to_status: "UNVERIFIED",
        actor: "Incident Command Gateway",
        reason: "Emergency bulletin ingested from official dispatch source."
      },
      {
        id: "VH-105-2",
        timestamp: "2026-10-10T06:35:02Z",
        action: "RULE_EVALUATION",
        from_status: "UNVERIFIED",
        to_status: "OFFICIALLY_CONFIRMED",
        actor: "VerificationRuleEngine",
        reason: "Transitioned to OFFICIALLY_CONFIRMED: Authorized official emergency agency confirmed (SF Fire Department)."
      }
    ],
    evidence_summary: {
      total_sources: 1,
      independent_sources_count: 1,
      repost_count: 0,
      official_sources_count: 1,
      has_official_source: true,
      is_stale: false,
      freshness_limit_hours: 6.0,
      age_hours: 0.1,
      duplicate_flags_count: 0,
      conflict_flags_count: 0,
      rule_evaluation_notes: [
        "Authorized official source verified: SF Fire Department Command Bulletin.",
        "Meets criteria for OFFICIALLY_CONFIRMED.",
        "Report is fresh (0.1h old)."
      ]
    },
    potential_duplicates: [],
    conflicting_reports: []
  },
  {
    // Demonstrates DUPLICATE FLAGGING against DEMO-INC-101 (within 185m, same hazard, similar text, 10 min window)
    id: "DEMO-INC-106",
    title: "Flooded Roadway at 9th and Market",
    type: "flood",
    hazard_type: "flood",
    severity: "high",
    status: "UNVERIFIED",
    lat: 37.7760,
    lng: -122.4180,
    latitude: 37.7760,
    longitude: -122.4180,
    locationName: "Market St & 9th Ave Junction",
    location_name: "Market St & 9th Ave Junction",
    description: "Flash runoff and water buildup across depressed lower underpass near 9th and Market. Impassable road blockage.",
    reportedAt: "10 min ago (05:50 UTC)",
    reported_at: "2026-10-10T05:50:00Z",
    published_at: "2026-10-10T05:48:00Z",
    ingested_at: "2026-10-10T05:50:00Z",
    affectedRoutes: ["Market St Lower Lanes"],
    affected_routes: ["Market St Lower Lanes"],
    recommendedDetour: "Avoid Market St lower lanes.",
    recommended_action: "Avoid Market St lower lanes.",
    verified: false,
    source: "Local Taxi Fleet Radio",
    source_url: null,
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)",
    is_stale: false,
    sources_detail: [
      {
        source_id: "SRC-106-1",
        source_name: "Local Taxi Fleet Radio",
        source_url: null,
        published_at: "2026-10-10T05:48:00Z",
        ingested_at: "2026-10-10T05:50:00Z",
        is_official: false,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Severe water pooling and underpass flooded near 9th & Market.",
        notes: "Commercial fleet witness"
      }
    ],
    verification_history: [
      {
        id: "VH-106-1",
        timestamp: "2026-10-10T05:50:00Z",
        action: "INGESTION",
        from_status: null,
        to_status: "UNVERIFIED",
        actor: "Commercial Fleet Intake",
        reason: "Initial report received."
      },
      {
        id: "VH-106-2",
        timestamp: "2026-10-10T05:50:02Z",
        action: "DUPLICATE_FLAGGED",
        from_status: "UNVERIFIED",
        to_status: "UNVERIFIED",
        actor: "VerificationRuleEngine",
        reason: "Potential duplicate flagged with DEMO-INC-101 (185m away, matching flood hazard, 10 min window). Record preserved separately pending operator review."
      }
    ],
    evidence_summary: {
      total_sources: 1,
      independent_sources_count: 1,
      repost_count: 0,
      official_sources_count: 0,
      has_official_source: false,
      is_stale: false,
      freshness_limit_hours: 6.0,
      age_hours: 0.3,
      duplicate_flags_count: 1,
      conflict_flags_count: 0,
      rule_evaluation_notes: [
        "No authorized official source on record.",
        "Single independent source report. Awaiting secondary corroboration.",
        "1 potential duplicate flagged (DEMO-INC-101). Record preserved separately.",
        "Report is fresh (0.3h old)."
      ]
    },
    potential_duplicates: [
      {
        flag_id: "DUP-DEMO-INC-106-DEMO-INC-101",
        target_incident_id: "DEMO-INC-101",
        target_title: "Flooded Underpass & Road Blockage",
        distance_meters: 185.0,
        time_diff_minutes: 10.0,
        text_similarity: 0.54,
        hazard_match: true,
        reasons: [
          "Within spatial proximity: 185.0m",
          "Matching hazard category: 'flood'",
          "Reported within 10 min window",
          "Text vocabulary overlap: 54%"
        ],
        flagged_at: "2026-10-10T05:50:00Z",
        reviewed: false,
        review_decision: null,
        policy_notice: "Flagged for operator review. Record preserved separately and not automatically merged."
      }
    ],
    conflicting_reports: []
  },
  {
    // Demonstrates STALE REPORT FLAGGING (reported > 15 hours ago, exceeding 6.0h limit)
    id: "DEMO-INC-107",
    title: "Fallen Tree Branch Leaning Over Outer Lane",
    type: "hazard",
    hazard_type: "hazard",
    severity: "low",
    status: "UNVERIFIED",
    lat: 37.7420,
    lng: -122.4450,
    latitude: 37.7420,
    longitude: -122.4450,
    locationName: "Portola Dr & Woodside Ave",
    location_name: "Portola Dr & Woodside Ave",
    description: "Large eucalyptus branch hanging into outer lane. Minor hazard for tall emergency vehicles.",
    reportedAt: "15 hours ago (17:30 UTC)",
    reported_at: "2026-10-09T17:30:00Z",
    published_at: "2026-10-09T17:20:00Z",
    ingested_at: "2026-10-09T17:30:00Z",
    affectedRoutes: ["Portola Dr Westbound Outer Lane"],
    affected_routes: ["Portola Dr Westbound Outer Lane"],
    recommendedDetour: "Caution when navigating outer lane.",
    recommended_action: "Caution when navigating outer lane.",
    verified: false,
    source: "Community Neighborhood Watch",
    source_url: null,
    storage_provenance: "DEMO REPOSITORY (IN-MEMORY)",
    is_stale: true,
    sources_detail: [
      {
        source_id: "SRC-107-1",
        source_name: "Community Neighborhood Watch",
        source_url: null,
        published_at: "2026-10-09T17:20:00Z",
        ingested_at: "2026-10-09T17:30:00Z",
        is_official: false,
        is_repost: false,
        repost_of_source_id: null,
        excerpt: "Hanging eucalyptus branch across outer lane.",
        notes: "Neighborhood watch alert"
      }
    ],
    verification_history: [
      {
        id: "VH-107-1",
        timestamp: "2026-10-09T17:30:00Z",
        action: "INGESTION",
        from_status: null,
        to_status: "UNVERIFIED",
        actor: "Community Intake",
        reason: "Initial report submitted."
      },
      {
        id: "VH-107-2",
        timestamp: "2026-10-09T23:30:00Z",
        action: "FRESHNESS_CHECK",
        from_status: "UNVERIFIED",
        to_status: "UNVERIFIED",
        actor: "VerificationRuleEngine",
        reason: "Age exceeded 6.0h threshold. Flagged as STALE pending recent field re-verification."
      }
    ],
    evidence_summary: {
      total_sources: 1,
      independent_sources_count: 1,
      repost_count: 0,
      official_sources_count: 0,
      has_official_source: false,
      is_stale: true,
      freshness_limit_hours: 6.0,
      age_hours: 16.5,
      duplicate_flags_count: 0,
      conflict_flags_count: 0,
      rule_evaluation_notes: [
        "No authorized official source on record.",
        "Report age of 16.5h exceeds 6.0h freshness limit. Flagged as STALE.",
        "Preserved as active report pending field verification (no data discarded)."
      ]
    },
    potential_duplicates: [],
    conflicting_reports: []
  }
];

export const DEMO_ROUTES = [
  {
    id: "PRESET-CORRIDOR-1",
    name: "Civic Staging to Downtown Medical Hub (Market Corridor)",
    origin_name: "Market St & Van Ness Ave",
    destination_name: "Market St & 4th St",
    origin_node_id: "INT_MARKET_VAN_NESS",
    destination_node_id: "INT_MARKET_4TH",
    mode: "AVOID_CONFIRMED_CLOSURES",
    status: "Detoured around Flooded Underpass",
    is_reachable: true,
    total_distance_km: 1.48,
    total_distance_meters: 1478.2,
    total_travel_time_minutes: 2.8,
    total_travel_time_seconds: 168.0,
    travel_time_supported: true,
    avoided_hazards: [
      {
        incident_id: "DEMO-INC-101",
        title: "Flooded Underpass & Road Blockage",
        hazard_type: "flood",
        status: "OFFICIALLY_CONFIRMED",
        severity: "critical",
        location_name: "Market St & 10th St Underpass",
        reason: "Avoided confirmed road closure on Market St"
      }
    ],
    cautions: [],
    route_change_explanation: "Route diverted via 11th St and Mission St corridor to circumvent confirmed flooded underpass at Market & 10th St. Distance increased by +186 m compared to baseline direct Market corridor.",
    safety_disclaimer: "Route conditions are dynamic and subject to ongoing field hazards. No route can be guaranteed completely safe; field units must exercise tactical caution.",
    last_data_update: "2026-10-10T06:30:00Z",
    coordinates: [
      [37.7753, -122.4194],
      [37.7760, -122.4182],
      [37.7735, -122.4165],
      [37.7742, -122.4152],
      [37.7750, -122.4138],
      [37.7774, -122.4156],
      [37.7785, -122.4140],
      [37.7797, -122.4125],
      [37.7809, -122.4110],
      [37.7821, -122.4095],
      [37.7835, -122.4078]
    ]
  },
  {
    id: "PRESET-CORRIDOR-2",
    name: "Geary Boulevard Corridor (Larkin Scaffolding Bypass)",
    origin_name: "Geary Blvd & Van Ness Ave",
    destination_name: "Geary Blvd & Leavenworth St",
    origin_node_id: "INT_GEARY_VAN_NESS",
    destination_node_id: "INT_GEARY_LEAVENWORTH",
    mode: "MINIMIZE_HAZARDS",
    status: "Rerouted via Sutter St Parallel Corridor",
    is_reachable: true,
    total_distance_km: 1.12,
    total_distance_meters: 1120.4,
    total_travel_time_minutes: 2.1,
    total_travel_time_seconds: 126.0,
    travel_time_supported: true,
    avoided_hazards: [
      {
        incident_id: "DEMO-INC-102",
        title: "Structural Scaffolding Collapse",
        hazard_type: "hazard",
        status: "CORROBORATED",
        severity: "medium",
        location_name: "Geary Blvd at Larkin",
        reason: "Minimized hazard risk exposure by bypassing single-lane constriction"
      }
    ],
    cautions: [],
    route_change_explanation: "Route detoured via Van Ness Ave and Sutter St to minimize hazard exposure to scaffolding collapse on Geary Blvd. Distance changed by +228 m.",
    safety_disclaimer: "Route conditions are dynamic and subject to ongoing field hazards. No route can be guaranteed completely safe; field units must exercise tactical caution.",
    last_data_update: "2026-10-10T06:30:00Z",
    coordinates: [
      [37.7855, -122.4215],
      [37.7880, -122.4225],
      [37.7885, -122.4175],
      [37.7890, -122.4150],
      [37.7865, -122.4145]
    ]
  },
  {
    id: "PRESET-CORRIDOR-3",
    name: "Castro Community Hub to Market Civic Center",
    origin_name: "Castro St & 18th St",
    destination_name: "Market St & 11th St",
    origin_node_id: "INT_CASTRO_18TH",
    destination_node_id: "INT_MARKET_11TH",
    mode: "AVOID_CONFIRMED_CLOSURES",
    status: "Open with Visible Caution (Dark Signals)",
    is_reachable: true,
    total_distance_km: 1.84,
    total_distance_meters: 1840.0,
    total_travel_time_minutes: 3.4,
    total_travel_time_seconds: 204.0,
    travel_time_supported: true,
    avoided_hazards: [],
    cautions: [
      {
        incident_id: "DEMO-INC-103",
        title: "Traffic Signals Out at Multi-Way Junction",
        status: "UNVERIFIED",
        severity: "medium",
        location_name: "18th St & Castro St",
        message: "Visible Caution: Unverified community report (Traffic Signals Out) located within 15m of origin. Road remains open; proceed with heightened field vigilance.",
        distance_to_route_meters: 15.0
      }
    ],
    route_change_explanation: "Optimal direct route selected; no confirmed road closures intersect this corridor. Road remains fully open despite unverified community signal report.",
    safety_disclaimer: "Route conditions are dynamic and subject to ongoing field hazards. No route can be guaranteed completely safe; field units must exercise tactical caution.",
    last_data_update: "2026-10-10T06:30:00Z",
    coordinates: [
      [37.7600, -122.4350],
      [37.7628, -122.4351],
      [37.7668, -122.4290],
      [37.7753, -122.4194],
      [37.7760, -122.4182]
    ]
  }
];

export const ABOUT_DATA_SPECS = {
  title: "About RouteRescue Data Infrastructure",
  version: "5.0.0-sprint5",
  environment: "Demonstration & Development Prototype",
  principles: [
    {
      title: "Source-Independent Ingestion & Multi-Feed Adapters",
      desc: "Data collection is decoupled through modular adapters (CAD dispatch demo, NOAA/NWS alerts, Twitter API v2, Reddit OAuth). Feeds normalize incoming records into canonical schemas while preserving original source identifiers, URLs, publication times, and fetch times."
    },
    {
      title: "Accessible Official Weather & Hazard Alerts (NOAA / NWS)",
      desc: "Primary integration leverages documented public government alert endpoints (api.weather.gov) with standard User-Agent headers. Flash flood warnings, high wind advisories, and severe weather polygons are ingested with polygon centroid geocoding."
    },
    {
      title: "Authorized Social Media Retrieval (Zero Scraping Policy)",
      desc: "Social media signals are collected strictly through official developer APIs (Bearer token / OAuth). Web scraping, reverse-engineered tokens, and platform control bypasses are strictly prohibited. When credentials are unconfigured, integrations remain safely disabled with documented setup requirements."
    },
    {
      title: "Location Uncertainty Marking for Operator Review",
      desc: "When feeds provide broad forecast zones, polygon boundaries, or text keywords rather than exact street intersection pins, records are explicitly flagged with location_uncertain = true and a review explanation. Dispatchers review coordinates before heavy vehicle assignment."
    },
    {
      title: "Repeat Ingestion Deduplication & Bounded Retries",
      desc: "Periodic polling deduplicates existing records by external feed record key, refreshing ingestion timestamps and audit history without cloning records in storage. Network calls enforce strict timeouts (8s) and bounded retries with rate-limit backoff (HTTP 429)."
    },
    {
      title: "Transparent Per-Source Health & Cached-Data Labels",
      desc: "System never invents API responses or silently substitutes demo data for failed live feeds. Live status (HEALTHY, DEGRADED, RATE_LIMITED, ERROR, DISABLED) is tracked per source. When cached data is served, records are explicitly labeled with is_cached = true and cached_at."
    },
    {
      title: "Hazard-Aware Graph Routing (Dijkstra & A*)",
      desc: "Routes are calculated dynamically over an explicit road network graph where nodes represent physical intersections and edges include calculated distance, speed limits, optional travel times, and hazard metadata. Real Dijkstra and A* algorithms evaluate optimal paths."
    },
    {
      title: "Unverified Reports Generate Cautions, Never Close Roads",
      desc: "In accordance with strict verification ethics, unverified social reports NEVER automatically close or sever roads. When a calculated route passes near an unverified report, the system emits a prominent visible caution notice while keeping the corridor fully open."
    },
    {
      title: "Epistemic Safety: No Route is Guaranteed Safe",
      desc: "RouteRescue never claims a calculated route is '100% safe' or invents arbitrary safety percentages. If data or graph connectivity is insufficient, the system explicitly reports so with diagnostic reasons."
    }
  ],
  dataFields: [
    { field: "source_feed_id", type: "string", description: "Originating data feed identifier (demo-feed, nws-weather-alerts, twitter, reddit)" },
    { field: "external_record_id", type: "string", description: "Primary record identifier from source external API" },
    { field: "location_uncertain", type: "boolean", description: "Flag indicating whether coordinates are broad, centroid-calculated, or require dispatcher review" },
    { field: "location_review_reason", type: "string | null", description: "Diagnostic explanation for location uncertainty" },
    { field: "is_cached", type: "boolean", description: "Indicates whether record was loaded from local feed cache rather than live response" },
    { field: "cached_at", type: "ISO 8601 string | null", description: "Timestamp when cached response was originally retrieved" },
    { field: "source_url", type: "string (URL)", description: "Preserved original public bulletin URL or permalink" },
    { field: "published_at", type: "ISO 8601 string", description: "Preserved original publication timestamp from source agency" },
    { field: "ingested_at", type: "ISO 8601 string", description: "System timestamp when record was fetched and normalized" },
    { field: "route_id", type: "string", description: "Unique route calculation identifier" },
    { field: "mode", type: "enum (SHORTEST|AVOID_CONFIRMED_CLOSURES|MINIMIZE_HAZARDS)", description: "Pathfinding cost model" },
    { field: "travel_time_supported", type: "boolean", description: "Flag indicating whether travel time data is supported on all segments" },
    { field: "route_change_explanation", type: "string", description: "Plain-English explanation of why this route was selected or changed" },
    { field: "safety_disclaimer", type: "string", description: "Mandatory disclaimer noting conditions are dynamic and not guaranteed safe" }
  ]
};
