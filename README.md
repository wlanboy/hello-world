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

## Docker

Das Image baut das Projekt mit uv in einem Build-Stage und läuft dann auf `python:3.14-slim` als Nicht-root-User.
Die Highscores liegen in `/data/highscores.db` – dafür ein Volume mounten, sonst sind sie beim Löschen des Containers weg.

### Bauen und lokal starten

```bash
docker build -t hello-world:dev .
docker run --rm -p 8000:8000 -v tetris-data:/data hello-world:dev
```

Dann http://localhost:8000 öffnen.

### Taggen

Image-Name in der GitHub Container Registry: `ghcr.io/wlanboy/hello-world`.

```bash
VERSION=0.1.0                      # passend zu pyproject.toml
IMAGE=ghcr.io/wlanboy/hello-world

docker build -t $IMAGE:$VERSION -t $IMAGE:latest .
# oder ein bereits gebautes Image nachträglich taggen:
docker tag hello-world:dev $IMAGE:$VERSION
docker tag hello-world:dev $IMAGE:latest
```

### Publishen (GitHub Container Registry)

1. Auf GitHub einen Personal Access Token (classic) mit dem Scope `write:packages` anlegen
   (Settings → Developer settings → Personal access tokens).
2. Einloggen und pushen:

   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u wlanboy --password-stdin
   docker push $IMAGE:$VERSION
   docker push $IMAGE:latest
   ```

3. Neue Pakete sind auf GHCR zunächst privat. Für öffentliches Pullen unter
   github.com/wlanboy?tab=packages → `hello-world` → Package settings → Visibility auf *Public* stellen.

Für Docker Hub statt GHCR: `IMAGE=wlanboy/hello-world` setzen und `docker login` ohne Registry-Angabe nutzen.

### Multi-Arch (z. B. zusätzlich für Raspberry Pi)

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t $IMAGE:$VERSION -t $IMAGE:latest --push .
```

### Starten aus der Registry

```bash
docker run -d --name tetris -p 8000:8000 -v tetris-data:/data --restart unless-stopped ghcr.io/wlanboy/hello-world:latest
```

oder per Compose:

```yaml
services:
  tetris:
    image: ghcr.io/wlanboy/hello-world:latest
    ports:
      - "8000:8000"
    volumes:
      - tetris-data:/data
    restart: unless-stopped

volumes:
  tetris-data:
```
