import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple
import urllib.error

from app.ingestion.models import (
    FeedSourceHealth,
    IngestionResult,
    NormalizedIncidentPayload,
    SourceFeedConfig,
    SourceFeedStatus,
)

logger = logging.getLogger("routerescue.ingestion.adapter")

class BaseAdapter(ABC):
    """
    Abstract base class for all external and demonstration data adapters.
    Implements source-independent resilience patterns:
    - Bounded retries with exponential backoff
    - Strict request timeouts
    - HTTP 429 rate-limit backoff and header inspection
    - Honest error propagation without silent demo substitutions
    - Safe cached-data labeling (is_cached: True)
    """

    def __init__(self, config: SourceFeedConfig, max_retries: int = 2, timeout_seconds: float = 8.0):
        self.config = config
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds

        initial_health = FeedSourceHealth.HEALTHY
        if not config.enabled:
            initial_health = FeedSourceHealth.DISABLED
        elif config.auth_required and not config.auth_configured:
            initial_health = FeedSourceHealth.DISABLED

        self.status = SourceFeedStatus(
            feed_id=config.feed_id,
            name=config.name,
            provider_type=config.provider_type,
            health=initial_health,
            enabled=config.enabled,
            auth_required=config.auth_required,
            auth_configured=config.auth_configured,
            endpoint_url=config.endpoint_url,
            setup_requirements=config.setup_requirements,
            documentation_url=config.documentation_url,
        )

        self._cached_payloads: List[NormalizedIncidentPayload] = []
        self._cached_at: Optional[str] = None
        self._rate_limit_reset_epoch: Optional[float] = None

    @abstractmethod
    def _fetch_raw(self, force_fixture: bool = False) -> Tuple[Any, bool, Optional[str]]:
        """
        Executes low-level fetch from endpoint or saved fixture.
        Returns: (raw_data, is_cached, cached_at)
        """
        pass

    @abstractmethod
    def _normalize_records(
        self, raw_data: Any, is_cached: bool = False, cached_at: Optional[str] = None
    ) -> List[NormalizedIncidentPayload]:
        """
        Normalizes raw payload into standard NormalizedIncidentPayload instances.
        Must preserve: external_id, source_url, published_at, fetched_at.
        Must flag uncertain locations for operator review.
        """
        pass

    def fetch_and_normalize(
        self, use_cache_on_failure: bool = False, force_fixture: bool = False
    ) -> Tuple[List[NormalizedIncidentPayload], IngestionResult]:
        """
        Public entrypoint for adapter execution.
        Guarantees:
        - Never invents API responses.
        - Never silently substitutes demo records for failed live feeds.
        - Labels cached records transparently.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        now_epoch = time.time()
        self.status.last_attempt_at = now_iso

        # 1. Check if missing credentials or disabled
        if self.config.auth_required and not self.config.auth_configured:
            self.status.health = FeedSourceHealth.DISABLED
            return [], IngestionResult(
                feed_id=self.config.feed_id,
                feed_name=self.config.name,
                success=False,
                status=FeedSourceHealth.DISABLED,
                error_message=(
                    f"Authentication credentials missing. {self.config.setup_requirements or 'Check environment variables.'}"
                ),
                fetched_at=now_iso,
            )

        if not self.config.enabled:
            self.status.health = FeedSourceHealth.DISABLED
            return [], IngestionResult(
                feed_id=self.config.feed_id,
                feed_name=self.config.name,
                success=False,
                status=FeedSourceHealth.DISABLED,
                error_message="Adapter is disabled in configuration.",
                fetched_at=now_iso,
            )

        # 2. Check if currently rate-limited
        if self._rate_limit_reset_epoch and now_epoch < self._rate_limit_reset_epoch:
            remaining_sec = int(self._rate_limit_reset_epoch - now_epoch)
            self.status.health = FeedSourceHealth.RATE_LIMITED
            msg = f"Rate limit in effect for {self.config.name}. Backing off for {remaining_sec}s."
            if use_cache_on_failure and self._cached_payloads:
                # Return explicitly labeled cached data
                return self._cached_payloads, IngestionResult(
                    feed_id=self.config.feed_id,
                    feed_name=self.config.name,
                    success=True,
                    status=FeedSourceHealth.RATE_LIMITED,
                    records_fetched=len(self._cached_payloads),
                    is_cached=True,
                    cached_at=self._cached_at,
                    error_message=f"{msg} Served cached data.",
                    fetched_at=now_iso,
                )
            return [], IngestionResult(
                feed_id=self.config.feed_id,
                feed_name=self.config.name,
                success=False,
                status=FeedSourceHealth.RATE_LIMITED,
                error_message=msg,
                fetched_at=now_iso,
            )

        # 3. Bounded retries execution
        raw_data = None
        is_cached = False
        cached_at = None
        last_error_message = None

        for attempt in range(self.max_retries + 1):
            try:
                raw_data, is_cached, cached_at = self._fetch_raw(force_fixture=force_fixture)
                break
            except urllib.error.HTTPError as http_err:
                if http_err.code == 429:
                    # Rate limit encountered
                    retry_after = http_err.headers.get("Retry-After")
                    delay = int(retry_after) if retry_after and retry_after.isdigit() else 60
                    self._rate_limit_reset_epoch = now_epoch + delay
                    self.status.rate_limit_reset_at = datetime.fromtimestamp(
                        self._rate_limit_reset_epoch, tz=timezone.utc
                    ).isoformat()
                    self.status.health = FeedSourceHealth.RATE_LIMITED
                    self.status.consecutive_failures += 1
                    last_error_message = f"HTTP 429 Rate Limited. Retry-After: {delay}s."
                    logger.warning(f"[{self.config.feed_id}] {last_error_message}")
                    break  # Do not retry on 429
                else:
                    last_error_message = f"HTTP {http_err.code}: {http_err.reason}"
                    if attempt < self.max_retries:
                        time.sleep(0.15 * (2**attempt))
            except Exception as e:
                last_error_message = f"{type(e).__name__}: {str(e)}"
                if attempt < self.max_retries:
                    time.sleep(0.15 * (2**attempt))

        # 4. Handle fetch failure
        if raw_data is None:
            self.status.consecutive_failures += 1
            if self.status.health != FeedSourceHealth.RATE_LIMITED:
                self.status.health = (
                    FeedSourceHealth.DEGRADED if self.status.consecutive_failures <= 2 else FeedSourceHealth.ERROR
                )
            self.status.error_message = last_error_message

            if use_cache_on_failure and self._cached_payloads:
                logger.info(f"[{self.config.feed_id}] Serving labeled cached records following fetch failure.")
                return self._cached_payloads, IngestionResult(
                    feed_id=self.config.feed_id,
                    feed_name=self.config.name,
                    success=True,
                    status=self.status.health,
                    records_fetched=len(self._cached_payloads),
                    is_cached=True,
                    cached_at=self._cached_at,
                    error_message=f"Live feed failure ({last_error_message}). Served labeled cached records.",
                    fetched_at=now_iso,
                )

            # Never invent API responses or substitute demo records
            return [], IngestionResult(
                feed_id=self.config.feed_id,
                feed_name=self.config.name,
                success=False,
                status=self.status.health,
                error_message=f"Live feed fetch failed: {last_error_message}",
                fetched_at=now_iso,
            )

        # 5. Success normalization
        try:
            records = self._normalize_records(raw_data, is_cached=is_cached, cached_at=cached_at)
        except Exception as norm_err:
            self.status.health = FeedSourceHealth.ERROR
            self.status.error_message = f"Normalization error: {str(norm_err)}"
            return [], IngestionResult(
                feed_id=self.config.feed_id,
                feed_name=self.config.name,
                success=False,
                status=FeedSourceHealth.ERROR,
                error_message=f"Payload normalization failed: {str(norm_err)}",
                fetched_at=now_iso,
            )

        # Update health & cache
        self.status.health = FeedSourceHealth.HEALTHY
        self.status.consecutive_failures = 0
        self.status.error_message = None
        self.status.last_successful_fetch = now_iso
        self.status.total_fetches += 1
        self.status.total_records_ingested += len(records)
        self.status.is_cached = is_cached
        self.status.cached_at = cached_at or now_iso

        self._cached_payloads = [r.model_copy(update={"is_cached": True, "cached_at": self.status.cached_at}) for r in records]
        self._cached_at = self.status.cached_at

        uncertain_count = sum(1 for r in records if r.location_uncertain)

        return records, IngestionResult(
            feed_id=self.config.feed_id,
            feed_name=self.config.name,
            success=True,
            status=FeedSourceHealth.HEALTHY,
            records_fetched=len(records),
            records_uncertain_location=uncertain_count,
            is_cached=is_cached,
            cached_at=cached_at,
            fetched_at=now_iso,
        )
