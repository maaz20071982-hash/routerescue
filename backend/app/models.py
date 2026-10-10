from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.security import sanitize_text

class IncidentStatus(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    CORROBORATED = "CORROBORATED"
    OFFICIALLY_CONFIRMED = "OFFICIALLY_CONFIRMED"
    RESOLVED = "RESOLVED"

class HazardCategory(str, Enum):
    FLOOD = "flood"
    HAZARD = "hazard"
    CONGESTION = "congestion"
    INFRASTRUCTURE = "infrastructure"
    FIRE = "fire"

class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class SourceEvidence(BaseModel):
    source_id: str
    source_name: str
    source_url: Optional[str] = None
    published_at: str
    ingested_at: str
    is_official: bool = False
    is_repost: bool = False
    repost_of_source_id: Optional[str] = None
    excerpt: Optional[str] = None
    notes: Optional[str] = None

class DuplicateFlag(BaseModel):
    flag_id: str
    target_incident_id: str
    target_title: Optional[str] = None
    distance_meters: float
    time_diff_minutes: float
    text_similarity: float
    hazard_match: bool = True
    reasons: List[str] = []
    flagged_at: str
    reviewed: bool = False
    review_decision: Optional[str] = None
    reviewed_by: Optional[str] = None
    policy_notice: Optional[str] = "Flagged for operator review. Record preserved separately and not automatically merged."

class ConflictFlag(BaseModel):
    flag_id: str
    target_incident_id: str
    conflict_type: str
    description: str
    flagged_at: str

class VerificationHistoryEntry(BaseModel):
    id: str
    timestamp: str
    action: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    actor: str
    reason: str

class EvidenceSummary(BaseModel):
    total_sources: int = 1
    independent_sources_count: int = 1
    repost_count: int = 0
    official_sources_count: int = 0
    has_official_source: bool = False
    is_stale: bool = False
    freshness_limit_hours: float = 6.0
    age_hours: float = 0.0
    duplicate_flags_count: int = 0
    conflict_flags_count: int = 0
    rule_evaluation_notes: List[str] = []

class IncidentCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=150, description="Clear incident summary title")
    description: str = Field(..., min_length=5, max_length=2000, description="Detailed situation description")
    hazard_type: HazardCategory = Field(
        ...,
        alias="hazard_category",
        description="Hazard classification (flood, hazard, congestion, infrastructure, fire)"
    )
    latitude: float = Field(..., ge=-90.0, le=90.0, description="WGS-84 latitude coordinate (-90 to +90)")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="WGS-84 longitude coordinate (-180 to +180)")
    location_name: Optional[str] = Field(None, max_length=200, description="Street intersection, corridor or neighborhood")
    source_url: Optional[str] = Field(None, max_length=500, description="Optional public URL or dispatch report reference")
    severity: SeverityLevel = Field(default=SeverityLevel.MEDIUM, description="Operational urgency severity")
    source: Optional[str] = Field(default=None, max_length=100, description="Provenance / reporting channel")
    published_at: Optional[str] = Field(default=None, description="Source original publication time (ISO 8601)")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("title", "description", "location_name", mode="before")
    @classmethod
    def sanitize_string_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(str(v))

    @field_validator("source_url")
    @classmethod
    def validate_and_sanitize_url(cls, v: Optional[str]) -> Optional[str]:
        if not v or not str(v).strip():
            return None
        cleaned = str(v).strip()
        lower = cleaned.lower()
        if not (lower.startswith("http://") or lower.startswith("https://")):
            raise ValueError("source_url must be an absolute URL starting with http:// or https://")
        return sanitize_text(cleaned)

class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus = Field(..., description="Target lifecycle status")
    notes: Optional[str] = Field(None, max_length=1000, description="Optional administrator resolution or triage notes")
    reviewer_role: Optional[str] = Field(None, max_length=100, description="Reviewer credential / role")
    authorized_by: Optional[str] = Field(None, max_length=100, description="Dispatch / Agency supervisor authorizing status")

    @field_validator("notes", mode="before")
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(str(v))

class DuplicateReviewRequest(BaseModel):
    decision: str = Field(..., description="Review outcome: CONFIRMED_DUPLICATE_KEPT_SEPARATE or DISMISSED_NOT_DUPLICATE")
    notes: Optional[str] = Field(None, max_length=500, description="Reviewer explanation")

    @field_validator("notes", mode="before")
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(str(v))

class EvidenceCreate(BaseModel):
    source_name: str = Field(..., min_length=2, max_length=150, description="Reporting source or publication name")
    source_url: Optional[str] = Field(None, max_length=500, description="Source URL or report reference")
    published_at: Optional[str] = Field(default=None, description="Original publication timestamp (ISO 8601)")
    excerpt: Optional[str] = Field(None, max_length=1000, description="Relevant excerpt or report body")
    is_repost: bool = Field(default=False, description="Flag indicating if this source quotes or reposts an earlier source")
    repost_of_source_id: Optional[str] = Field(default=None, description="Original source ID if known repost")
    notes: Optional[str] = Field(None, max_length=500, description="Verification notes")

    @field_validator("source_name", "excerpt", "notes", mode="before")
    @classmethod
    def sanitize_strings(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(str(v))

    @field_validator("source_url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if not v or not str(v).strip():
            return None
        cleaned = str(v).strip()
        lower = cleaned.lower()
        if not (lower.startswith("http://") or lower.startswith("https://")):
            raise ValueError("source_url must be an absolute URL starting with http:// or https://")
        return sanitize_text(cleaned)

class IncidentResponse(BaseModel):
    id: str
    title: str
    hazard_type: str
    type: str
    severity: str
    status: IncidentStatus
    latitude: float
    longitude: float
    lat: float
    lng: float
    location_name: str
    locationName: str
    description: str
    source: str
    source_url: Optional[str] = None
    reported_at: str
    reportedAt: str
    updated_at: Optional[str] = None
    affected_routes: List[str] = []
    recommended_action: Optional[str] = None
    recommendedDetour: Optional[str] = None
    verified: bool = False
    storage_provenance: str
    # Sprint 3 Evidence & Verification fields
    published_at: Optional[str] = None
    ingested_at: Optional[str] = None
    is_stale: bool = False
    sources_detail: List[SourceEvidence] = []
    verification_history: List[VerificationHistoryEntry] = []
    evidence_summary: Optional[EvidenceSummary] = None
    potential_duplicates: List[DuplicateFlag] = []
    conflicting_reports: List[ConflictFlag] = []
    # Sprint 5 External Ingestion & Location Review fields
    location_uncertain: bool = False
    location_review_reason: Optional[str] = None
    is_cached: bool = False
    cached_at: Optional[str] = None
    source_feed_id: Optional[str] = None
    external_record_id: Optional[str] = None

class IncidentListResponse(BaseModel):
    data: List[IncidentResponse]
    total: int
    storage_backend: str
    storage_notice: str
    source: str

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str
    environment: str
    storage_backend: str
    storage_notice: str
    is_remote_storage: bool
