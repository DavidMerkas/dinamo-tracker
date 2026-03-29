import asyncio
import logging
import os
import subprocess
import sys

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import get_all_data, init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

STATIC_DIR               = os.path.join(os.path.dirname(__file__), "static")
SCRAPER_SCRIPT           = os.path.join(os.path.dirname(__file__), "refresh_scraper.py")
REFRESH_INTERVAL_MINUTES = 15

app       = FastAPI(title="Rudar Tracker")
scheduler = AsyncIOScheduler()

# ──────────────────────────────────────────────
# Refresh logic — runs scraper as a subprocess
# so Playwright gets its own process/event loop
# ──────────────────────────────────────────────

_refresh_lock = asyncio.Lock()


async def refresh_data():
    if _refresh_lock.locked():
        logger.info("Refresh already in progress, skipping.")
        return

    async with _refresh_lock:
        logger.info("Starting data refresh (subprocess)...")
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [sys.executable, SCRAPER_SCRIPT],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            output = (result.stdout + result.stderr).strip()
            if result.returncode == 0:
                logger.info("Refresh complete.\n%s", output)
            else:
                logger.error("Refresh failed (exit %d):\n%s", result.returncode, output)
        except Exception as exc:
            logger.error("Failed to launch refresh subprocess: %s", exc, exc_info=True)


# ──────────────────────────────────────────────
# Lifecycle
# ──────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    await init_db()
    scheduler.add_job(
        refresh_data,
        "interval",
        minutes=REFRESH_INTERVAL_MINUTES,
        id="auto_refresh",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — refresh every %d min", REFRESH_INTERVAL_MINUTES)
    asyncio.create_task(refresh_data())


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()


# ──────────────────────────────────────────────
# API routes
# ──────────────────────────────────────────────

@app.get("/api/data")
async def api_data():
    return await get_all_data()


@app.post("/api/refresh")
async def api_refresh():
    if _refresh_lock.locked():
        raise HTTPException(status_code=409, detail="Refresh already in progress.")
    asyncio.create_task(refresh_data())
    return {"status": "started"}


# ──────────────────────────────────────────────
# Serve frontend
# ──────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
