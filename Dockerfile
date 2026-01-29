FROM oven/bun:1

WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy application code
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Expose port and start (must match deploy.yaml task.port for ELB health checks)
EXPOSE 8080
ENV PORT=8080

# Health check (uses scripts/healthcheck.ts via package.json)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "run", "healthcheck"]

CMD ["bun", "run", "start"]
