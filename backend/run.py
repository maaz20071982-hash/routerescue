import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("ENVIRONMENT", "development") == "development"
    print(f"Starting RouteRescue FastAPI backend on http://{host}:{port} (reload={reload})")
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)
