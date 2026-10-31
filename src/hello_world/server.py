import html
import os
import socket
import sqlite3
from contextlib import asynccontextmanager, closing
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
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


def host_ips() -> list[str]:
    try:
        return sorted(set(socket.gethostbyname_ex(socket.gethostname())[2]))
    except OSError:
        return []


def canonical_header(name: str) -> str:
    return "-".join(part.capitalize() for part in name.split("-"))


WHOAMI_PAGE = """<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>whoami</title>
  <link rel="stylesheet" href="/whoami.css">
</head>
<body>
  <main>
    <h1>whoami</h1>
    <dl class="panel">{info}</dl>
    <code class="panel request-line">{request_line}</code>
    <table class="panel">
      <thead><tr><th>Header</th><th>Wert</th></tr></thead>
      <tbody>{headers}</tbody>
    </table>
    <a class="play" href="/tetris/">▶ Play</a>
  </main>
</body>
</html>
"""


@app.get("/", include_in_schema=False)
def whoami(request: Request) -> Response:
    """Zeigt Host, Client und alle Request-Header; HTML für Browser, Text für curl."""
    client = request.client
    info = [
        ("Hostname", socket.gethostname()),
        *(("IP", ip) for ip in host_ips()),
        ("RemoteAddr", f"{client.host}:{client.port}" if client else "-"),
    ]
    target = request.url.path + (f"?{request.url.query}" if request.url.query else "")
    request_line = f"{request.method} {target} HTTP/{request.scope.get('http_version', '1.1')}"
    headers = [
        (canonical_header(k.decode("latin-1")), v.decode("latin-1"))
        for k, v in request.scope["headers"]
    ]

    if "text/html" not in request.headers.get("accept", ""):
        lines = [f"{k}: {v}" for k, v in info] + [request_line] + [f"{k}: {v}" for k, v in headers]
        return PlainTextResponse("\n".join(lines) + "\n")

    esc = html.escape
    return HTMLResponse(
        WHOAMI_PAGE.format(
            info="".join(f"<dt>{esc(k)}</dt><dd>{esc(v)}</dd>" for k, v in info),
            request_line=esc(request_line),
            headers="".join(f"<tr><td>{esc(k)}</td><td>{esc(v)}</td></tr>" for k, v in headers),
        )
    )


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def main() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
    )
