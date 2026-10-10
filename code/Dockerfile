# ------------------------------------------------
# Stage 1: Build the TypeScript application

# Start with a NodeJS image
FROM node:22 AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Run the project's canonical build (tsc + copy config.yml to dist/). The
# resulting dist/config.yml is a complete, independently valid configuration.
RUN npm run build

# ------------------------------------------------
# Stage 2: Create the final image

# Start with a NodeJS image
FROM node:22

# Set the working directory
WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/dist ./dist
# Swagger scans src/routes/**/*.ts at startup — only that subset is needed,
# not the entire source tree.
COPY --from=builder /app/src/routes ./src/routes
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm install --only=production && npm cache clean --force

# WORKDIR is /app (not /app/dist) so the canonical CWD-relative config fallback
# (./dist/config.yml) resolves exactly as it does on bare metal. A mounted
# /app/configs/config.yml always takes precedence over the fallback.
# Run as the node image's unprivileged node user (uid 1000, gid 1000). The
# mounted /app/configs directory must be host-owned by uid/gid 1000:1000 so
# /api/write-config can persist (temp file + rename) - see docker-refresh.sh.
USER node

# Exposed ports
EXPOSE 32000

# Healthcheck: verify the process is alive (liveness)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:32000/health || exit 1

# Command to run the application
CMD ["node", "dist/index.js"]
