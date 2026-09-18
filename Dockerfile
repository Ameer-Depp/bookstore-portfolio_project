# ────────────────────────────────────────────────────────────
# Stage 1: builder
# Installs all deps (including dev), compiles TypeScript.
# ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifest files first — this lets Docker cache the npm install
# layer independently of source code changes.
COPY package*.json ./

# `npm ci` respects the lockfile exactly; `--include=dev` ensures
# typescript / nest-cli are available for the build step.
RUN npm ci --include=dev

# Copy the source
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

# Compile TypeScript → dist/
RUN npm run build

# ────────────────────────────────────────────────────────────
# Stage 2: production
# Minimal runtime image: only prod deps + compiled output.
# ────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production-only deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from the builder
COPY --from=builder /app/dist ./dist

# Non-root user — never run a Node server as root in prod
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

# Docker-native healthcheck hits our existing /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]