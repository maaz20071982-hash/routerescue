import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "127.0.0.1")

# Privileged admin key for status updates
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "routerescue-admin-sprint2")

# Google Cloud Firestore credentials (backend-only)
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
FIRESTORE_PROJECT_ID = os.getenv("FIRESTORE_PROJECT_ID", "")
FIRESTORE_COLLECTION = os.getenv("FIRESTORE_COLLECTION", "incidents")

# Sprint 3: Rule-Based Verification & Freshness Thresholds
FRESHNESS_STALE_HOURS = float(os.getenv("FRESHNESS_STALE_HOURS", "6.0"))
DUPLICATE_PROXIMITY_METERS = float(os.getenv("DUPLICATE_PROXIMITY_METERS", "800.0"))
DUPLICATE_TIME_WINDOW_HOURS = float(os.getenv("DUPLICATE_TIME_WINDOW_HOURS", "6.0"))
DUPLICATE_TEXT_SIMILARITY_THRESHOLD = float(os.getenv("DUPLICATE_TEXT_SIMILARITY_THRESHOLD", "0.30"))
CONFLICT_PROXIMITY_METERS = float(os.getenv("CONFLICT_PROXIMITY_METERS", "500.0"))

# Sprint 5: External Ingestion & Adapters Configuration
NWS_API_ENABLED = os.getenv("NWS_API_ENABLED", "true").lower() == "true"
NWS_USER_AGENT = os.getenv("NWS_USER_AGENT", "RouteRescue-Ingestion/1.0 (emergency-coord-eval@routerescue.local)")
NWS_ALERTS_ENDPOINT = os.getenv("NWS_ALERTS_ENDPOINT", "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&limit=25")
TWITTER_API_ENABLED = os.getenv("TWITTER_API_ENABLED", "false").lower() == "true"
TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN", "")
REDDIT_API_ENABLED = os.getenv("REDDIT_API_ENABLED", "false").lower() == "true"
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "")
INGESTION_REQUEST_TIMEOUT_SECONDS = float(os.getenv("INGESTION_REQUEST_TIMEOUT_SECONDS", "8.0"))
INGESTION_MAX_RETRIES = int(os.getenv("INGESTION_MAX_RETRIES", "2"))

