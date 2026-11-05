# Build from the repo root: docker build -f apps/backend/Dockerfile -t qd-backend .
FROM node:22-slim AS build
RUN corepack enable && apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter @qd/backend...
COPY apps/backend apps/backend
WORKDIR /repo/apps/backend
RUN pnpm prisma generate && pnpm build

FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
