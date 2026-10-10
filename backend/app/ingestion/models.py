from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class FeedSourceHealth(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    ERROR = "ERROR"
    DISABLED = "DISABLED"
    RATE_LIMITED = "RATE_LIMITED"

class ProviderType(str, Enum):
    OFFICIAL_WEATHER = "official_weather"
    EMERGENCY_DISPATCH = "emergency_dispatch"
    SOCIAL_MEDIA = "social_media"

class SourceFeedConfig(BaseModel):
    feed_id: str = Field(..., description="Unique feed identifier")
    name: str = Field(..., description="Human-readable provider name")
    provider_type: ProviderType = Field(..., description="Classification category")
    endpoint_url: Optional[str] = Field(None, description="Documented external endpoint URL")
    auth_required: bool = Field(default=False, description="Whether valid API credentials are required")
    auth_configured: bool = Field(default=False, description="Whether valid credentials were found in environment")
    enabled: bool = Field(default=True, description="Whether this feed is enabled for active polling")
    documentation_url: Optional[str] = Field(None, description="Official documentation link for setup")
    setup_requirements: Optional[str] = Field(None, description="Exact backend environment variables or credential instructions")
    polling_interval_seconds: int = Field(default=300, description="Recommended polling cadence in seconds")

class SourceFeedStatus(BaseModel):
    feed_id: str
    name: str
    provider_type: ProviderType
    health: FeedSourceHealth
    enabled: bool
    auth_required: bool
    auth_configured: bool
    endpoint_url: Optional[str] = None
    last_attempt_at: Optional[str] = None
    last_successful_fetch: Optional[str] = None
    consecutive_failures: int = 0
    error_message: Optional[str] = None
    total_records_ingested: int = 0
    total_fetches: int = 0
    rate_limit_reset_at: Optional[str] = None
    is_cached: bool = False
    cached_at: Optional[str] = None
    setup_requirements: Optional[str] = None
    documentation_url: Optional[str] = None

class NormalizedIncidentPayload(BaseModel):
    external_id: str = Field(..., description="Primary record identifier from source feed")
    source_feed_id: str = Field(..., description="Originating feed ID")
    title: str = Field(..., description="Normalized incident title")
    description: str = Field(..., description="Normalized descriptive narrative")
    hazard_category: str = Field(default="hazard", description="Hazard classification (flood, hazard, infrastructure, fire, congestion)")
    severity: str = Field(default="medium", description="Urgency severity (low, medium, high, critical)")
    status: str = Field(default="UNVERIFIED", description="Lifecycle status (UNVERIFIED, CORROBORATED, OFFICIALLY_CONFIRMED, RESOLVED)")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_name: str = Field(..., description="Human-readable corridor or street intersection")
    location_uncertain: bool = Field(default=False, description="Marked true if location is broad, inferred, or polygon centroid")
    location_review_reason: Optional[str] = Field(None, description="Review justification for uncertain location")
    source_name: str = Field(..., description="Source publication or agency name")
    source_url: Optional[str] = Field(None, description="Original source permalink or bulletin URL")
    published_at: str = Field(..., description="Source publication ISO 8601 timestamp")
    fetched_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="Ingestion ISO 8601 timestamp")
    is_official: bool = Field(default=False, description="True if originating from an authorized official government source")
    is_repost: bool = Field(default=False, description="True if determined to be a quote or retweet")
    repost_of_source_id: Optional[str] = None
    is_cached: bool = Field(default=False, description="True if loaded from local feed cache rather than live response")
    cached_at: Optional[str] = None
    raw_metadata: Dict[str, Any] = Field(default_factory=dict, description="Preserved raw source properties for audit trail")

class IngestionResult(BaseModel):
    feed_id: str
    feed_name: str
    success: bool
    status: FeedSourceHealth
    records_fetched: int = 0
    records_new: int = 0
    records_updated: int = 0
    records_duplicate: int = 0
    records_uncertain_location: int = 0
    is_cached: bool = False
    cached_at: Optional[str] = None
    error_message: Optional[str] = None
    fetched_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class IngestionLogEntry(BaseModel):
    id: str
    timestamp: str
    feed_id: str
    feed_name: str
    status: FeedSourceHealth
    records_fetched: int
    records_new: int
    records_updated: int
    duration_ms: float
    message: str
    is_cached: bool = False
