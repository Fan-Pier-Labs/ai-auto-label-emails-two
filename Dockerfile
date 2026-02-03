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
ENV NEXT_TEMPLATE_SHEET_URL="https://docs.google.com/spreadsheets/d/1oRvLEi2uj0ENbJ42EyINLzWcbC92HwGriMq5ejKhXYM/edit?gid=0#gid=0"
ENV NEXT_PUBLIC_SENTRY_DSN=https://e7a7507393aefe55d824ccb80865a1c5@o4509283904323584.ingest.us.sentry.io/4510797815545856
ENV SENTRY_ORG=fan-pier-labs
ENV SENTRY_PROJECT=ai-auto-label-emails
ENV SENTRY_AUTH_TOKEN=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
ENV NEXT_APP_URL=https://ai-email-labels.fanpierlabs.com

# Health check (uses scripts/healthcheck.ts via package.json)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "run", "healthcheck"]

CMD ["bun", "run", "start"]
