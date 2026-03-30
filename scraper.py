"""
Scraper for sportinfocentar2.com competition data files.

Each competition has a JS data file at:
  https://www.sportinfocentar2.com/coman/natjecanje{ID}.js

The file contains standings (tablica) and matches (utakmice) for all
groups in the competition. We find the group containing Dinamo Zagreb
and extract only that group's data.
"""

import logging
import re

import chompjs
import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://www.sportinfocentar2.com/coman/natjecanje{}.js"
CLUB_KEYWORDS = ["dinamo zagreb", "dinamo"]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.sportinfocentar2.com/",
}


def _is_dinamo(name: str) -> bool:
    if not name:
        return False
    n = name.lower()
    return any(k in n for k in CLUB_KEYWORDS)


def _fetch_js(natjecanje_id: int) -> dict:
    url = BASE_URL.format(natjecanje_id)
    logger.info("Fetching %s", url)
    r = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
    r.raise_for_status()
    text = r.text.strip()
    if text.startswith("var "):
        text = re.sub(r"^var\s+\w+\s*=\s*", "", text).rstrip(";").strip()
    # Quote any unquoted JS object keys (e.g. poredakkraj: [...])
    text = re.sub(r'(?<!["\w])([a-zA-Z_]\w*)\s*(?=:(?!:))', r'"\1"', text)
    # Fix leading-zero integers invalid in JSON (e.g. 09 → 9)
    text = re.sub(r'(?<=[:\[,\s])0+([1-9]\d*)(?=[\s,\]\}])', r'\1', text)
    return chompjs.parse_js_object(text)


def _find_dinamo_liga(data: dict) -> dict | None:
    """Return the liga (group) that contains Dinamo Zagreb."""
    for liga in data.get("lige", []):
        teams = [row.get("n", "") for row in liga.get("tablica", [])]
        if any(_is_dinamo(t) for t in teams):
            return liga
    return None


def _parse_standings(liga: dict) -> list:
    rows = []
    for row in liga.get("tablica", []):
        rows.append({
            "rank":          row.get("por"),
            "team":          row.get("n"),
            "played":        row.get("utk"),
            "won":           row.get("pob"),
            "drawn":         row.get("ner"),
            "lost":          row.get("izg"),
            "goals_for":     row.get("dat"),
            "goals_against": row.get("prim"),
            "points":        row.get("bod"),
        })
    logger.info("Parsed %d standings rows", len(rows))
    return rows


def _parse_matches(liga: dict, group_teams: set) -> list:
    matches = []
    for m in liga.get("utakmice", []):
        home = m.get("e1") or ""
        away = m.get("e2") or ""

        # Filter to only matches within the group
        if group_teams and (home not in group_teams or away not in group_teams):
            continue

        r1 = m.get("r1")
        r2 = m.get("r2")
        played = r1 is not None and r2 is not None

        # Build venue string
        venue_name = (m.get("mnaziv") or "").strip()
        venue_city = (m.get("mmjesto") or "").strip()
        if venue_name and venue_city:
            venue = f"{venue_name}, {venue_city}"
        elif venue_name:
            venue = venue_name
        elif venue_city:
            venue = venue_city
        else:
            venue = None

        # Date: ISO format "2026-03-14"
        date = m.get("d") or ""

        # Round label
        kolo = m.get("kolo")
        round_label = f"{kolo}. kolo" if kolo else None

        matches.append({
            "round":      round_label,
            "date":       date,
            "home_team":  home,
            "away_team":  away,
            "home_score": r1,
            "away_score": r2,
            "status":     "played" if played else "upcoming",
            "venue":      venue,
        })

    logger.info("Parsed %d matches", len(matches))
    return matches


def scrape_competition(natjecanje_id: int) -> dict:
    data = _fetch_js(natjecanje_id)
    liga = _find_dinamo_liga(data)

    if liga is None:
        logger.warning("No Dinamo group found for natjecanje=%s", natjecanje_id)
        return {"standings": [], "matches": []}

    standings = _parse_standings(liga)
    group_teams = {row["team"] for row in standings if row["team"]}
    matches = _parse_matches(liga, group_teams)

    return {"standings": standings, "matches": matches}


async def scrape_all(competitions: list) -> dict:
    results = {}
    for comp in competitions:
        nat_id = comp["natjecanje_id"]
        try:
            data = scrape_competition(nat_id)
            results[nat_id] = data
            logger.info(
                "[%s] standings=%d  matches=%d",
                comp["name"],
                len(data["standings"]),
                len(data["matches"]),
            )
        except Exception as exc:
            logger.error("Failed to scrape natjecanje=%s: %s", nat_id, exc)
            results[nat_id] = {"standings": [], "matches": []}
    return results
