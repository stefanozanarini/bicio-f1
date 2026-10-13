# ---- Build: client (Vite) + server (esbuild) ----
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/sim-core/package.json packages/sim-core/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
RUN npm run build && npm prune --omit=dev

# ---- Runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 PUBLIC_DIR=/app/public
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/server/dist ./server
COPY --from=build /src/packages/client/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.js"]
