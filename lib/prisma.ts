import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "./prisma/dev.db";

const adapter = new PrismaBetterSqlite3({ url: dbPath });

const REQUIRED_DELEGATES = ["financeBalanceSnapshot", "financeBalanceSnapshotRow", "agentProposal"] as const;

type RequiredDelegate = (typeof REQUIRED_DELEGATES)[number];
type CachedPrismaClient = PrismaClient & Partial<Record<RequiredDelegate, unknown>>;

const globalForPrisma = global as unknown as { prisma?: CachedPrismaClient };

function isCurrentPrismaClient(client: CachedPrismaClient | undefined): client is PrismaClient {
  return Boolean(
    client &&
      REQUIRED_DELEGATES.every((delegate) => {
        const value = client[delegate];
        return value && typeof value === "object";
      }),
  );
}

const cachedPrisma = globalForPrisma.prisma;

export const prisma = isCurrentPrismaClient(cachedPrisma)
  ? cachedPrisma
  : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  if (cachedPrisma && cachedPrisma !== prisma) {
    void cachedPrisma.$disconnect().catch(() => undefined);
  }
  globalForPrisma.prisma = prisma;
}
