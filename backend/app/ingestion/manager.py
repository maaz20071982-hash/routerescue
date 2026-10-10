import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.ingestion.adapters.base import BaseAdapter
from app.ingestion.adapters.demo_adapter import DemoAdapter
from app.ingestion.adapters.nws_weather_adapter import NWSWeatherAlertsAdapter
from app.ingestion.adapters.reddit_adapter import RedditAuthorizedAdapter
from app.ingestion.adapters.twitter_adapter import TwitterAuthorizedAdapter
from app.ingestion.models import (
    FeedSourceHealth,
    IngestionLogEntry,
    IngestionResult,
    NormalizedIncidentPayload,
    SourceFeedStatus,
)
from app.storage import IncidentRepository, get_repository

logger = logging.getLogger("routerescue.ingestion.manager")

class IngestionManager:
    """
    Source-independent ingestion layer manager.
    Coordinates polling across adapters, enforces repeat ingestion deduplication,
    tracks per-source health, and commits normalized records into incident storage.
    """

    def __init__(self, repository: Optional[IncidentRepository] = None):
        self.repository = repository or get_repository()
        self.adapters: Dict[str, BaseAdapter] = {}
        # Tracks repeat ingestion: key = "{feed_id}::{external_id}" -> incident_id
        self._external_id_map: Dict[str, str] = {}
        self._history_log: List[IngestionLogEntry] = []
        self._max_history = 100

        # Register default adapters
        self._register_default_adapters()

    def _register_default_adapters(self):
        import os
        # 1. Built-in Demo Adapter
        demo = DemoAdapter()
        self.register_adapter(demo)

        # 2. National Weather Service Public Alert Adapter
        nws = NWSWeatherAlertsAdapter(
            user_agent=os.getenv(
                "NWS_USER_AGENT",
                "RouteRescue-Ingestion/1.0 (emergency-coord-eval@routerescue.local)"
            ),
            enabled=os.getenv("NWS_API_ENABLED", "true").lower() == "true",
        )
        self.register_adapter(nws)

        # 3. Twitter Authorized API Adapter
        twitter = TwitterAuthorizedAdapter(
            bearer_token=os.getenv("TWITTER_BEARER_TOKEN"),
            enabled=os.getenv("TWITTER_API_ENABLED", "false").lower() == "true",
        )
        self.register_adapter(twitter)

        # 4. Reddit Authorized OAuth Adapter
        reddit = RedditAuthorizedAdapter(
            client_id=os.getenv("REDDIT_CLIENT_ID"),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
            enabled=os.getenv("REDDIT_API_ENABLED", "false").lower() == "true",
        )
        self.register_adapter(reddit)

    def register_adapter(self, adapter: BaseAdapter):
        self.adapters[adapter.config.feed_id] = adapter
        logger.info(f"Registered data adapter: {adapter.config.name} ({adapter.config.feed_id})")

    def get_sources_status(self) -> List[SourceFeedStatus]:
        """Returns live status, health, and configuration requirements for all registered adapters."""
        return [adapter.status for adapter in self.adapters.values()]

    def refresh_source(
        self, feed_id: str, force_fixture: bool = False, use_cache_on_failure: bool = False
    ) -> IngestionResult:
        """Refreshes an individual data source feed."""
        if feed_id not in self.adapters:
            return IngestionResult(
                feed_id=feed_id,
                feed_name="Unknown Feed",
                success=False,
                status=FeedSourceHealth.ERROR,
                error_message=f"No adapter registered for feed ID '{feed_id}'.",
                fetched_at=datetime.now(timezone.utc).isoformat(),
            )

        adapter = self.adapters[feed_id]
        start_time = time.time()

        payloads, result = adapter.fetch_and_normalize(
            use_cache_on_failure=use_cache_on_failure, force_fixture=force_fixture
        )

        duration_ms = round((time.time() - start_time) * 1000, 2)

        if result.success and payloads:
            # Commit normalized records with repeat ingestion deduplication
            new_count, updated_count, dup_count = self._commit_payloads(payloads)
            result.records_new = new_count
            result.records_updated = updated_count
            result.records_duplicate = dup_count

        # Log ingestion event
        log_entry = IngestionLogEntry(
            id=f"LOG-{uuid.uuid4().hex[:8].upper()}",
            timestamp=result.fetched_at,
            feed_id=feed_id,
            feed_name=adapter.config.name,
            status=result.status,
            records_fetched=result.records_fetched,
            records_new=result.records_new,
            records_updated=result.records_updated,
            duration_ms=duration_ms,
            message=(
                f"Ingested {result.records_fetched} records ({result.records_new} new, "
                f"{result.records_updated} updated/deduplicated) in {duration_ms}ms."
                if result.success
                else f"Ingestion failed: {result.error_message}"
            ),
            is_cached=result.is_cached,
        )
        self._history_log.insert(0, log_entry)
        if len(self._history_log) > self._max_history:
            self._history_log.pop()

        return result

    def refresh_all(
        self, force_fixture: bool = False, use_cache_on_failure: bool = False
    ) -> List[IngestionResult]:
        """Refreshes all enabled and configured adapters."""
        results: List[IngestionResult] = []
        for feed_id, adapter in self.adapters.items():
            if adapter.config.enabled:
                res = self.refresh_source(
                    feed_id, force_fixture=force_fixture, use_cache_on_failure=use_cache_on_failure
                )
                results.append(res)
        return results

    def get_history(self, limit: int = 50) -> List[IngestionLogEntry]:
        return self._history_log[:limit]

    def _commit_payloads(
        self, payloads: List[NormalizedIncidentPayload]
    ) -> Tuple[int, int, int]:
        """
        Deduplicates repeat ingestion and commits records to incident storage.
        Preserves original source URL, published_at, and fetched_at.
        Returns: (new_count, updated_count, duplicate_count)
        """
        new_count = 0
        updated_count = 0
        dup_count = 0
        now_iso = datetime.now(timezone.utc).isoformat()

        # Update reference to active repository in case it changed
        self.repository = get_repository()

        for p in payloads:
            map_key = f"{p.source_feed_id}::{p.external_id}"
            existing_id = self._external_id_map.get(map_key)

            if existing_id:
                # Deduplicate repeat ingestion
                existing_inc = self.repository.get_incident(existing_id)
                if existing_inc:
                    # Update ingestion timestamp and cached flags without creating duplicate incident
                    existing_inc["ingested_at"] = p.fetched_at
                    existing_inc["is_cached"] = p.is_cached
                    existing_inc["cached_at"] = p.cached_at
                    existing_inc["updated_at"] = now_iso

                    # Add refresh entry to verification history
                    existing_inc.setdefault("verification_history", []).append({
                        "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                        "timestamp": now_iso,
                        "action": "REPEAT_INGESTION_DEDUPLICATED",
                        "from_status": existing_inc.get("status"),
                        "to_status": existing_inc.get("status"),
                        "actor": f"IngestionManager ({p.source_name})",
                        "reason": f"Repeat poll confirmed active record. Refreshed fetched_at to {p.fetched_at}. Record deduplicated."
                    })

                    dup_count += 1
                    updated_count += 1
                    continue

            # Brand new incident
            new_id = f"ING-{p.source_feed_id[:3].upper()}-{uuid.uuid4().hex[:6].upper()}"
            self._external_id_map[map_key] = new_id

            source_evidence = {
                "source_id": f"SRC-{new_id}-1",
                "source_name": p.source_name,
                "source_url": p.source_url,
                "published_at": p.published_at,
                "ingested_at": p.fetched_at,
                "is_official": p.is_official,
                "is_repost": p.is_repost,
                "repost_of_source_id": p.repost_of_source_id,
                "excerpt": p.description[:250],
                "notes": (
                    f"Ingested from {p.source_name}. External ID: {p.external_id}. "
                    + (f"Location uncertainty: {p.location_review_reason}" if p.location_uncertain else "")
                ),
            }

            history_entry = {
                "id": f"VH-{uuid.uuid4().hex[:6].upper()}",
                "timestamp": p.fetched_at,
                "action": "EXTERNAL_INGESTION",
                "from_status": None,
                "to_status": p.status,
                "actor": f"IngestionManager ({p.source_feed_id})",
                "reason": (
                    f"Record ingested from {p.source_name}. Preserved original source URL: '{p.source_url or 'N/A'}' "
                    f"and published_at: {p.published_at}."
                ),
            }

            raw_item = {
                "id": new_id,
                "title": p.title,
                "hazard_type": p.hazard_category,
                "severity": p.severity,
                "status": p.status,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "location_name": p.location_name,
                "description": p.description,
                "reported_at": p.published_at,
                "published_at": p.published_at,
                "ingested_at": p.fetched_at,
                "source": p.source_name,
                "source_url": p.source_url,
                "affected_routes": [p.location_name],
                "recommended_action": "External feed incident ingested; awaiting dispatch coordination.",
                "sources_detail": [source_evidence],
                "verification_history": [history_entry],
                "location_uncertain": p.location_uncertain,
                "location_review_reason": p.location_review_reason,
                "is_cached": p.is_cached,
                "cached_at": p.cached_at,
                "source_feed_id": p.source_feed_id,
                "external_record_id": p.external_id,
                "potential_duplicates": [],
                "conflicting_reports": [],
            }

            # If repo has upsert/insert method or direct dict assignment
            if hasattr(self.repository, "upsert_ingested_incident"):
                self.repository.upsert_ingested_incident(raw_item)
            elif hasattr(self.repository, "_incidents"):
                self.repository._incidents[new_id] = raw_item
            else:
                logger.warning(f"Repository {type(self.repository)} does not support direct insertion.")

            new_count += 1

        return new_count, updated_count, dup_count

# Singleton instance
_ACTIVE_INGESTION_MANAGER: Optional[IngestionManager] = None

def get_ingestion_manager() -> IngestionManager:
    global _ACTIVE_INGESTION_MANAGER
    if _ACTIVE_INGESTION_MANAGER is None:
        _ACTIVE_INGESTION_MANAGER = IngestionManager()
    return _ACTIVE_INGESTION_MANAGER

def reset_ingestion_manager_for_testing(mgr: Optional[IngestionManager] = None):
    global _ACTIVE_INGESTION_MANAGER
    _ACTIVE_INGESTION_MANAGER = mgr
