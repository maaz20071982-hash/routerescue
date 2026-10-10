import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional, Tuple
import urllib.request
import urllib.error

from app.ingestion.adapters.base import BaseAdapter
from app.ingestion.models import (
    NormalizedIncidentPayload,
    ProviderType,
    SourceFeedConfig,
)

logger = logging.getLogger("routerescue.ingestion.nws")

class NWSWeatherAlertsAdapter(BaseAdapter):
    """
    Official NOAA / National Weather Service (NWS) active alerts adapter.
    Uses the documented public API (api.weather.gov).
    Requires a valid User-Agent header as per NWS documentation.
    No private API key required; official US government public service.
    """

    FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "nws_alerts_fixture.json"

    def __init__(
        self,
        endpoint_url: str = "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&limit=25",
        user_agent: str = "RouteRescue-Ingestion/1.0 (emergency-coord-eval@routerescue.local)",
        enabled: bool = True,
        max_retries: int = 2,
        timeout_seconds: float = 8.0,
    ):
        self.user_agent = user_agent
        config = SourceFeedConfig(
            feed_id="nws-weather-alerts",
            name="NOAA / NWS Severe Weather & Hazard Alerts",
            provider_type=ProviderType.OFFICIAL_WEATHER,
            endpoint_url=endpoint_url,
            auth_required=False,  # Public endpoint requiring only User-Agent
            auth_configured=True,
            enabled=enabled,
            documentation_url="https://www.weather.gov/documentation/services-web-api",
            setup_requirements="Public API requires an identified User-Agent header as per NWS specification.",
            polling_interval_seconds=300,
        )
        super().__init__(config=config, max_retries=max_retries, timeout_seconds=timeout_seconds)

    def _fetch_raw(self, force_fixture: bool = False) -> Tuple[Any, bool, Optional[str]]:
        now_iso = datetime.now(timezone.utc).isoformat()

        if force_fixture:
            logger.info("Loading NWS alerts from saved example fixture.")
            with open(self.FIXTURE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data, True, now_iso

        # Attempt live request to documented endpoint
        req = urllib.request.Request(
            self.config.endpoint_url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/geo+json, application/json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                content = resp.read().decode("utf-8")
                data = json.loads(content)
                return data, False, None
        except Exception as e:
            logger.warning(f"Live NWS API request failed: {e}. Checking fixture fallback policy.")
            raise

    def _normalize_records(
        self, raw_data: Any, is_cached: bool = False, cached_at: Optional[str] = None
    ) -> List[NormalizedIncidentPayload]:
        now_iso = datetime.now(timezone.utc).isoformat()
        records: List[NormalizedIncidentPayload] = []

        features = raw_data.get("features", [])
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry")

            external_id = props.get("id") or feat.get("id", "NWS-ALERT-UNKNOWN")
            event = props.get("event", "Severe Weather Advisory")
            headline = props.get("headline") or event
            description = props.get("description") or props.get("instruction") or headline
            area_desc = props.get("areaDesc") or "San Francisco Regional Forecast Zone"
            source_url = props.get("web") or feat.get("id") or "https://api.weather.gov"
            published_at = props.get("sent") or props.get("effective") or now_iso

            # Map NWS event to hazard category
            event_lower = event.lower()
            if "flood" in event_lower:
                hazard_type = "flood"
            elif "fire" in event_lower:
                hazard_type = "fire"
            elif any(k in event_lower for k in ["infrastructure", "utility", "power"]):
                hazard_type = "infrastructure"
            else:
                hazard_type = "hazard"

            # Map NWS severity
            sev_raw = (props.get("severity") or "moderate").lower()
            if sev_raw == "extreme":
                severity = "critical"
            elif sev_raw == "severe":
                severity = "high"
            elif sev_raw == "moderate":
                severity = "medium"
            else:
                severity = "low"

            # Parse coordinates & evaluate location uncertainty
            lat, lng = 37.7749, -122.4194  # Default anchor
            location_uncertain = False
            review_reason: Optional[str] = None

            if geom:
                g_type = geom.get("type")
                coords = geom.get("coordinates")
                if g_type == "Point" and coords and len(coords) >= 2:
                    lng = float(coords[0])
                    lat = float(coords[1])
                    location_uncertain = False
                elif g_type == "Polygon" and coords and len(coords) > 0:
                    poly_coords = coords[0]
                    if poly_coords:
                        avg_lng = sum(pt[0] for pt in poly_coords) / len(poly_coords)
                        avg_lat = sum(pt[1] for pt in poly_coords) / len(poly_coords)
                        lng = float(avg_lng)
                        lat = float(avg_lat)
                        location_uncertain = True
                        review_reason = (
                            "Calculated from NWS warning polygon centroid. Exact corridor "
                            "and street intersection requires field operator review."
                        )
                else:
                    location_uncertain = True
                    review_reason = f"Complex geometry type '{g_type}'; centroid approximated."
            else:
                location_uncertain = True
                review_reason = "Regional weather zone alert; exact street intersection unavailable in raw feed."

            records.append(
                NormalizedIncidentPayload(
                    external_id=external_id,
                    source_feed_id=self.config.feed_id,
                    title=f"{event}: {area_desc[:50]}",
                    description=description,
                    hazard_category=hazard_type,
                    severity=severity,
                    status="OFFICIALLY_CONFIRMED",
                    latitude=lat,
                    longitude=lng,
                    location_name=area_desc[:120],
                    location_uncertain=location_uncertain,
                    location_review_reason=review_reason,
                    source_name=props.get("senderName") or "National Weather Service",
                    source_url=source_url,
                    published_at=published_at,
                    fetched_at=now_iso,
                    is_official=True,
                    is_repost=False,
                    is_cached=is_cached,
                    cached_at=cached_at,
                    raw_metadata=props,
                )
            )

        return records
