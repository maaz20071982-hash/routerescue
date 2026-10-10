import math
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

from app.config import (
    CONFLICT_PROXIMITY_METERS,
    DUPLICATE_PROXIMITY_METERS,
    DUPLICATE_TEXT_SIMILARITY_THRESHOLD,
    DUPLICATE_TIME_WINDOW_HOURS,
    FRESHNESS_STALE_HOURS,
)
from app.models import IncidentStatus

# Standard English stopwords to filter out for vocabulary comparison
STOPWORDS: Set[str] = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
    "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
    "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
    "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me",
    "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
    "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
    "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
    "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
    "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
    "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
}

OFFICIAL_DOMAINS: Set[str] = {
    "gov", "mil", "sfgov.org", "ca.gov", "dot.ca.gov", "chp.ca.gov", "example.gov",
    "sfdem.org", "usgs.gov", "noaa.gov", "weather.gov", "fema.gov", "transportation.gov"
}

OFFICIAL_KEYWORDS: List[str] = [
    "police", "highway patrol", "fire department", "fire dept", "dispatch", "emergency management",
    "incident command", "municipal", "department of transportation", "dot", "911", "public safety",
    "sheriff", "transit authority", "eoc", "city services", "official bulletin"
]

REPOST_PATTERNS: List[re.Pattern] = [
    re.compile(r"\brt\s+@\w+", re.IGNORECASE),
    re.compile(r"\bvia\s+@\w+", re.IGNORECASE),
    re.compile(r"\breposted\s+from\b", re.IGNORECASE),
    re.compile(r"\bforwarded\s+from\b", re.IGNORECASE),
    re.compile(r"\bcredit:\s*@\w+", re.IGNORECASE),
    re.compile(r"\bper\s+@\w+", re.IGNORECASE),
    re.compile(r"\brepost:\s*", re.IGNORECASE),
    re.compile(r"\bcourtesy\s+of\b", re.IGNORECASE),
]


def parse_datetime(dt_str: Optional[str]) -> datetime:
    """
    Parses ISO 8601 string into timezone-aware UTC datetime.
    Falls back to current UTC datetime if invalid or absent.
    """
    if not dt_str:
        return datetime.now(timezone.utc)
    cleaned = dt_str.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two WGS-84 points in meters.
    """
    radius = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(radius * c, 2)


def tokenize_text(text: Optional[str]) -> Set[str]:
    """
    Extracts meaningful alphanumeric words, lowercased and stripped of stopwords.
    """
    if not text:
        return set()
    words = re.findall(r"\b[a-zA-Z0-9]{2,}\b", text.lower())
    return {w for w in words if w not in STOPWORDS}


def jaccard_similarity(text1: Optional[str], text2: Optional[str]) -> float:
    """
    Computes deterministic Jaccard token similarity (0.0 to 1.0).
    Never invents arbitrary confidence values.
    """
    tokens1 = tokenize_text(text1)
    tokens2 = tokenize_text(text2)
    if not tokens1 or not tokens2:
        return 0.0
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    if not union:
        return 0.0
    return round(len(intersection) / len(union), 3)


def is_official_source(source_url: Optional[str] = None, source_name: Optional[str] = None) -> bool:
    """
    Rule-based check: determines if source is an authorized official institution.
    Looks for official government/municipal top-level or second-level domains,
    or recognized emergency management agencies.
    """
    if source_url:
        try:
            parsed = urlparse(source_url)
            host = (parsed.hostname or "").lower()
            # Check TLD and known official domains
            for dom in OFFICIAL_DOMAINS:
                if host == dom or host.endswith(f".{dom}"):
                    return True
        except Exception:
            pass

    if source_name:
        lower_name = source_name.lower()
        for kw in OFFICIAL_KEYWORDS:
            if kw in lower_name:
                return True

    return False


def is_repost_content(
    text: Optional[str],
    source_url: Optional[str] = None,
    existing_sources: Optional[List[dict]] = None
) -> Tuple[bool, Optional[str]]:
    """
    Rule-based check to distinguish independent sources from reposts.
    Checks:
    1. Explicit citation or repost attribution markers in text ('RT @', 'via @', etc.).
    2. Identical source URL matching an earlier source.
    3. Identical exact text body duplicating an earlier recorded source.
    """
    if text:
        for pat in REPOST_PATTERNS:
            match = pat.search(text)
            if match:
                return True, f"Attribution marker detected in text ('{match.group(0)}')"

    if existing_sources:
        for s in existing_sources:
            other_url = s.get("source_url")
            if source_url and other_url and source_url.strip().lower() == other_url.strip().lower():
                return True, f"Identical source URL already recorded in earlier entry ({s.get('source_id')})"

            other_excerpt = s.get("excerpt") or s.get("description")
            if text and other_excerpt and len(text.strip()) > 20 and text.strip().lower() == other_excerpt.strip().lower():
                return True, f"Verbatim duplicate text matches earlier source ({s.get('source_id')})"

    return False, None


def check_freshness(
    published_or_reported_at: str,
    limit_hours: float = FRESHNESS_STALE_HOURS,
    current_time: Optional[datetime] = None
) -> Tuple[bool, float, str]:
    """
    Evaluates report age against configurable freshness limit.
    Returns: (is_stale, age_hours, explanatory_reason)
    """
    now = current_time or datetime.now(timezone.utc)
    report_time = parse_datetime(published_or_reported_at)
    age_seconds = max(0.0, (now - report_time).total_seconds())
    age_hours = round(age_seconds / 3600.0, 2)

    if age_hours > limit_hours:
        reason = (
            f"Report age of {age_hours:.1f}h exceeds the configured freshness limit "
            f"({limit_hours:.1f}h). Flagged as STALE pending recent field re-verification."
        )
        return True, age_hours, reason
    else:
        reason = (
            f"Report is fresh ({age_hours:.1f}h old, within {limit_hours:.1f}h threshold)."
        )
        return False, age_hours, reason


def detect_potential_duplicates(
    target: dict,
    all_incidents: List[dict],
    max_distance_m: float = DUPLICATE_PROXIMITY_METERS,
    max_time_h: float = DUPLICATE_TIME_WINDOW_HOURS,
    min_similarity: float = DUPLICATE_TEXT_SIMILARITY_THRESHOLD,
) -> List[dict]:
    """
    Rule-based duplicate detection.
    Evaluates:
    - Geographic proximity (Haversine distance in meters)
    - Hazard category match
    - Text similarity (Jaccard vocabulary overlap)
    - Time difference (Hours between publication / reporting)

    CRITICAL RULE:
    Flags potential duplicates for human review; NEVER merges records automatically.
    """
    flags: List[dict] = []
    target_id = target.get("id")
    target_lat = float(target.get("latitude", target.get("lat", 0.0)))
    target_lng = float(target.get("longitude", target.get("lng", 0.0)))
    target_hazard = str(target.get("hazard_type", target.get("type", ""))).lower().strip()
    target_text = f"{target.get('title', '')} {target.get('description', '')}"
    target_time = parse_datetime(target.get("published_at") or target.get("reported_at") or target.get("reportedAt"))

    for other in all_incidents:
        other_id = other.get("id")
        if not other_id or other_id == target_id:
            continue

        other_lat = float(other.get("latitude", other.get("lat", 0.0)))
        other_lng = float(other.get("longitude", other.get("lng", 0.0)))
        other_hazard = str(other.get("hazard_type", other.get("type", ""))).lower().strip()
        other_text = f"{other.get('title', '')} {other.get('description', '')}"
        other_time = parse_datetime(other.get("published_at") or other.get("reported_at") or other.get("reportedAt"))

        # 1. Geographic proximity check
        distance_m = haversine_distance(target_lat, target_lng, other_lat, other_lng)
        if distance_m > max_distance_m:
            continue

        # 2. Hazard category check (exact match or related)
        hazard_match = (target_hazard == other_hazard)
        if not hazard_match:
            continue

        # 3. Time difference check
        time_diff_hours = abs((target_time - other_time).total_seconds()) / 3600.0
        if time_diff_hours > max_time_h:
            continue
        time_diff_minutes = round(time_diff_hours * 60.0, 1)

        # 4. Text similarity check
        similarity = jaccard_similarity(target_text, other_text)
        if similarity < min_similarity:
            continue

        reasons = [
            f"Within spatial proximity: {distance_m:.1f}m (threshold: {max_distance_m:.1f}m)",
            f"Matching hazard category: '{target_hazard}'",
            f"Reported within temporal window: {time_diff_minutes:.0f} min apart (threshold: {max_time_h:.1f}h)",
            f"Text vocabulary overlap: {int(similarity * 100)}% (threshold: {int(min_similarity * 100)}%)"
        ]

        flags.append({
            "flag_id": f"DUP-{target_id}-{other_id}",
            "target_incident_id": other_id,
            "target_title": other.get("title", "Untitled Incident"),
            "distance_meters": distance_m,
            "time_diff_minutes": time_diff_minutes,
            "text_similarity": similarity,
            "hazard_match": True,
            "reasons": reasons,
            "flagged_at": datetime.now(timezone.utc).isoformat(),
            "reviewed": False,
            "review_decision": None,
            "reviewed_by": None,
            "policy_notice": "Flagged for operator review. Record preserved separately and not automatically merged."
        })

    return flags


def detect_conflicting_reports(
    target: dict,
    all_incidents: List[dict],
    proximity_m: float = CONFLICT_PROXIMITY_METERS
) -> List[dict]:
    """
    Flags conflicting reports in the same geographical vicinity:
    - Status conflicts (e.g. one reports RESOLVED / lanes clear, another reports active Critical blockage)
    - Severity conflicts (e.g. critical closure vs low smooth flow)
    """
    conflicts: List[dict] = []
    target_id = target.get("id")
    target_lat = float(target.get("latitude", target.get("lat", 0.0)))
    target_lng = float(target.get("longitude", target.get("lng", 0.0)))
    target_status = str(target.get("status", "UNVERIFIED")).upper()
    target_severity = str(target.get("severity", "medium")).lower()

    for other in all_incidents:
        other_id = other.get("id")
        if not other_id or other_id == target_id:
            continue

        other_lat = float(other.get("latitude", other.get("lat", 0.0)))
        other_lng = float(other.get("longitude", other.get("lng", 0.0)))
        distance = haversine_distance(target_lat, target_lng, other_lat, other_lng)

        if distance > proximity_m:
            continue

        other_status = str(other.get("status", "UNVERIFIED")).upper()
        other_severity = str(other.get("severity", "medium")).lower()

        # Status conflict: Active severe hazard vs Resolved all-clear
        if target_status == IncidentStatus.RESOLVED.value and other_status in (
            IncidentStatus.UNVERIFIED.value,
            IncidentStatus.CORROBORATED.value,
            IncidentStatus.OFFICIALLY_CONFIRMED.value
        ):
            conflicts.append({
                "flag_id": f"CONF-STATUS-{target_id}-{other_id}",
                "target_incident_id": other_id,
                "conflict_type": "STATUS_CONTRADICTION",
                "description": (
                    f"Status discrepancy: This incident is marked RESOLVED, while nearby "
                    f"incident {other_id} ({distance:.0f}m away) reports active status '{other_status}'."
                ),
                "flagged_at": datetime.now(timezone.utc).isoformat()
            })
        elif other_status == IncidentStatus.RESOLVED.value and target_status in (
            IncidentStatus.UNVERIFIED.value,
            IncidentStatus.CORROBORATED.value,
            IncidentStatus.OFFICIALLY_CONFIRMED.value
        ):
            conflicts.append({
                "flag_id": f"CONF-STATUS-{target_id}-{other_id}",
                "target_incident_id": other_id,
                "conflict_type": "STATUS_CONTRADICTION",
                "description": (
                    f"Status discrepancy: This incident reports active status '{target_status}', "
                    f"while nearby incident {other_id} ({distance:.0f}m away) is marked RESOLVED."
                ),
                "flagged_at": datetime.now(timezone.utc).isoformat()
            })

        # Severity conflict: Critical full closure vs Low minor flow
        if (target_severity == "critical" and other_severity == "low") or (target_severity == "low" and other_severity == "critical"):
            conflicts.append({
                "flag_id": f"CONF-SEV-{target_id}-{other_id}",
                "target_incident_id": other_id,
                "conflict_type": "SEVERITY_DISCREPANCY",
                "description": (
                    f"Operational severity contradiction: This report indicates '{target_severity}' "
                    f"while nearby report {other_id} ({distance:.0f}m away) indicates '{other_severity}'."
                ),
                "flagged_at": datetime.now(timezone.utc).isoformat()
            })

    return conflicts


def evaluate_evidence_and_rules(
    incident: dict,
    all_incidents: Optional[List[dict]] = None,
    current_time: Optional[datetime] = None
) -> dict:
    """
    Comprehensive rule-based evaluation of an incident.
    Produces:
    - Evidence summary (source counts, independent vs reposts, official presence)
    - Freshness check
    - Duplicate flags
    - Conflict flags
    - Transparent rule evaluation audit notes

    NEVER invents fake confidence scores.
    NEVER treats missing data as proof that a claim is false.
    """
    sources: List[dict] = incident.get("sources_detail") or []
    if not sources:
        # Synthesize from root fields if sources_detail was not yet populated
        root_url = incident.get("source_url")
        root_name = incident.get("source", "Community Report")
        is_official = is_official_source(root_url, root_name)
        pub_time = incident.get("published_at") or incident.get("reported_at") or incident.get("reportedAt") or datetime.now(timezone.utc).isoformat()
        ing_time = incident.get("ingested_at") or pub_time

        sources = [{
            "source_id": f"SRC-{incident.get('id', 'NEW')}-1",
            "source_name": root_name,
            "source_url": root_url,
            "published_at": pub_time,
            "ingested_at": ing_time,
            "is_official": is_official,
            "is_repost": False,
            "repost_of_source_id": None,
            "excerpt": incident.get("description", "")[:200],
            "notes": "Initial incident provenance record"
        }]

    total_sources = len(sources)
    independent_sources = [s for s in sources if not s.get("is_repost")]
    repost_sources = [s for s in sources if s.get("is_repost")]
    official_sources = [s for s in sources if s.get("is_official")]

    # Freshness calculation based on latest publication/reporting time
    latest_pub_time = max(
        (s.get("published_at") or s.get("ingested_at") for s in sources),
        default=incident.get("reported_at") or datetime.now(timezone.utc).isoformat()
    )
    is_stale, age_hours, freshness_reason = check_freshness(
        latest_pub_time,
        FRESHNESS_STALE_HOURS,
        current_time=current_time
    )

    # Duplicates & conflicts check
    duplicate_flags: List[dict] = []
    conflict_flags: List[dict] = []
    if all_incidents:
        duplicate_flags = detect_potential_duplicates(incident, all_incidents)
        conflict_flags = detect_conflicting_reports(incident, all_incidents)

    # Transparent rule notes
    rule_notes: List[str] = []
    if official_sources:
        rule_notes.append(
            f"Authorized official source verified: '{official_sources[0].get('source_name')}' "
            f"({official_sources[0].get('source_url') or 'Official Agency'})."
        )
    else:
        rule_notes.append("No authorized official or government source on record.")

    if len(independent_sources) >= 2:
        rule_notes.append(
            f"Corroborated by {len(independent_sources)} independent, non-repost sources."
        )
    elif len(independent_sources) == 1:
        rule_notes.append(
            "Single independent source report. Awaiting secondary independent corroboration."
        )
    else:
        rule_notes.append(
            "Insufficient independent evidence; reports consist exclusively of reposts or unattributed claims."
        )

    if repost_sources:
        rule_notes.append(
            f"{len(repost_sources)} citation(s) identified as reposts/quotes and excluded from independent tally."
        )

    rule_notes.append(freshness_reason)

    if duplicate_flags:
        rule_notes.append(
            f"{len(duplicate_flags)} potential duplicate report(s) flagged for human review (separate records preserved)."
        )

    if conflict_flags:
        rule_notes.append(
            f"{len(conflict_flags)} conflicting report(s) flagged in immediate geographic proximity."
        )

    return {
        "sources_detail": sources,
        "is_stale": is_stale,
        "potential_duplicates": duplicate_flags,
        "conflicting_reports": conflict_flags,
        "evidence_summary": {
            "total_sources": total_sources,
            "independent_sources_count": len(independent_sources),
            "repost_count": len(repost_sources),
            "official_sources_count": len(official_sources),
            "has_official_source": len(official_sources) > 0,
            "is_stale": is_stale,
            "freshness_limit_hours": FRESHNESS_STALE_HOURS,
            "age_hours": age_hours,
            "duplicate_flags_count": len(duplicate_flags),
            "conflict_flags_count": len(conflict_flags),
            "rule_evaluation_notes": rule_notes,
        }
    }


def validate_status_transition(
    current_status: IncidentStatus,
    target_status: IncidentStatus,
    has_official_source: bool = False,
    is_authorized_review: bool = False,
    review_notes: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Validates lifecycle status transitions strictly according to Sprint 3 rules.
    Statuses: UNVERIFIED, CORROBORATED, OFFICIALLY_CONFIRMED, RESOLVED.

    CRITICAL RULE:
    Never label a report officially confirmed without an authorized official source
    or explicit authorized review.
    """
    if current_status == target_status:
        return True, "No status change."

    # Rule 1: Transition to OFFICIALLY_CONFIRMED
    if target_status == IncidentStatus.OFFICIALLY_CONFIRMED:
        has_adequate_notes = bool(review_notes and len(review_notes.strip()) >= 5)
        # Must have EITHER an authorized official source OR an authorized review with clear rationale notes
        if not (has_official_source or (is_authorized_review and has_adequate_notes)):
            return False, (
                "Transition to OFFICIALLY_CONFIRMED rejected: "
                "Requires an authorized official source or explicit authorized review with documented confirmation rationale."
            )

    # Rule 2: Valid lifecycle steps
    # UNVERIFIED can move to CORROBORATED, OFFICIALLY_CONFIRMED (if rule 1 met), or RESOLVED
    # CORROBORATED can move to OFFICIALLY_CONFIRMED (if rule 1 met) or RESOLVED
    # OFFICIALLY_CONFIRMED can move to RESOLVED
    # RESOLVED can be reopened to UNVERIFIED or CORROBORATED with authorized review

    if current_status == IncidentStatus.RESOLVED and target_status in (
        IncidentStatus.UNVERIFIED,
        IncidentStatus.CORROBORATED,
        IncidentStatus.OFFICIALLY_CONFIRMED
    ):
        if not is_authorized_review:
            return False, "Reopening a RESOLVED incident requires privileged authorized review."

    return True, "Valid transition."
