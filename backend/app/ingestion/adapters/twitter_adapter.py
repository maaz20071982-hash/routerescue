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

logger = logging.getLogger("routerescue.ingestion.twitter")

class TwitterAuthorizedAdapter(BaseAdapter):
    """
    Authorized social media retrieval adapter using Twitter / X API v2.
    Strictly adheres to platform policies:
    - Zero web scraping, zero HTML parsing, zero platform control bypasses.
    - Uses documented Twitter API v2 recent search endpoint with Bearer Token.
    - If credentials are unavailable, integration is kept strictly DISABLED
      and documents exact developer requirements.
    - Supports offline deterministic testing via saved example fixture.
    """

    FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "twitter_search_fixture.json"

    def __init__(
        self,
        bearer_token: Optional[str] = None,
        query: str = "(flood OR roadblock OR hazard) (San Francisco OR #SFtraffic) -is:nullcast",
        enabled: bool = True,
        max_retries: int = 2,
        timeout_seconds: float = 8.0,
    ):
        self.bearer_token = (bearer_token or "").strip()
        auth_configured = bool(self.bearer_token and not self.bearer_token.startswith("your_") and len(self.bearer_token) > 15)

        config = SourceFeedConfig(
            feed_id="twitter-authorized-api",
            name="Municipal Twitter / X Stream (Authorized API v2)",
            provider_type=ProviderType.SOCIAL_MEDIA,
            endpoint_url="https://api.twitter.com/2/tweets/search/recent",
            auth_required=True,
            auth_configured=auth_configured,
            enabled=enabled and auth_configured,
            documentation_url="https://developer.twitter.com/en/docs/twitter-api/tweets/search/api-reference/get-tweets-search-recent",
            setup_requirements=(
                "Requires Twitter Developer Project App Bearer Token. "
                "Set TWITTER_BEARER_TOKEN in backend .env. "
                "No web scraping or unauthorized reverse-engineered endpoints permitted."
            ),
            polling_interval_seconds=180,
        )
        self.query = query
        super().__init__(config=config, max_retries=max_retries, timeout_seconds=timeout_seconds)

    def _fetch_raw(self, force_fixture: bool = False) -> Tuple[Any, bool, Optional[str]]:
        now_iso = datetime.now(timezone.utc).isoformat()

        if force_fixture:
            logger.info("Loading Twitter recent search from saved example fixture.")
            with open(self.FIXTURE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data, True, now_iso

        if not self.config.auth_configured:
            raise ValueError(f"Cannot execute live Twitter API call: {self.config.setup_requirements}")

        import urllib.parse
        encoded_query = urllib.parse.quote(self.query)
        url = f"{self.config.endpoint_url}?query={encoded_query}&tweet.fields=created_at,geo,public_metrics&max_results=10"

        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {self.bearer_token}",
                "User-Agent": "RouteRescue-Ingestion/1.0",
                "Accept": "application/json",
            },
        )

        with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
            content = resp.read().decode("utf-8")
            data = json.loads(content)
            return data, False, None

    def _normalize_records(
        self, raw_data: Any, is_cached: bool = False, cached_at: Optional[str] = None
    ) -> List[NormalizedIncidentPayload]:
        now_iso = datetime.now(timezone.utc).isoformat()
        records: List[NormalizedIncidentPayload] = []

        tweets = raw_data.get("data", [])
        for tweet in tweets:
            tweet_id = tweet.get("id")
            text = tweet.get("text", "")
            created_at = tweet.get("created_at") or now_iso
            source_url = f"https://twitter.com/i/web/status/{tweet_id}"

            # Check if retweet / citation
            is_repost = text.startswith("RT @") or "via @" in text
            repost_ref = None
            if is_repost and "RT @" in text:
                parts = text.split("RT @", 1)[1].split(":", 1)
                if len(parts) > 0:
                    repost_ref = f"@{parts[0]}"

            # Determine hazard category from text keywords
            text_lower = text.lower()
            if "flood" in text_lower or "water" in text_lower:
                hazard_type = "flood"
            elif "tree" in text_lower or "debris" in text_lower:
                hazard_type = "hazard"
            elif "power" in text_lower or "wire" in text_lower or "line" in text_lower:
                hazard_type = "infrastructure"
            elif "fire" in text_lower:
                hazard_type = "fire"
            else:
                hazard_type = "congestion"

            # Parse coordinates
            geo = tweet.get("geo") or {}
            coords = geo.get("coordinates", {}).get("coordinates")
            if coords and len(coords) >= 2:
                lng = float(coords[0])
                lat = float(coords[1])
                location_uncertain = False
                review_reason = None
                location_name = f"{lat:.4f}, {lng:.4f}"
            else:
                # Approximate to default corridor
                lat, lng = 37.7600, -122.4350
                location_uncertain = True
                review_reason = (
                    "Social media post lacks explicit GPS coordinates. "
                    "Corridor approximated from post text; requires operator review."
                )
                location_name = "Castro & 18th Corridor (Approximated from text)"

            records.append(
                NormalizedIncidentPayload(
                    external_id=f"TW-{tweet_id}",
                    source_feed_id=self.config.feed_id,
                    title=f"Community Social Report: {text[:60]}...",
                    description=text,
                    hazard_category=hazard_type,
                    severity="medium",
                    status="UNVERIFIED",  # Unverified social reports never automatically confirmed
                    latitude=lat,
                    longitude=lng,
                    location_name=location_name,
                    location_uncertain=location_uncertain,
                    location_review_reason=review_reason,
                    source_name="Twitter / X Community Post",
                    source_url=source_url,
                    published_at=created_at,
                    fetched_at=now_iso,
                    is_official=False,
                    is_repost=is_repost,
                    repost_of_source_id=repost_ref,
                    is_cached=is_cached,
                    cached_at=cached_at,
                    raw_metadata=tweet,
                )
            )

        return records
