import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.config import (
    FIRESTORE_COLLECTION,
    FIRESTORE_PROJECT_ID,
    FRESHNESS_STALE_HOURS,
    GOOGLE_APPLICATION_CREDENTIALS,
)
from app.models import (
    EvidenceCreate,
    HazardCategory,
    IncidentCreate,
    IncidentStatus,
    SeverityLevel,
)
from app.verification import (
    evaluate_evidence_and_rules,
    is_official_source,
    is_repost_content,
    validate_status_transition,
)

logger = logging.getLogger("routerescue.storage")


def _normalize_incident_dict(d: dict, storage_label: str, all_incidents: Optional[List[dict]] = None) -> dict:
    """
    Ensures full parity across snake_case, camelCase, and Sprint 3
    evidence-aware verification fields.
    """
    lat = float(d.get("latitude", d.get("lat", 0.0)))
    lng = float(d.get("longitude", d.get("lng", 0.0)))
    hazard_type = str(d.get("hazard_type", d.get("type", "hazard"))).lower()
    severity = str(d.get("severity", "medium")).lower()
    raw_status = str(d.get("status", "UNVERIFIED")).upper()
    try:
        status_enum = IncidentStatus(raw_status)
    except ValueError:
        status_enum = IncidentStatus.UNVERIFIED

    loc_name = d.get("location_name") or d.get("locationName") or f"{lat:.4f}, {lng:.4f}"
    reported_at = d.get("reported_at") or d.get("reportedAt") or datetime.now(timezone.utc).isoformat()
    desc = d.get("description", "")
    title = d.get("title", "Untitled Incident")
    source = d.get("source", "DEMO DATA")
    source_url = d.get("source_url")
    routes = d.get("affected_routes", d.get("affectedRoutes", []))
    rec = d.get("recommended_action") or d.get("recommendedDetour") or "Awaiting triage"

    # Compute verified boolean for backward compatibility
    is_verified = status_enum in (IncidentStatus.CORROBORATED, IncidentStatus.OFFICIALLY_CONFIRMED)

    published_at = d.get("published_at") or reported_at
    ingested_at = d.get("ingested_at") or reported_at

    # Preserve or initialize sources_detail
    sources_detail = d.get("sources_detail")
    if not sources_detail:
        is_official = is_official_source(source_url, source)
        sources_detail = [{
            "source_id": f"SRC-{d.get('id', 'NEW')}-1",
            "source_name": source,
            "source_url": source_url,
            "published_at": published_at,
            "ingested_at": ingested_at,
            "is_official": is_official,
            "is_repost": False,
            "repost_of_source_id": None,
            "excerpt": desc[:250],
            "notes": "Initial incident report source"
        }]

    # Preserve or initialize verification_history
    verification_history = d.get("verification_history")
    if not verification_history:
        verification_history = [{
            "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
            "timestamp": ingested_at,
            "action": "INGESTION",
            "from_status": None,
            "to_status": status_enum.value,
            "actor": "System Ingestion",
            "reason": f"Initial report ingested from {source}."
        }]

    base_dict = {
        "id": d["id"],
        "title": title,
        "hazard_type": hazard_type,
        "type": hazard_type,
        "severity": severity,
        "status": status_enum.value,
        "latitude": lat,
        "longitude": lng,
        "lat": lat,
        "lng": lng,
        "location_name": loc_name,
        "locationName": loc_name,
        "description": desc,
        "source": source,
        "source_url": source_url,
        "reported_at": reported_at,
        "reportedAt": reported_at,
        "updated_at": d.get("updated_at"),
        "affected_routes": routes,
        "recommended_action": rec,
        "recommendedDetour": rec,
        "verified": is_verified,
        "storage_provenance": storage_label,
        "published_at": published_at,
        "ingested_at": ingested_at,
        "sources_detail": sources_detail,
        "verification_history": verification_history,
        "location_uncertain": bool(d.get("location_uncertain", False)),
        "location_review_reason": d.get("location_review_reason"),
        "is_cached": bool(d.get("is_cached", False)),
        "cached_at": d.get("cached_at"),
        "source_feed_id": d.get("source_feed_id"),
        "external_record_id": d.get("external_record_id"),
    }

    # Run verification rules to compute evidence summary, freshness, duplicates, conflicts
    eval_result = evaluate_evidence_and_rules(base_dict, all_incidents=all_incidents)
    base_dict["is_stale"] = eval_result["is_stale"]
    base_dict["evidence_summary"] = eval_result["evidence_summary"]
    # Preserve manually reviewed duplicates if already present, otherwise use newly evaluated
    existing_reviewed = {flag["flag_id"]: flag for flag in d.get("potential_duplicates", []) if flag.get("reviewed")}
    evaluated_dups = eval_result["potential_duplicates"]
    for idx, ed in enumerate(evaluated_dups):
        if ed["flag_id"] in existing_reviewed:
            evaluated_dups[idx] = existing_reviewed[ed["flag_id"]]
    base_dict["potential_duplicates"] = evaluated_dups
    base_dict["conflicting_reports"] = eval_result["conflicting_reports"]

    return base_dict


class IncidentRepository(ABC):
    @abstractmethod
    def list_incidents(
        self,
        status: Optional[str] = None,
        hazard_type: Optional[str] = None,
        severity: Optional[str] = None,
        is_stale: Optional[bool] = None,
    ) -> List[dict]:
        pass

    @abstractmethod
    def get_incident(self, incident_id: str) -> Optional[dict]:
        pass

    @abstractmethod
    def create_incident(self, data: IncidentCreate) -> Tuple[dict, dict]:
        pass

    @abstractmethod
    def upsert_ingested_incident(self, incident_dict: dict) -> Tuple[dict, bool]:
        pass

    @abstractmethod
    def update_status(
        self,
        incident_id: str,
        new_status: IncidentStatus,
        notes: Optional[str] = None,
        reviewer_role: Optional[str] = None,
        authorized_by: Optional[str] = None,
    ) -> Optional[dict]:
        pass

    @abstractmethod
    def add_evidence(self, incident_id: str, evidence: EvidenceCreate) -> Optional[dict]:
        pass

    @abstractmethod
    def review_duplicate(
        self,
        incident_id: str,
        flag_id: str,
        decision: str,
        notes: Optional[str] = None,
        reviewer: Optional[str] = None,
    ) -> Optional[dict]:
        pass

    @abstractmethod
    def get_storage_info(self) -> dict:
        pass


class DemoIncidentRepository(IncidentRepository):
    """
    Clearly labeled in-memory demonstration repository.
    Strictly guarantees that no claims of remote persistence are made.
    """
    def __init__(self):
        self.storage_label = "DEMO REPOSITORY (IN-MEMORY)"
        self._incidents: Dict[str, dict] = {}
        self._seed_fixtures()

    def _seed_fixtures(self):
        fixtures = [
            {
                "id": "DEMO-INC-101",
                "title": "Flooded Underpass & Road Blockage",
                "hazard_type": "flood",
                "severity": "high",
                "status": "OFFICIALLY_CONFIRMED",
                "latitude": 37.7749,
                "longitude": -122.4194,
                "location_name": "Market St & 10th Ave Underpass",
                "description": "Flash runoff collected in the depressed underpass. Depth ~1.2m. Impassable for standard emergency transit.",
                "reported_at": "2026-10-10T05:40:00Z",
                "published_at": "2026-10-10T05:35:00Z",
                "ingested_at": "2026-10-10T05:40:00Z",
                "source": "SF Municipal Transportation Agency",
                "source_url": "https://example.gov/demo-bulletin/101",
                "affected_routes": ["Market St to Mission Corridor", "10th Ave Underpass"],
                "recommended_action": "Divert via 11th Ave Elevated Flyover (+3.4 min).",
                "sources_detail": [
                    {
                        "source_id": "SRC-101-1",
                        "source_name": "SF Municipal Transportation Agency Bulletin",
                        "source_url": "https://example.gov/demo-bulletin/101",
                        "published_at": "2026-10-10T05:35:00Z",
                        "ingested_at": "2026-10-10T05:40:00Z",
                        "is_official": True,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Severe water runoff accumulation across 10th Ave underpass; both lanes closed.",
                        "notes": "Verified official municipal dispatch bulletin #101"
                    }
                ],
                "verification_history": [
                    {
                        "id": "VH-101-1",
                        "timestamp": "2026-10-10T05:40:00Z",
                        "action": "INGESTION",
                        "from_status": None,
                        "to_status": "UNVERIFIED",
                        "actor": "Municipal Dispatch Ingestion Feed",
                        "reason": "Official transportation bulletin received via https://example.gov/demo-bulletin/101."
                    },
                    {
                        "id": "VH-101-2",
                        "timestamp": "2026-10-10T05:40:02Z",
                        "action": "RULE_EVALUATION",
                        "from_status": "UNVERIFIED",
                        "to_status": "OFFICIALLY_CONFIRMED",
                        "actor": "VerificationRuleEngine",
                        "reason": "Transitioned to OFFICIALLY_CONFIRMED: Authorized official government authority verified (example.gov)."
                    }
                ]
            },
            {
                "id": "DEMO-INC-102",
                "title": "Structural Scaffolding Collapse",
                "hazard_type": "hazard",
                "severity": "medium",
                "status": "CORROBORATED",
                "latitude": 37.7833,
                "longitude": -122.4167,
                "location_name": "Geary Blvd Eastbound at Larkin",
                "description": "Commercial building scaffolding collapsed into outer lanes. Single lane squeeze restricted to 20 km/h.",
                "reported_at": "2026-10-10T06:12:00Z",
                "published_at": "2026-10-10T06:10:00Z",
                "ingested_at": "2026-10-10T06:12:00Z",
                "source": "Traffic Alert Radio & Field Spotters",
                "source_url": None,
                "affected_routes": ["Geary Blvd Eastbound"],
                "recommended_action": "Heavy rescue vehicles reroute via Sutter St.",
                "sources_detail": [
                    {
                        "source_id": "SRC-102-1",
                        "source_name": "Field Spotter Alert (Unit 12)",
                        "source_url": None,
                        "published_at": "2026-10-10T06:10:00Z",
                        "ingested_at": "2026-10-10T06:12:00Z",
                        "is_official": False,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Scaffolding pipes fallen across sidewalk and curb lane on Geary.",
                        "notes": "First independent field sighting"
                    },
                    {
                        "source_id": "SRC-102-2",
                        "source_name": "Commercial Transit Driver Report",
                        "source_url": None,
                        "published_at": "2026-10-10T06:18:00Z",
                        "ingested_at": "2026-10-10T06:20:00Z",
                        "is_official": False,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Heavy debris and scaffolding blocking eastbound right lane at Larkin.",
                        "notes": "Second independent eyewitness confirmation"
                    },
                    {
                        "source_id": "SRC-102-3",
                        "source_name": "Social Channel Repost",
                        "source_url": None,
                        "published_at": "2026-10-10T06:25:00Z",
                        "ingested_at": "2026-10-10T06:26:00Z",
                        "is_official": False,
                        "is_repost": True,
                        "repost_of_source_id": "SRC-102-1",
                        "excerpt": "RT @alert_sf Scaffolding collapsed on Geary at Larkin, avoid right lane.",
                        "notes": "Identified as repost; excluded from independent corroboration tally"
                    }
                ],
                "verification_history": [
                    {
                        "id": "VH-102-1",
                        "timestamp": "2026-10-10T06:12:00Z",
                        "action": "INGESTION",
                        "from_status": None,
                        "to_status": "UNVERIFIED",
                        "actor": "Field Spotter Intake",
                        "reason": "Initial report submitted by Field Spotter."
                    },
                    {
                        "id": "VH-102-2",
                        "timestamp": "2026-10-10T06:20:00Z",
                        "action": "SOURCE_CORROBORATION",
                        "from_status": "UNVERIFIED",
                        "to_status": "CORROBORATED",
                        "actor": "VerificationRuleEngine",
                        "reason": "Transitioned to CORROBORATED: 2 independent sources aligned within 400m and 10 min."
                    },
                    {
                        "id": "VH-102-3",
                        "timestamp": "2026-10-10T06:26:00Z",
                        "action": "REPOST_FILTERED",
                        "from_status": "CORROBORATED",
                        "to_status": "CORROBORATED",
                        "actor": "VerificationRuleEngine",
                        "reason": "Third report detected as RT/quote attribution; marked as repost without inflating count."
                    }
                ]
            },
            {
                "id": "DEMO-INC-103",
                "title": "Signal Controller Failure & Hospital Gridlock",
                "hazard_type": "congestion",
                "severity": "high",
                "status": "UNVERIFIED",
                "latitude": 37.7650,
                "longitude": -122.4320,
                "location_name": "Castro & 18th St Medical Corridor",
                "description": "Traffic signal controller offline. Intersection deadlocked in all four directions, impacting primary access route to Memorial Hospital Emergency Wing.",
                "reported_at": "2026-10-10T06:25:00Z",
                "published_at": "2026-10-10T06:22:00Z",
                "ingested_at": "2026-10-10T06:25:00Z",
                "source": "Citizen Community Report",
                "source_url": None,
                "affected_routes": ["Castro St Corridor", "18th St Cross-town"],
                "recommended_action": "Use Sanchez St to 19th St. Manual traffic warden deployed.",
                "sources_detail": [
                    {
                        "source_id": "SRC-103-1",
                        "source_name": "Citizen Community Report",
                        "source_url": None,
                        "published_at": "2026-10-10T06:22:00Z",
                        "ingested_at": "2026-10-10T06:25:00Z",
                        "is_official": False,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Lights flashing dark, traffic jammed around 18th & Castro near hospital.",
                        "notes": "Single source report awaiting corroboration"
                    }
                ],
                "verification_history": [
                    {
                        "id": "VH-103-1",
                        "timestamp": "2026-10-10T06:25:00Z",
                        "action": "INGESTION",
                        "from_status": None,
                        "to_status": "UNVERIFIED",
                        "actor": "Community Intake Portal",
                        "reason": "Single community submission received. Missing secondary corroboration; status remains UNVERIFIED."
                    }
                ]
            },
            {
                "id": "DEMO-INC-104",
                "title": "Fallen Utility Line - Hazard Cleared",
                "hazard_type": "infrastructure",
                "severity": "low",
                "status": "RESOLVED",
                "latitude": 37.7910,
                "longitude": -122.4010,
                "location_name": "Embarcadero Pier 14 Access",
                "description": "Downed low-voltage telecommunication cable was secured and safely removed by city electrical crew. Normal traffic restored.",
                "reported_at": "2026-10-10T04:15:00Z",
                "published_at": "2026-10-10T04:10:00Z",
                "ingested_at": "2026-10-10T04:15:00Z",
                "source": "City Electrical Crew Dispatch",
                "source_url": "https://example.gov/demo-bulletin/104",
                "affected_routes": ["Embarcadero Southbound Service Lane"],
                "recommended_action": "All lanes clear; proceed normally.",
                "sources_detail": [
                    {
                        "source_id": "SRC-104-1",
                        "source_name": "City Electrical Utility Crew Dispatch",
                        "source_url": "https://example.gov/demo-bulletin/104",
                        "published_at": "2026-10-10T04:10:00Z",
                        "ingested_at": "2026-10-10T04:15:00Z",
                        "is_official": True,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Telecommunication line cleared and verified safe by City Electrical Crew #7.",
                        "notes": "Official municipal work completion record"
                    }
                ],
                "verification_history": [
                    {
                        "id": "VH-104-1",
                        "timestamp": "2026-10-10T04:15:00Z",
                        "action": "INGESTION",
                        "from_status": None,
                        "to_status": "OFFICIALLY_CONFIRMED",
                        "actor": "City Utility Portal",
                        "reason": "Ingested from official utility bulletin."
                    },
                    {
                        "id": "VH-104-2",
                        "timestamp": "2026-10-10T05:00:00Z",
                        "action": "STATUS_TRANSITION",
                        "from_status": "OFFICIALLY_CONFIRMED",
                        "to_status": "RESOLVED",
                        "actor": "On-Scene Supervisor #7",
                        "reason": "Hazard fully cleared and lanes opened to public."
                    }
                ]
            },
            {
                "id": "DEMO-INC-105",
                "title": "Chemical / Gas Leak Exclusion Zone",
                "hazard_type": "fire",
                "severity": "critical",
                "status": "OFFICIALLY_CONFIRMED",
                "latitude": 37.7580,
                "longitude": -122.4140,
                "location_name": "Valencia St between 20th & 22nd",
                "description": "Ruptured natural gas distribution main. Fire Department incident command has established a mandatory 300-meter exclusion zone. All thoroughfares impassable.",
                "reported_at": "2026-10-10T06:35:00Z",
                "published_at": "2026-10-10T06:30:00Z",
                "ingested_at": "2026-10-10T06:35:00Z",
                "source": "SF Fire Department Command",
                "source_url": "https://example.gov/demo-dispatch/105",
                "affected_routes": ["Valencia St", "Mission St (Partial)", "21st St"],
                "recommended_action": "Strict detour via South Van Ness Ave or Guerrero St.",
                "sources_detail": [
                    {
                        "source_id": "SRC-105-1",
                        "source_name": "SF Fire Department Command Bulletin",
                        "source_url": "https://example.gov/demo-dispatch/105",
                        "published_at": "2026-10-10T06:30:00Z",
                        "ingested_at": "2026-10-10T06:35:00Z",
                        "is_official": True,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Mandatory 300-meter exclusion perimeter established around natural gas leak.",
                        "notes": "Authorized emergency command advisory #105"
                    }
                ],
                "verification_history": [
                    {
                        "id": "VH-105-1",
                        "timestamp": "2026-10-10T06:35:00Z",
                        "action": "INGESTION",
                        "from_status": None,
                        "to_status": "UNVERIFIED",
                        "actor": "Incident Command Gateway",
                        "reason": "Emergency bulletin ingested from official dispatch source."
                    },
                    {
                        "id": "VH-105-2",
                        "timestamp": "2026-10-10T06:35:02Z",
                        "action": "RULE_EVALUATION",
                        "from_status": "UNVERIFIED",
                        "to_status": "OFFICIALLY_CONFIRMED",
                        "actor": "VerificationRuleEngine",
                        "reason": "Transitioned to OFFICIALLY_CONFIRMED: Authorized official emergency agency confirmed (SF Fire Department)."
                    }
                ]
            },
            {
                # Demonstrates DUPLICATE FLAGGING against DEMO-INC-101 (within 150m, same hazard, similar text, close time)
                "id": "DEMO-INC-106",
                "title": "Flooded Roadway at 9th and Market",
                "hazard_type": "flood",
                "severity": "high",
                "status": "UNVERIFIED",
                "latitude": 37.7760,
                "longitude": -122.4180,
                "location_name": "Market St & 9th Ave Junction",
                "description": "Flash runoff and water buildup across depressed lower underpass near 9th and Market. Impassable road blockage.",
                "reported_at": "2026-10-10T05:50:00Z",
                "published_at": "2026-10-10T05:48:00Z",
                "ingested_at": "2026-10-10T05:50:00Z",
                "source": "Local Taxi Fleet Radio",
                "source_url": None,
                "affected_routes": ["Market St Lower Lanes"],
                "recommended_action": "Avoid Market St lower lanes.",
                "sources_detail": [
                    {
                        "source_id": "SRC-106-1",
                        "source_name": "Local Taxi Fleet Radio",
                        "source_url": None,
                        "published_at": "2026-10-10T05:48:00Z",
                        "ingested_at": "2026-10-10T05:50:00Z",
                        "is_official": False,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Severe water pooling and underpass flooded near 9th & Market.",
                        "notes": "Commercial fleet witness"
                    }
                ],
                "verification_history": [
                    {
                        "id": "VH-106-1",
                        "timestamp": "2026-10-10T05:50:00Z",
                        "action": "INGESTION",
                        "from_status": None,
                        "to_status": "UNVERIFIED",
                        "actor": "Commercial Fleet Intake",
                        "reason": "Initial report received."
                    },
                    {
                        "id": "VH-106-2",
                        "timestamp": "2026-10-10T05:50:02Z",
                        "action": "DUPLICATE_FLAGGED",
                        "from_status": "UNVERIFIED",
                        "to_status": "UNVERIFIED",
                        "actor": "VerificationRuleEngine",
                        "reason": "Potential duplicate flagged with DEMO-INC-101 (185m away, matching flood hazard, 10 min window). Record preserved separately pending operator review."
                    }
                ]
            },
            {
                # Demonstrates STALE REPORT FLAGGING (published > 15 hours ago)
                "id": "DEMO-INC-107",
                "title": "Fallen Tree Branch Leaning Over Outer Lane",
                "hazard_type": "hazard",
                "severity": "low",
                "status": "UNVERIFIED",
                "latitude": 37.7420,
                "longitude": -122.4450,
                "location_name": "Portola Dr & Woodside Ave",
                "description": "Large eucalyptus branch hanging into outer lane. Minor hazard for tall emergency vehicles.",
                "reported_at": "2026-10-09T17:30:00Z",
                "published_at": "2026-10-09T17:20:00Z",
                "ingested_at": "2026-10-09T17:30:00Z",
                "source": "Community Neighborhood Watch",
                "source_url": None,
                "affected_routes": ["Portola Dr Westbound Outer Lane"],
                "recommended_action": "Caution when navigating outer lane.",
                "sources_detail": [
                    {
                        "source_id": "SRC-107-1",
                        "source_name": "Community Neighborhood Watch",
                        "source_url": None,
                        "published_at": "2026-10-09T17:20:00Z",
                        "ingested_at": "2026-10-09T17:30:00Z",
                        "is_official": False,
                        "is_repost": False,
                        "repost_of_source_id": None,
                        "excerpt": "Hanging eucalyptus branch across outer lane.",
                        "notes": "Neighborhood watch alert"
                    }
                ],
                "verification_history": [
                    {
                        "id": "VH-107-1",
                        "timestamp": "2026-10-09T17:30:00Z",
                        "action": "INGESTION",
                        "from_status": None,
                        "to_status": "UNVERIFIED",
                        "actor": "Community Intake",
                        "reason": "Initial report submitted."
                    },
                    {
                        "id": "VH-107-2",
                        "timestamp": "2026-10-09T23:30:00Z",
                        "action": "FRESHNESS_CHECK",
                        "from_status": "UNVERIFIED",
                        "to_status": "UNVERIFIED",
                        "actor": "VerificationRuleEngine",
                        "reason": f"Age exceeded {FRESHNESS_STALE_HOURS}h threshold. Flagged as STALE pending recent verification."
                    }
                ]
            }
        ]

        # Adjust fixture timestamps dynamically relative to current runtime:
        # DEMO-INC-107 is >15 hours old (STALE), others are ~1 hour old (FRESH within 6.0h limit).
        now = datetime.now(timezone.utc)
        fresh_rep = (now - timedelta(hours=1)).isoformat()
        fresh_pub = (now - timedelta(hours=1, minutes=5)).isoformat()
        stale_rep = (now - timedelta(hours=16)).isoformat()
        stale_pub = (now - timedelta(hours=16, minutes=10)).isoformat()

        for f in fixtures:
            if f.get("id") == "DEMO-INC-107":
                f["reported_at"] = stale_rep
                f["published_at"] = stale_pub
                f["ingested_at"] = stale_rep
                if f.get("sources_detail"):
                    for s in f["sources_detail"]:
                        s["published_at"] = stale_pub
                        s["ingested_at"] = stale_rep
            else:
                f["reported_at"] = fresh_rep
                f["published_at"] = fresh_pub
                f["ingested_at"] = fresh_rep
                if f.get("sources_detail"):
                    for s in f["sources_detail"]:
                        s["published_at"] = fresh_pub
                        s["ingested_at"] = fresh_rep

        # Initial raw storage
        for f in fixtures:
            self._incidents[f["id"]] = f

    def list_incidents(
        self,
        status: Optional[str] = None,
        hazard_type: Optional[str] = None,
        severity: Optional[str] = None,
        is_stale: Optional[bool] = None,
    ) -> List[dict]:
        all_raw = list(self._incidents.values())
        # Normalize and cross-evaluate with all incidents
        results = [_normalize_incident_dict(i, self.storage_label, all_raw) for i in all_raw]

        if status:
            target_status = status.upper().strip()
            results = [i for i in results if i["status"] == target_status]

        if hazard_type:
            target_hazard = hazard_type.lower().strip()
            results = [i for i in results if i["hazard_type"] == target_hazard]

        if severity:
            target_sev = severity.lower().strip()
            results = [i for i in results if i["severity"] == target_sev]

        if is_stale is not None:
            results = [i for i in results if i.get("is_stale") is is_stale]

        # Return sorted by reported_at descending
        results.sort(key=lambda x: x.get("reported_at", ""), reverse=True)
        return results

    def get_incident(self, incident_id: str) -> Optional[dict]:
        raw = self._incidents.get(incident_id)
        if not raw:
            return None
        all_raw = list(self._incidents.values())
        return _normalize_incident_dict(raw, self.storage_label, all_raw)

    def create_incident(self, data: IncidentCreate) -> Tuple[dict, dict]:
        new_id = f"DEMO-INC-{len(self._incidents) + 101}"
        loc_name = data.location_name or f"{data.latitude:.4f}, {data.longitude:.4f}"
        now_iso = datetime.now(timezone.utc).isoformat()
        pub_iso = data.published_at or now_iso
        source_name = data.source or "DEMO DATA (USER SUBMISSION)"
        is_official = is_official_source(data.source_url, source_name)

        # Check if the submitted text or URL is a repost of existing evidence
        all_existing = list(self._incidents.values())
        existing_sources = []
        for inc in all_existing:
            existing_sources.extend(inc.get("sources_detail", []))

        is_repost, repost_reason = is_repost_content(
            data.description,
            source_url=data.source_url,
            existing_sources=existing_sources
        )

        initial_source = {
            "source_id": f"SRC-{new_id}-1",
            "source_name": source_name,
            "source_url": data.source_url,
            "published_at": pub_iso,
            "ingested_at": now_iso,
            "is_official": is_official,
            "is_repost": is_repost,
            "repost_of_source_id": None,
            "excerpt": data.description[:250],
            "notes": repost_reason or ("Verified official agency" if is_official else "Community field submission")
        }

        history = [
            {
                "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                "timestamp": now_iso,
                "action": "INGESTION",
                "from_status": None,
                "to_status": IncidentStatus.UNVERIFIED.value,
                "actor": "System Intake",
                "reason": (
                    f"Report registered via {source_name}. Preserved source URL '{data.source_url or 'N/A'}' "
                    f"and publication timestamp."
                )
            }
        ]

        if is_repost:
            history.append({
                "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                "timestamp": now_iso,
                "action": "REPOST_IDENTIFIED",
                "from_status": IncidentStatus.UNVERIFIED.value,
                "to_status": IncidentStatus.UNVERIFIED.value,
                "actor": "VerificationRuleEngine",
                "reason": f"Distinguished as repost/quote: {repost_reason}. Excluded from independent corroboration count."
            })

        raw_item = {
            "id": new_id,
            "title": data.title,
            "hazard_type": data.hazard_type.value,
            "severity": data.severity.value,
            "status": IncidentStatus.UNVERIFIED.value,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "location_name": loc_name,
            "description": data.description,
            "reported_at": now_iso,
            "published_at": pub_iso,
            "ingested_at": now_iso,
            "source": source_name,
            "source_url": data.source_url,
            "affected_routes": [loc_name],
            "recommended_action": "Initial community report received; awaiting independent corroboration or dispatch triage.",
            "sources_detail": [initial_source],
            "verification_history": history,
            "potential_duplicates": [],
            "conflicting_reports": [],
        }

        self._incidents[new_id] = raw_item
        normalized = _normalize_incident_dict(raw_item, self.storage_label, list(self._incidents.values()))

        # If duplicate flags were identified, record them into verification history
        if normalized.get("potential_duplicates"):
            dup_count = len(normalized["potential_duplicates"])
            raw_item["verification_history"].append({
                "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                "timestamp": now_iso,
                "action": "DUPLICATE_FLAGGED",
                "from_status": IncidentStatus.UNVERIFIED.value,
                "to_status": IncidentStatus.UNVERIFIED.value,
                "actor": "VerificationRuleEngine",
                "reason": (
                    f"{dup_count} potential duplicate report(s) flagged based on geographic proximity, "
                    f"hazard category, text similarity, and time window. Kept separate without automatic merge."
                )
            })
            normalized = _normalize_incident_dict(raw_item, self.storage_label, list(self._incidents.values()))

        storage_meta = {
            "storage_backend": "demo_repository",
            "is_remote": False,
            "saved_remotely": False,
            "message": "Incident stored in local in-memory demo repository (DEMO DATA). Notice: Remote Firestore credentials are not configured, so data was NOT saved remotely.",
        }
        return normalized, storage_meta

    def upsert_ingested_incident(self, incident_dict: dict) -> Tuple[dict, bool]:
        inc_id = incident_dict["id"]
        is_new = inc_id not in self._incidents
        self._incidents[inc_id] = incident_dict
        normalized = _normalize_incident_dict(incident_dict, self.storage_label, list(self._incidents.values()))
        return normalized, is_new

    def update_status(
        self,
        incident_id: str,
        new_status: IncidentStatus,
        notes: Optional[str] = None,
        reviewer_role: Optional[str] = None,
        authorized_by: Optional[str] = None,
    ) -> Optional[dict]:
        if incident_id not in self._incidents:
            return None

        inc = self._incidents[incident_id]
        current_status = IncidentStatus(inc.get("status", "UNVERIFIED"))

        # Check official source presence
        sources = inc.get("sources_detail", [])
        has_official = any(s.get("is_official") for s in sources) or is_official_source(inc.get("source_url"), inc.get("source"))

        # Validate transition according to Sprint 3 rules
        is_valid, transition_reason = validate_status_transition(
            current_status=current_status,
            target_status=new_status,
            has_official_source=has_official,
            is_authorized_review=True,
            review_notes=notes,
        )
        if not is_valid:
            raise ValueError(transition_reason)

        now_iso = datetime.now(timezone.utc).isoformat()
        inc["status"] = new_status.value
        inc["updated_at"] = now_iso
        if notes:
            inc["recommended_action"] = f"[{new_status.value}] {notes}"
        inc["verified"] = new_status in (IncidentStatus.CORROBORATED, IncidentStatus.OFFICIALLY_CONFIRMED)

        # Append to verification history
        actor_label = f"Authorized Reviewer ({reviewer_role or 'Operator'})"
        if authorized_by:
            actor_label += f" [Auth: {authorized_by}]"

        reason_text = notes or f"Status transitioned from {current_status.value} to {new_status.value}."
        if new_status == IncidentStatus.OFFICIALLY_CONFIRMED:
            reason_text += " Verified by authorized official authority / explicit review."

        inc.setdefault("verification_history", []).append({
            "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
            "timestamp": now_iso,
            "action": "STATUS_TRANSITION",
            "from_status": current_status.value,
            "to_status": new_status.value,
            "actor": actor_label,
            "reason": reason_text
        })

        return _normalize_incident_dict(inc, self.storage_label, list(self._incidents.values()))

    def add_evidence(self, incident_id: str, evidence: EvidenceCreate) -> Optional[dict]:
        if incident_id not in self._incidents:
            return None

        inc = self._incidents[incident_id]
        now_iso = datetime.now(timezone.utc).isoformat()
        pub_iso = evidence.published_at or now_iso
        is_official = is_official_source(evidence.source_url, evidence.source_name)

        existing_sources = inc.get("sources_detail", [])
        # Evaluate repost if not explicitly specified
        is_repost = evidence.is_repost
        repost_reason = None
        if not is_repost:
            is_repost, repost_reason = is_repost_content(
                evidence.excerpt,
                source_url=evidence.source_url,
                existing_sources=existing_sources
            )

        new_source_id = f"SRC-{incident_id}-{len(existing_sources) + 1}"
        new_source = {
            "source_id": new_source_id,
            "source_name": evidence.source_name,
            "source_url": evidence.source_url,
            "published_at": pub_iso,
            "ingested_at": now_iso,
            "is_official": is_official,
            "is_repost": is_repost,
            "repost_of_source_id": evidence.repost_of_source_id,
            "excerpt": evidence.excerpt,
            "notes": evidence.notes or repost_reason or ("Official source" if is_official else "Corroborating report")
        }

        existing_sources.append(new_source)
        inc["sources_detail"] = existing_sources

        # Append to verification history
        history = inc.setdefault("verification_history", [])
        history.append({
            "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
            "timestamp": now_iso,
            "action": "EVIDENCE_ADDED",
            "from_status": inc.get("status"),
            "to_status": inc.get("status"),
            "actor": "Evidence Ingestion",
            "reason": (
                f"Source '{evidence.source_name}' added ({'Repost' if is_repost else 'Independent Source'}). "
                f"Preserved publication timestamp {pub_iso} and ingestion time."
            )
        })

        # Rule evaluation: if incident is UNVERIFIED and now has >= 2 independent sources,
        # can suggest or transition to CORROBORATED
        independent_sources = [s for s in existing_sources if not s.get("is_repost")]
        if inc.get("status") == IncidentStatus.UNVERIFIED.value and len(independent_sources) >= 2:
            inc["status"] = IncidentStatus.CORROBORATED.value
            inc["verified"] = True
            history.append({
                "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                "timestamp": now_iso,
                "action": "RULE_CORROBORATION",
                "from_status": IncidentStatus.UNVERIFIED.value,
                "to_status": IncidentStatus.CORROBORATED.value,
                "actor": "VerificationRuleEngine",
                "reason": f"Automatically corroborated: Reached {len(independent_sources)} independent non-repost sources."
            })

        return _normalize_incident_dict(inc, self.storage_label, list(self._incidents.values()))

    def review_duplicate(
        self,
        incident_id: str,
        flag_id: str,
        decision: str,
        notes: Optional[str] = None,
        reviewer: Optional[str] = None,
    ) -> Optional[dict]:
        if incident_id not in self._incidents:
            return None

        inc = self._incidents[incident_id]
        now_iso = datetime.now(timezone.utc).isoformat()
        dups = inc.get("potential_duplicates", [])

        # Update flag
        matched = False
        for flag in dups:
            if flag.get("flag_id") == flag_id or flag.get("target_incident_id") == flag_id:
                flag["reviewed"] = True
                flag["review_decision"] = decision
                flag["reviewed_by"] = reviewer or "Authorized Dispatcher"
                matched = True
                break

        if not matched:
            # Create a flag entry for tracking if it was generated on the fly
            dups.append({
                "flag_id": flag_id,
                "target_incident_id": flag_id,
                "reviewed": True,
                "review_decision": decision,
                "reviewed_by": reviewer or "Authorized Dispatcher",
                "flagged_at": now_iso,
                "distance_meters": 0.0,
                "time_diff_minutes": 0.0,
                "text_similarity": 0.0,
                "hazard_match": True,
                "reasons": ["Manual operator review"]
            })

        inc["potential_duplicates"] = dups

        # Log to verification history
        inc.setdefault("verification_history", []).append({
            "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
            "timestamp": now_iso,
            "action": "DUPLICATE_REVIEWED",
            "from_status": inc.get("status"),
            "to_status": inc.get("status"),
            "actor": reviewer or "Authorized Dispatcher",
            "reason": (
                f"Duplicate review completed: {decision}. "
                f"Policy note: Individual records remain separate and unmerged for transparent auditability. "
                f"{notes or ''}".strip()
            )
        })

        return _normalize_incident_dict(inc, self.storage_label, list(self._incidents.values()))

    def get_storage_info(self) -> dict:
        return {
            "storage_backend": "demo_repository",
            "is_remote": False,
            "label": "Local Demo Repository (In-Memory)",
            "storage_notice": "Operating on in-memory demo repository. No remote Firestore credentials configured. Data is stored locally for this demonstration session.",
        }


class FirestoreIncidentRepository(IncidentRepository):
    """
    Cloud Firestore integration using backend-only credentials.
    Reads and writes to Google Cloud Firestore collection.
    """
    def __init__(self, client):
        self.client = client
        self.collection_name = FIRESTORE_COLLECTION
        self.storage_label = "GOOGLE CLOUD FIRESTORE"

    def _fetch_all_raw(self) -> List[dict]:
        col_ref = self.client.collection(self.collection_name)
        docs = col_ref.stream()
        results = []
        for doc in docs:
            d = doc.to_dict()
            d["id"] = doc.id
            results.append(d)
        return results

    def list_incidents(
        self,
        status: Optional[str] = None,
        hazard_type: Optional[str] = None,
        severity: Optional[str] = None,
        is_stale: Optional[bool] = None,
    ) -> List[dict]:
        all_raw = self._fetch_all_raw()
        results = [_normalize_incident_dict(d, self.storage_label, all_raw) for d in all_raw]

        if status:
            query_status = status.upper().strip()
            results = [i for i in results if i["status"] == query_status]
        if hazard_type:
            query_hazard = hazard_type.lower().strip()
            results = [i for i in results if i["hazard_type"] == query_hazard]
        if severity:
            query_sev = severity.lower().strip()
            results = [i for i in results if i["severity"] == query_sev]
        if is_stale is not None:
            results = [i for i in results if i.get("is_stale") is is_stale]

        results.sort(key=lambda x: x.get("reported_at", ""), reverse=True)
        return results

    def get_incident(self, incident_id: str) -> Optional[dict]:
        doc_ref = self.client.collection(self.collection_name).document(incident_id)
        doc = doc_ref.get()
        if not doc.exists:
            return None
        d = doc.to_dict()
        d["id"] = doc.id
        all_raw = self._fetch_all_raw()
        return _normalize_incident_dict(d, self.storage_label, all_raw)

    def create_incident(self, data: IncidentCreate) -> Tuple[dict, dict]:
        col_ref = self.client.collection(self.collection_name)
        new_id = f"FS-INC-{uuid.uuid4().hex[:8].upper()}"
        loc_name = data.location_name or f"{data.latitude:.4f}, {data.longitude:.4f}"
        now_iso = datetime.now(timezone.utc).isoformat()
        pub_iso = data.published_at or now_iso
        source_name = data.source or "Cloud Incident Report"
        is_official = is_official_source(data.source_url, source_name)

        initial_source = {
            "source_id": f"SRC-{new_id}-1",
            "source_name": source_name,
            "source_url": data.source_url,
            "published_at": pub_iso,
            "ingested_at": now_iso,
            "is_official": is_official,
            "is_repost": False,
            "repost_of_source_id": None,
            "excerpt": data.description[:250],
            "notes": "Initial Firestore incident report provenance record"
        }

        doc_data = {
            "title": data.title,
            "hazard_type": data.hazard_type.value,
            "severity": data.severity.value,
            "status": IncidentStatus.UNVERIFIED.value,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "location_name": loc_name,
            "description": data.description,
            "reported_at": now_iso,
            "published_at": pub_iso,
            "ingested_at": now_iso,
            "source": source_name,
            "source_url": data.source_url,
            "affected_routes": [loc_name],
            "recommended_action": "Initial field submission recorded in Firestore.",
            "sources_detail": [initial_source],
            "verification_history": [
                {
                    "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                    "timestamp": now_iso,
                    "action": "INGESTION",
                    "from_status": None,
                    "to_status": IncidentStatus.UNVERIFIED.value,
                    "actor": "Cloud Firestore Ingestion",
                    "reason": f"Incident recorded with preserved publication and ingestion timestamps."
                }
            ],
            "potential_duplicates": [],
            "conflicting_reports": [],
        }

        col_ref.document(new_id).set(doc_data)
        doc_data["id"] = new_id
        all_raw = self._fetch_all_raw()
        normalized = _normalize_incident_dict(doc_data, self.storage_label, all_raw)

        storage_meta = {
            "storage_backend": "firestore",
            "is_remote": True,
            "saved_remotely": True,
            "message": "Incident successfully saved to Google Cloud Firestore.",
        }
        return normalized, storage_meta

    def upsert_ingested_incident(self, incident_dict: dict) -> Tuple[dict, bool]:
        inc_id = incident_dict["id"]
        doc_ref = self.client.collection(self.collection_name).document(inc_id)
        doc = doc_ref.get()
        is_new = not doc.exists
        doc_ref.set(incident_dict)
        all_raw = self._fetch_all_raw()
        normalized = _normalize_incident_dict(incident_dict, self.storage_label, all_raw)
        return normalized, is_new

    def update_status(
        self,
        incident_id: str,
        new_status: IncidentStatus,
        notes: Optional[str] = None,
        reviewer_role: Optional[str] = None,
        authorized_by: Optional[str] = None,
    ) -> Optional[dict]:
        doc_ref = self.client.collection(self.collection_name).document(incident_id)
        doc = doc_ref.get()
        if not doc.exists:
            return None

        d = doc.to_dict()
        current_status = IncidentStatus(d.get("status", "UNVERIFIED"))
        sources = d.get("sources_detail", [])
        has_official = any(s.get("is_official") for s in sources) or is_official_source(d.get("source_url"), d.get("source"))

        is_valid, transition_reason = validate_status_transition(
            current_status=current_status,
            target_status=new_status,
            has_official_source=has_official,
            is_authorized_review=True,
            review_notes=notes,
        )
        if not is_valid:
            raise ValueError(transition_reason)

        now_iso = datetime.now(timezone.utc).isoformat()
        history = d.get("verification_history", [])
        actor_label = f"Authorized Reviewer ({reviewer_role or 'Operator'})"
        if authorized_by:
            actor_label += f" [Auth: {authorized_by}]"

        reason_text = notes or f"Status transitioned from {current_status.value} to {new_status.value}."
        if new_status == IncidentStatus.OFFICIALLY_CONFIRMED:
            reason_text += " Verified by authorized official authority / explicit review."

        history.append({
            "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
            "timestamp": now_iso,
            "action": "STATUS_TRANSITION",
            "from_status": current_status.value,
            "to_status": new_status.value,
            "actor": actor_label,
            "reason": reason_text
        })

        update_data = {
            "status": new_status.value,
            "updated_at": now_iso,
            "verification_history": history,
        }
        if notes:
            update_data["recommended_action"] = f"[{new_status.value}] {notes}"

        doc_ref.update(update_data)
        return self.get_incident(incident_id)

    def add_evidence(self, incident_id: str, evidence: EvidenceCreate) -> Optional[dict]:
        doc_ref = self.client.collection(self.collection_name).document(incident_id)
        doc = doc_ref.get()
        if not doc.exists:
            return None

        d = doc.to_dict()
        now_iso = datetime.now(timezone.utc).isoformat()
        pub_iso = evidence.published_at or now_iso
        is_official = is_official_source(evidence.source_url, evidence.source_name)
        existing_sources = d.get("sources_detail", [])

        is_repost = evidence.is_repost
        repost_reason = None
        if not is_repost:
            is_repost, repost_reason = is_repost_content(
                evidence.excerpt,
                source_url=evidence.source_url,
                existing_sources=existing_sources
            )

        new_source = {
            "source_id": f"SRC-{incident_id}-{len(existing_sources) + 1}",
            "source_name": evidence.source_name,
            "source_url": evidence.source_url,
            "published_at": pub_iso,
            "ingested_at": now_iso,
            "is_official": is_official,
            "is_repost": is_repost,
            "repost_of_source_id": evidence.repost_of_source_id,
            "excerpt": evidence.excerpt,
            "notes": evidence.notes or repost_reason or ("Official source" if is_official else "Corroborating report")
        }
        existing_sources.append(new_source)

        history = d.get("verification_history", [])
        history.append({
            "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
            "timestamp": now_iso,
            "action": "EVIDENCE_ADDED",
            "from_status": d.get("status"),
            "to_status": d.get("status"),
            "actor": "Evidence Ingestion",
            "reason": f"Source '{evidence.source_name}' added. Preserved publication & ingestion time."
        })

        update_payload = {
            "sources_detail": existing_sources,
            "verification_history": history,
        }

        independent = [s for s in existing_sources if not s.get("is_repost")]
        if d.get("status") == IncidentStatus.UNVERIFIED.value and len(independent) >= 2:
            update_payload["status"] = IncidentStatus.CORROBORATED.value
            history.append({
                "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                "timestamp": now_iso,
                "action": "RULE_CORROBORATION",
                "from_status": IncidentStatus.UNVERIFIED.value,
                "to_status": IncidentStatus.CORROBORATED.value,
                "actor": "VerificationRuleEngine",
                "reason": f"Automatically corroborated: Reached {len(independent)} independent non-repost sources."
            })

        doc_ref.update(update_payload)
        return self.get_incident(incident_id)

    def review_duplicate(
        self,
        incident_id: str,
        flag_id: str,
        decision: str,
        notes: Optional[str] = None,
        reviewer: Optional[str] = None,
    ) -> Optional[dict]:
        doc_ref = self.client.collection(self.collection_name).document(incident_id)
        doc = doc_ref.get()
        if not doc.exists:
            return None

        d = doc.to_dict()
        now_iso = datetime.now(timezone.utc).isoformat()
        dups = d.get("potential_duplicates", [])
        for flag in dups:
            if flag.get("flag_id") == flag_id or flag.get("target_incident_id") == flag_id:
                flag["reviewed"] = True
                flag["review_decision"] = decision
                flag["reviewed_by"] = reviewer or "Authorized Dispatcher"
                break

        history = d.get("verification_history", [])
        history.append({
            "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
            "timestamp": now_iso,
            "action": "DUPLICATE_REVIEWED",
            "from_status": d.get("status"),
            "to_status": d.get("status"),
            "actor": reviewer or "Authorized Dispatcher",
            "reason": f"Duplicate review: {decision}. Records kept separate without merge. {notes or ''}".strip()
        })

        doc_ref.update({
            "potential_duplicates": dups,
            "verification_history": history
        })
        return self.get_incident(incident_id)

    def get_storage_info(self) -> dict:
        return {
            "storage_backend": "firestore",
            "is_remote": True,
            "label": "Google Cloud Firestore (Remote)",
            "storage_notice": "Connected to Google Cloud Firestore with backend-only service credentials.",
        }


# Repository Factory
_ACTIVE_REPOSITORY: Optional[IncidentRepository] = None

def get_repository() -> IncidentRepository:
    global _ACTIVE_REPOSITORY
    if _ACTIVE_REPOSITORY is not None:
        return _ACTIVE_REPOSITORY

    # Check if Firestore credentials are provided and valid
    credentials_path = GOOGLE_APPLICATION_CREDENTIALS.strip()
    if credentials_path:
        path_obj = Path(credentials_path)
        if path_obj.exists() and path_obj.is_file():
            try:
                from google.cloud import firestore
                project_id = FIRESTORE_PROJECT_ID.strip() or None
                client = firestore.Client.from_service_account_json(
                    credentials_path,
                    project=project_id,
                )
                _ = client.collection(FIRESTORE_COLLECTION).limit(1).get()
                logger.info("Successfully connected to Google Cloud Firestore with backend credentials.")
                _ACTIVE_REPOSITORY = FirestoreIncidentRepository(client)
                return _ACTIVE_REPOSITORY
            except Exception as e:
                logger.warning(
                    f"Failed to initialize Firestore with credentials at {credentials_path}: {e}. "
                    "Falling back to DemoIncidentRepository."
                )

    elif os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("FIRESTORE_EMULATOR_HOST"):
        try:
            from google.cloud import firestore
            client = firestore.Client(project=FIRESTORE_PROJECT_ID.strip() or None)
            _ = client.collection(FIRESTORE_COLLECTION).limit(1).get()
            logger.info("Successfully connected to Google Cloud Firestore using environment credentials.")
            _ACTIVE_REPOSITORY = FirestoreIncidentRepository(client)
            return _ACTIVE_REPOSITORY
        except Exception as e:
            logger.warning(f"Default Firestore credentials check failed: {e}. Falling back to demo repository.")

    logger.info("Operating in Local Demo Repository mode (no remote Firestore credentials available).")
    _ACTIVE_REPOSITORY = DemoIncidentRepository()
    return _ACTIVE_REPOSITORY

def reset_repository_for_testing(repo: Optional[IncidentRepository] = None):
    """Helper for automated unit tests."""
    global _ACTIVE_REPOSITORY
    _ACTIVE_REPOSITORY = repo
