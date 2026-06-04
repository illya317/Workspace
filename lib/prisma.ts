import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import os from "os";
import path from "path";

function expandTilde(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function getDbPath(): string {
  const raw = process.env.DATABASE_URL?.replace("file:", "") ?? "./prisma/dev.db";
  return expandTilde(raw);
}

const REQUIRED_DELEGATES = ["financeBalanceSnapshot", "financeBalanceSnapshotRow", "agentProposal"] as const;

type RequiredDelegate = (typeof REQUIRED_DELEGATES)[number];
type CachedPrismaClient = PrismaClient & Partial<Record<RequiredDelegate, unknown>>;

const globalForPrisma = global as unknown as { prisma?: CachedPrismaClient; prismaDbPath?: string };

function isCurrentPrismaClient(client: CachedPrismaClient | undefined): client is PrismaClient {
  return Boolean(
    client &&
      REQUIRED_DELEGATES.every((delegate) => {
        const value = client[delegate];
        return value && typeof value === "object";
      }),
  );
}

function createPrismaClient(): PrismaClient {
  const currentDbPath = getDbPath();
  const cachedPrisma = globalForPrisma.prisma;
  const cachedDbPath = globalForPrisma.prismaDbPath;
  const shouldReuse = isCurrentPrismaClient(cachedPrisma) && cachedDbPath === currentDbPath;

  if (shouldReuse && cachedPrisma) {
    return cachedPrisma as PrismaClient;
  }

  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: currentDbPath }) });

  if (process.env.NODE_ENV !== "production") {
    if (cachedPrisma && cachedPrisma !== client) {
      void cachedPrisma.$disconnect().catch(() => undefined);
    }
    globalForPrisma.prisma = client;
    globalForPrisma.prismaDbPath = currentDbPath;
  }

  return client;
}

// Lazy proxy: PrismaClient is created on first property access,
// ensuring process.env.DATABASE_URL is already set (dotenv loads it above).
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = createPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
