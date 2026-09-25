# syntax=docker/dockerfile:1

# One image for all three backend roles — API, scheduler, one-off scripts.
# They share every dependency and differ only in the command, so separate
# images would be three copies of the same layers to keep in step.
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Requirements first: the layer survives every source edit, and installing
# them is the slow half of the build.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

# Non-root. The one thing written at runtime is uploaded images, into
# /data/media — a volume in compose. Created here, owned by the app user, so
# the empty volume inherits that ownership on first mount.
RUN useradd --create-home --uid 10001 pamesentra \
    && mkdir -p /data/media \
    && chown -R pamesentra:pamesentra /app /data/media
USER pamesentra

EXPOSE 8000

# Overridden by the scheduler service in compose.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
