from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple

from app.ingestion.adapters.base import BaseAdapter
from app.ingestion.models import (
    NormalizedIncidentPayload,
    ProviderType,
    SourceFeedConfig,
)

class DemoAdapter(BaseAdapter):
    """
    Standard testable demonstration adapter.
    Produces deterministic, synthetic emergency dispatch incidents
    for offline development, CI/CD testing, and demonstration.
    """

    def __init__(self):
        config = SourceFeedConfig(
            feed_id="demo-feed",
            name="Municipal Dispatch CAD (Demo Feed)",
            provider_type=ProviderType.EMERGENCY_DISPATCH,
            endpoint_url="local://demo-cad-system",
            auth_required=False,
            auth_configured=True,
            enabled=True,
            documentation_url="https://github.com/example/routerescue/docs/demo-adapter",
            setup_requirements="Built-in demo feed. No external credentials required.",
            polling_interval_seconds=120,
        )
        super().__init__(config=config, max_retries=1, timeout_seconds=2.0)

    def _fetch_raw(self, force_fixture: bool = False) -> Tuple[Any, bool, Optional[str]]:
        now_iso = datetime.now(timezone.utc).isoformat()
        # Returns synthetic incident records
        raw_items = [
            {
                "id": "DEMO-CAD-201",
                "headline": "Underpass Storm Runoff Blockage",
                "details": "Rapid water accumulation in depressed underpass. Depth ~1.1m. Impassable for emergency vehicles.",
                "type": "flood",
                "priority": "high",
                "lat": 37.7749,
                "lng": -122.4194,
                "corridor": "Market St & 10th St Underpass",
                "published": "2026-10-10T08:00:00Z",
                "ref_url": "https://example.gov/cad/201",
                "uncertain_loc": False,
                "review_reason": None,
            },
            {
                "id": "DEMO-CAD-202",
                "headline": "Broad Sector High-Voltage Line Incident",
                "details": "Caller reports arcing power lines somewhere along the Van Ness & Geary corridor. Exact pole coordinate unconfirmed.",
                "type": "infrastructure",
                "priority": "high",
                "lat": 37.7850,
                "lng": -122.4210,
                "corridor": "Van Ness Ave & Geary Blvd Corridor",
                "published": "2026-10-10T08:15:00Z",
                "ref_url": "https://example.gov/cad/202",
                "uncertain_loc": True,
                "review_reason": "Broad sector dispatch report; field crew en route to pinpoint exact transformer pole.",
            },
            {
                "id": "DEMO-CAD-203",
                "headline": "Street Tree Collapse Across Travel Lanes",
                "details": "Fallen eucalyptus blocking westbound lanes. Traffic being waved through single lane.",
                "type": "hazard",
                "priority": "medium",
                "lat": 37.7600,
                "lng": -122.4350,
                "corridor": "Castro St & 18th St",
                "published": "2026-10-10T08:20:00Z",
                "ref_url": "https://example.gov/cad/203",
                "uncertain_loc": False,
                "review_reason": None,
            },
        ]
        return raw_items, False, None

    def _normalize_records(
        self, raw_data: Any, is_cached: bool = False, cached_at: Optional[str] = None
    ) -> List[NormalizedIncidentPayload]:
        now_iso = datetime.now(timezone.utc).isoformat()
        records: List[NormalizedIncidentPayload] = []

        for item in raw_data:
            records.append(
                NormalizedIncidentPayload(
                    external_id=item["id"],
                    source_feed_id=self.config.feed_id,
                    title=item["headline"],
                    description=item["details"],
                    hazard_category=item["type"],
                    severity=item["priority"],
                    status="OFFICIALLY_CONFIRMED",
                    latitude=item["lat"],
                    longitude=item["lng"],
                    location_name=item["corridor"],
                    location_uncertain=item["uncertain_loc"],
                    location_review_reason=item["review_reason"],
                    source_name="Municipal Emergency Dispatch (CAD)",
                    source_url=item["ref_url"],
                    published_at=item["published"],
                    fetched_at=now_iso,
                    is_official=True,
                    is_repost=False,
                    is_cached=is_cached,
                    cached_at=cached_at,
                    raw_metadata=item,
                )
            )

        return records
