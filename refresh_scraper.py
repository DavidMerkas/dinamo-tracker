"""
Standalone script — poziva se kao subprocess iz app.py.
Playwright treba vlastiti proces, ne može raditi unutar uvicorn event loopa.
"""
import asyncio
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def main():
    from database import get_all_data, init_db, save_competition_data
    from scraper import scrape_all

    await init_db()
    data = await get_all_data()
    competitions = [
        {"natjecanje_id": d["natjecanje_id"], "name": d["name"], "category": d["category"]}
        for d in data
    ]

    results = await scrape_all(competitions)

    for nat_id, scraped in results.items():
        await save_competition_data(nat_id, scraped["standings"], scraped["matches"])
        logger.info(
            "Saved natjecanje=%s: standings=%d  matches=%d",
            nat_id,
            len(scraped["standings"]),
            len(scraped["matches"]),
        )

    logger.info("Refresh complete.")


if __name__ == "__main__":
    asyncio.run(main())
