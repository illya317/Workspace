# 丰华工作台 - 腾讯云 CloudBase 云托管 Dockerfile
# 基于 Node.js 官方镜像，支持 Next.js 16 + Prisma + SQLite

# ---- 构建阶段 ----
FROM node:22-alpine AS builder

WORKDIR /app

# 安装系统依赖（Prisma 需要）
RUN apk add --no-cache openssl

# 复制依赖文件并安装
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# 复制源码并构建
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---- 生产阶段 ----
FROM node:22-alpine AS runner

WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建持久化数据目录（用于挂载 CloudBase CFS）
RUN mkdir -p /data

# 复制 standalone 构建产物
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 默认使用容器内数据库路径（生产环境通过环境变量覆盖为 /data）
ENV DATABASE_URL="file:/app/prisma/dev.db"

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
