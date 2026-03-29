import aiosqlite
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS competitions (
    natjecanje_id INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    last_updated  TEXT
);

CREATE TABLE IF NOT EXISTS standings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    natjecanje_id INTEGER NOT NULL,
    rank          INTEGER,
    team          TEXT,
    played        INTEGER,
    won           INTEGER,
    drawn         INTEGER,
    lost          INTEGER,
    goals_for     INTEGER,
    goals_against INTEGER,
    points        INTEGER,
    FOREIGN KEY (natjecanje_id) REFERENCES competitions(natjecanje_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    natjecanje_id INTEGER NOT NULL,
    round         TEXT,
    date          TEXT,
    home_team     TEXT,
    away_team     TEXT,
    home_score    INTEGER,
    away_score    INTEGER,
    status        TEXT DEFAULT 'upcoming',
    venue         TEXT,
    FOREIGN KEY (natjecanje_id) REFERENCES competitions(natjecanje_id)
);
"""

COMPETITIONS_SEED = [
    (1677, "3. HRL Središte – M", "Seniori"),
    (1705, "1. HRL U17 – M",      "U17"),
    (1706, "1. HRL U15 – M",      "U15"),
    (1707, "1. HRL U13 – M",      "U13"),
]

CLUB_NAME = "Dinamo Zagreb"


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(CREATE_TABLES)
        for nat_id, name, category in COMPETITIONS_SEED:
            await db.execute(
                "INSERT OR IGNORE INTO competitions (natjecanje_id, name, category) VALUES (?, ?, ?)",
                (nat_id, name, category),
            )
        await db.commit()


async def save_competition_data(natjecanje_id: int, standings: list, matches: list):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    async with aiosqlite.connect(DB_PATH) as db:
        # Clear old data
        await db.execute("DELETE FROM standings WHERE natjecanje_id = ?", (natjecanje_id,))
        await db.execute("DELETE FROM matches   WHERE natjecanje_id = ?", (natjecanje_id,))

        # Insert standings
        for row in standings:
            await db.execute(
                """INSERT INTO standings
                   (natjecanje_id, rank, team, played, won, drawn, lost, goals_for, goals_against, points)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    natjecanje_id,
                    row.get("rank"),
                    row.get("team"),
                    row.get("played"),
                    row.get("won"),
                    row.get("drawn"),
                    row.get("lost"),
                    row.get("goals_for"),
                    row.get("goals_against"),
                    row.get("points"),
                ),
            )

        # Insert matches
        for m in matches:
            await db.execute(
                """INSERT INTO matches
                   (natjecanje_id, round, date, home_team, away_team, home_score, away_score, status, venue)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    natjecanje_id,
                    m.get("round"),
                    m.get("date"),
                    m.get("home_team"),
                    m.get("away_team"),
                    m.get("home_score"),
                    m.get("away_score"),
                    m.get("status", "upcoming"),
                    m.get("venue"),
                ),
            )

        await db.execute(
            "UPDATE competitions SET last_updated = ? WHERE natjecanje_id = ?",
            (now, natjecanje_id),
        )
        await db.commit()


async def get_all_data() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        result = []

        async with db.execute("SELECT * FROM competitions ORDER BY natjecanje_id") as cur:
            competitions = await cur.fetchall()

        for comp in competitions:
            nat_id = comp["natjecanje_id"]

            async with db.execute(
                "SELECT * FROM standings WHERE natjecanje_id = ? ORDER BY rank",
                (nat_id,),
            ) as cur:
                standings = [dict(r) for r in await cur.fetchall()]

            async with db.execute(
                """SELECT * FROM matches WHERE natjecanje_id = ?
                   ORDER BY
                     CASE status WHEN 'upcoming' THEN 0 ELSE 1 END,
                     date""",
                (nat_id,),
            ) as cur:
                matches = [dict(r) for r in await cur.fetchall()]

            result.append(
                {
                    "natjecanje_id": nat_id,
                    "name": comp["name"],
                    "category": comp["category"],
                    "last_updated": comp["last_updated"],
                    "standings": standings,
                    "matches": matches,
                }
            )

        return result
