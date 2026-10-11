import os
import sqlite3
from contextlib import asynccontextmanager, closing
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "static"))
DB_PATH = Path(os.environ.get("HIGHSCORE_DB", "highscores.db"))
TOP_N = 10


class ScoreIn(BaseModel):
    name: str = Field(min_length=1, max_length=20, pattern=r"^[^<>]+$")
    score: int = Field(ge=0, le=10_000_000)
    lines: int = Field(ge=0, le=100_000)
    level: int = Field(ge=1, le=1_000)


class ScoreOut(ScoreIn):
    created_at: str


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(connect()) as conn, conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS highscores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                score INTEGER NOT NULL,
                lines INTEGER NOT NULL,
                level INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


def top_scores() -> list[ScoreOut]:
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT name, score, lines, level, created_at FROM highscores "
            "ORDER BY score DESC, created_at ASC LIMIT ?",
            (TOP_N,),
        ).fetchall()
    return [ScoreOut(**dict(row)) for row in rows]


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Tetris Highscores", lifespan=lifespan)


@app.get("/api/highscores")
def get_highscores() -> list[ScoreOut]:
    return top_scores()


@app.post("/api/highscores", status_code=201)
def post_highscore(entry: ScoreIn) -> list[ScoreOut]:
    with closing(connect()) as conn, conn:
        conn.execute(
            "INSERT INTO highscores (name, score, lines, level, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                entry.name.strip(),
                entry.score,
                entry.lines,
                entry.level,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
    return top_scores()


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def main() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
    )
