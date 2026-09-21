# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps — node_modules alone, so a source edit does not reinstall them
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Every NEXT_PUBLIC_ variable is inlined into the client bundle at build time,
# not read at boot — so these are build args, and an image built for one
# deployment cannot be pointed at another by changing the environment.
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
ARG NEXT_PUBLIC_ASSOCIATION=epsip-ipeirou
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ASSOCIATION=$NEXT_PUBLIC_ASSOCIATION \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------------------------------------------------------------------------
# runtime — the standalone bundle, without the build or its node_modules
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 10001 -S pamesentra && adduser -u 10001 -S pamesentra -G pamesentra

COPY --from=build --chown=pamesentra:pamesentra /app/.next/standalone ./
COPY --from=build --chown=pamesentra:pamesentra /app/.next/static ./.next/static
# No public/ directory today — the app router keeps its icons under src/app.
# Add a COPY for it here the day static files appear, or they are served 404.

USER pamesentra
EXPOSE 3000

CMD ["node", "server.js"]
