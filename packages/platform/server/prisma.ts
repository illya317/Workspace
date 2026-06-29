import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma/client";
import os from "os";
import path from "path";

export { Prisma, PrismaClient } from "../../../generated/prisma/client";
export type {
  DueDiligenceMaterialSelection,
  DueDiligenceQuestion,
  DueDiligenceRequest,
  LibraryDocument,
  LibraryDocumentVersion,
} from "../../../generated/prisma/client";

function expandTilde(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function getDbPath(): string {
  const databaseUrl =
    process.env.DATABASE_URL?.trim() ||
    (process.env.CI ? `file:${path.resolve(process.cwd(), ".cache/prisma/ci-dev.db")}` : "");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required and must be an absolute file: path");
  }
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use file: for this SQLite deployment");
  }
  const raw = databaseUrl.slice("file:".length).replace(/^"|"$/g, "");
  const dbPath = expandTilde(raw);
  if (!path.isAbsolute(dbPath)) {
    throw new Error(`DATABASE_URL must be absolute; relative SQLite paths split data by cwd: ${raw}`);
  }
  return dbPath;
}

const REQUIRED_DELEGATES = ["financeBalanceSnapshot", "financeBalanceSnapshotRow", "agentProposal", "openApiClient", "notification", "projectTask", "workReport", "workReportItem"] as const;

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

  if (cachedPrisma && cachedPrisma !== client && process.env.NODE_ENV !== "production") {
    void cachedPrisma.$disconnect().catch(() => undefined);
  }
  globalForPrisma.prisma = client;
  globalForPrisma.prismaDbPath = currentDbPath;

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
