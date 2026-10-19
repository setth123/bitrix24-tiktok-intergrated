# syntax=docker/dockerfile:1

# ---- deps: cài toàn bộ dependency (cache theo package-lock) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- build: compile TypeScript, rồi bỏ devDependencies ----
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: image nhỏ, chỉ chứa dist + prod deps, chạy bằng user không phải root ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main"]
