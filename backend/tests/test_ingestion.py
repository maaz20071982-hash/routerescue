import time
import urllib.error
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ingestion.adapters.demo_adapter import DemoAdapter
from app.ingestion.adapters.nws_weather_adapter import NWSWeatherAlertsAdapter
from app.ingestion.adapters.reddit_adapter import RedditAuthorizedAdapter
from app.ingestion.adapters.twitter_adapter import TwitterAuthorizedAdapter
from app.ingestion.manager import IngestionManager, get_ingestion_manager, reset_ingestion_manager_for_testing
from app.ingestion.models import FeedSourceHealth
from app.storage import DemoIncidentRepository, reset_repository_for_testing

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_environment():
    """Resets repository and ingestion manager before each test."""
    repo = DemoIncidentRepository()
    reset_repository_for_testing(repo)
    mgr = IngestionManager(repository=repo)
    reset_ingestion_manager_for_testing(mgr)
    yield
    reset_repository_for_testing(None)
    reset_ingestion_manager_for_testing(None)


def test_demo_adapter_ingestion_and_normalization():
    """Validates that DemoAdapter generates normalized records with preserved metadata."""
    adapter = DemoAdapter()
    records, result = adapter.fetch_and_normalize()

    assert result.success is True
    assert result.status == FeedSourceHealth.HEALTHY
    assert len(records) >= 3

    # Check first record metadata preservation
    rec = records[0]
    assert rec.source_feed_id == "demo-feed"
    assert rec.is_official is True
    assert rec.source_url == "https://example.gov/cad/201"
    assert rec.published_at == "2026-10-10T08:00:00Z"
    assert rec.fetched_at is not None

    # Check uncertain location record
    uncertain_rec = next((r for r in records if r.location_uncertain), None)
    assert uncertain_rec is not None
    assert "Van Ness Ave & Geary Blvd" in uncertain_rec.location_name
    assert uncertain_rec.location_review_reason is not None
    assert "Broad sector" in uncertain_rec.location_review_reason


def test_nws_adapter_saved_example_response_parsing():
    """Validates NWSWeatherAlertsAdapter parsing saved GeoJSON fixture."""
    adapter = NWSWeatherAlertsAdapter()
    records, result = adapter.fetch_and_normalize(force_fixture=True)

    assert result.success is True
    assert result.status == FeedSourceHealth.HEALTHY
    assert len(records) >= 2

    # Record 1: Polygon flash flood alert with computed centroid
    flood_alert = next((r for r in records if "Flash Flood Warning" in r.title), None)
    assert flood_alert is not None
    assert flood_alert.hazard_category == "flood"
    assert flood_alert.severity == "high"
    assert flood_alert.is_official is True
    assert flood_alert.source_url.startswith("https://api.weather.gov/alerts/")
    assert flood_alert.location_uncertain is True
    assert "polygon centroid" in flood_alert.location_review_reason.lower()
    # Coordinates should be centroid around lat 37.7715, lng -122.4175
    assert 37.76 <= flood_alert.latitude <= 37.78
    assert -122.43 <= flood_alert.longitude <= -122.40

    # Record 2: Point wind advisory with exact coordinates
    wind_alert = next((r for r in records if "High Wind" in r.title), None)
    assert wind_alert is not None
    assert wind_alert.location_uncertain is False
    assert wind_alert.latitude == 37.7850
    assert wind_alert.longitude == -122.4080
    assert wind_alert.source_name == "NWS San Francisco Bay Area CA"


def test_twitter_adapter_disabled_when_credentials_unavailable():
    """Verifies Twitter adapter is kept DISABLED when credentials are missing or empty."""
    adapter = TwitterAuthorizedAdapter(bearer_token=None)
    assert adapter.status.health == FeedSourceHealth.DISABLED
    assert adapter.config.auth_configured is False

    records, result = adapter.fetch_and_normalize()
    assert result.success is False
    assert result.status == FeedSourceHealth.DISABLED
    assert len(records) == 0
    assert "Authentication credentials missing" in result.error_message
    assert "TWITTER_BEARER_TOKEN" in result.error_message
    assert adapter.config.documentation_url is not None


def test_twitter_adapter_with_saved_example_response():
    """Verifies Twitter adapter normalizes tweets, marks UNVERIFIED, and flags retweets."""
    adapter = TwitterAuthorizedAdapter(bearer_token="mock_bearer_token_123456789012345")
    assert adapter.config.auth_configured is True

    records, result = adapter.fetch_and_normalize(force_fixture=True)
    assert result.success is True
    assert len(records) == 3

    # All social media reports MUST be UNVERIFIED
    for r in records:
        assert r.status == "UNVERIFIED"
        assert r.is_official is False
        assert r.source_url.startswith("https://twitter.com/i/web/status/")

    # Check retweet distinction
    rt = next((r for r in records if r.is_repost), None)
    assert rt is not None
    assert rt.repost_of_source_id == "@sf_resident"

    # Social reports should be marked uncertain location unless explicit GPS
    uncertain_reports = [r for r in records if r.location_uncertain]
    assert len(uncertain_reports) >= 1


def test_reddit_adapter_disabled_when_credentials_unavailable():
    """Verifies Reddit adapter is kept DISABLED when credentials are missing."""
    adapter = RedditAuthorizedAdapter(client_id=None, client_secret=None)
    assert adapter.status.health == FeedSourceHealth.DISABLED
    assert adapter.config.auth_configured is False

    records, result = adapter.fetch_and_normalize()
    assert result.success is False
    assert result.status == FeedSourceHealth.DISABLED
    assert "REDDIT_CLIENT_ID" in result.error_message


def test_reddit_adapter_with_saved_example_response():
    """Verifies Reddit adapter normalizes posts from saved fixture."""
    adapter = RedditAuthorizedAdapter(
        client_id="mock_reddit_client_id_12345",
        client_secret="mock_reddit_secret_67890"
    )
    records, result = adapter.fetch_and_normalize(force_fixture=True)

    assert result.success is True
    assert len(records) == 2

    sinkhole = next((r for r in records if "sinkhole" in r.title.lower()), None)
    assert sinkhole is not None
    assert sinkhole.hazard_category == "infrastructure"
    assert sinkhole.status == "UNVERIFIED"
    assert sinkhole.source_url.startswith("https://www.reddit.com/r/bayarea/")
    assert sinkhole.location_uncertain is True
    assert "dispatcher triage" in sinkhole.location_review_reason.lower()


def test_repeat_ingestion_deduplication():
    """Validates that repeat ingestion does not duplicate incidents in storage."""
    mgr = get_ingestion_manager()

    # First fetch: ingests 3 new demo incidents
    res1 = mgr.refresh_source("demo-feed")
    assert res1.success is True
    assert res1.records_new == 3
    assert res1.records_updated == 0

    incidents_after_first = mgr.repository.list_incidents()
    count_first = len(incidents_after_first)

    # Second fetch: same records should be deduplicated
    res2 = mgr.refresh_source("demo-feed")
    assert res2.success is True
    assert res2.records_new == 0
    assert res2.records_updated == 3
    assert res2.records_duplicate == 3

    incidents_after_second = mgr.repository.list_incidents()
    assert len(incidents_after_second) == count_first, "Repeat ingestion created duplicate records in storage!"


def test_bounded_retries_and_honest_failure_handling():
    """Verifies bounded retries, error status, and zero silent demo substitutions."""
    adapter = NWSWeatherAlertsAdapter(max_retries=2, timeout_seconds=1.0)

    # Mock low-level fetch to simulate a persistent connection timeout
    with patch.object(adapter, "_fetch_raw", side_effect=TimeoutError("Connection timed out")):
        records, result = adapter.fetch_and_normalize(use_cache_on_failure=False)

        assert result.success is False
        assert result.status in (FeedSourceHealth.DEGRADED, FeedSourceHealth.ERROR)
        assert len(records) == 0, "Failed live feed must NEVER invent records or substitute demo data!"
        assert adapter.status.consecutive_failures == 1
        assert "Connection timed out" in result.error_message


def test_rate_limit_handling_http_429():
    """Verifies that HTTP 429 sets RATE_LIMITED status and backs off."""
    adapter = NWSWeatherAlertsAdapter()

    # Create mock HTTPError for 429
    headers = MagicMock()
    headers.get.return_value = "45"  # Retry-After: 45
    http_429 = urllib.error.HTTPError(
        url="https://api.weather.gov",
        code=429,
        msg="Too Many Requests",
        hdrs=headers,
        fp=None,
    )

    with patch.object(adapter, "_fetch_raw", side_effect=http_429):
        records, result = adapter.fetch_and_normalize(use_cache_on_failure=False)

        assert result.success is False
        assert result.status == FeedSourceHealth.RATE_LIMITED
        assert adapter.status.health == FeedSourceHealth.RATE_LIMITED
        assert "Rate Limited" in result.error_message
        assert adapter.status.rate_limit_reset_at is not None

        # Subsequent call before reset epoch should immediately return RATE_LIMITED
        records2, result2 = adapter.fetch_and_normalize(use_cache_on_failure=False)
        assert result2.status == FeedSourceHealth.RATE_LIMITED


def test_cached_data_labeling():
    """Verifies that cached records explicitly set is_cached=True and cached_at."""
    adapter = DemoAdapter()
    records, result = adapter.fetch_and_normalize()
    assert result.success is True

    # Now simulate a failure with use_cache_on_failure=True
    with patch.object(adapter, "_fetch_raw", side_effect=ConnectionResetError("Network down")):
        cached_records, cached_result = adapter.fetch_and_normalize(use_cache_on_failure=True)

        assert cached_result.success is True
        assert cached_result.is_cached is True
        assert cached_result.cached_at is not None
        for r in cached_records:
            assert r.is_cached is True
            assert r.cached_at is not None


def test_api_ingestion_endpoints():
    """Validates FastAPI endpoints for listing sources and triggering refreshes."""
    # 1. GET /api/ingestion/sources
    resp = client.get("/api/ingestion/sources")
    assert resp.status_code == 200
    sources = resp.json()
    assert isinstance(sources, list)
    assert len(sources) >= 4

    feed_ids = [s["feed_id"] for s in sources]
    assert "demo-feed" in feed_ids
    assert "nws-weather-alerts" in feed_ids
    assert "twitter-authorized-api" in feed_ids
    assert "reddit-authorized-api" in feed_ids

    # 2. POST /api/ingestion/sources/demo-feed/refresh
    resp_refresh = client.post("/api/ingestion/sources/demo-feed/refresh")
    assert resp_refresh.status_code == 200
    res_data = resp_refresh.json()
    assert res_data["feed_id"] == "demo-feed"
    assert res_data["success"] is True

    # 3. POST /api/ingestion/sources/nws-weather-alerts/refresh with force_fixture=true
    resp_nws = client.post("/api/ingestion/sources/nws-weather-alerts/refresh?force_fixture=true")
    assert resp_nws.status_code == 200
    nws_data = resp_nws.json()
    assert nws_data["feed_id"] == "nws-weather-alerts"
    assert nws_data["success"] is True
    assert nws_data["records_fetched"] >= 2

    # 4. POST /api/ingestion/refresh
    resp_all = client.post("/api/ingestion/refresh?force_fixture=true")
    assert resp_all.status_code == 200
    all_results = resp_all.json()
    assert isinstance(all_results, list)

    # 5. GET /api/ingestion/history
    resp_hist = client.get("/api/ingestion/history")
    assert resp_hist.status_code == 200
    hist = resp_hist.json()
    assert isinstance(hist, list)
    assert len(hist) >= 1
