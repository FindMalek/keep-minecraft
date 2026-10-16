FROM oven/bun:1.4.2-alpine
WORKDIR /app
# Dev dependencies too: the Tailwind plugin bundles the page when the server starts.
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER bun
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["bun", "src/server.ts"]
