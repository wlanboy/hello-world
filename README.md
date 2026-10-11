# Tetris

Statisches Tetris (HTML/CSS/JS ohne Frameworks) mit FastAPI-Backend für Highscores (SQLite).

## Starten

```bash
uv run hello-world
```

Dann http://127.0.0.1:8000 öffnen.

Entwicklung mit Auto-Reload:

```bash
uv run uvicorn hello_world.server:app --reload
```

Umgebungsvariablen: `HOST`, `PORT`, `HIGHSCORE_DB` (Standard: `highscores.db`), `STATIC_DIR`.

## API

- `GET /api/highscores` – Top 10
- `POST /api/highscores` – `{"name": "...", "score": 1234, "lines": 12, "level": 2}`, liefert die neue Top 10
