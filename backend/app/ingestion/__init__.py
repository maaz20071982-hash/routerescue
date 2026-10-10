from app.ingestion.models import (
    FeedSourceHealth,
    ProviderType,
    SourceFeedConfig,
    SourceFeedStatus,
    NormalizedIncidentPayload,
    IngestionResult,
    IngestionLogEntry,
)
from app.ingestion.adapters.base import BaseAdapter
from app.ingestion.adapters.demo_adapter import DemoAdapter
from app.ingestion.adapters.nws_weather_adapter import NWSWeatherAlertsAdapter
from app.ingestion.adapters.twitter_adapter import TwitterAuthorizedAdapter
from app.ingestion.adapters.reddit_adapter import RedditAuthorizedAdapter
from app.ingestion.manager import IngestionManager, get_ingestion_manager

__all__ = [
    "FeedSourceHealth",
    "ProviderType",
    "SourceFeedConfig",
    "SourceFeedStatus",
    "NormalizedIncidentPayload",
    "IngestionResult",
    "IngestionLogEntry",
    "BaseAdapter",
    "DemoAdapter",
    "NWSWeatherAlertsAdapter",
    "TwitterAuthorizedAdapter",
    "RedditAuthorizedAdapter",
    "IngestionManager",
    "get_ingestion_manager",
]
