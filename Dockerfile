# syntax=docker/dockerfile:1

# ---------- Build: Abhängigkeiten und Projekt mit uv in ein venv installieren ----------
FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Erst nur die Abhängigkeiten (gut cachebar)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev --no-editable

# Dann das Projekt selbst
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

# ---------- Runtime: schlankes Python-Image ohne uv ----------
FROM python:3.14-slim-trixie

RUN useradd --system --uid 10001 --home-dir /app app \
    && mkdir -p /data && chown app /data

WORKDIR /app
COPY --from=builder --chown=app /app/.venv /app/.venv
COPY --chown=app static ./static

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    STATIC_DIR=/app/static \
    HIGHSCORE_DB=/data/highscores.db

USER app
VOLUME /data
EXPOSE 8000

CMD ["hello-world"]
