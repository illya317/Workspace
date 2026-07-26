import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";

export { Prisma, PrismaClient } from "../../../generated/prisma/client";
export type {
  DueDiligenceMaterialSelection,
  DueDiligenceQuestion,
  DueDiligenceRequest,
  LibraryDocument,
  LibraryDocumentVersion,
} from "../../../generated/prisma/client";

const REQUIRED_DELEGATES = ["financeBalanceSnapshot", "financeBalanceSnapshotRow", "financeAssetCard", "inventoryItem", "inventoryLedgerEntry", "party", "partyNameHistory", "externalPartyRole", "ownershipInterest", "shareCapitalSnapshotPosition", "shareholderGroup", "shareholderGroupMembership", "agentProfile", "agentRuntimeBinding", "agentSession", "agentProposal", "agentRun", "openApiClient", "notification", "workReport", "workReportItem", "approvalRequest", "approvalEvent", "workflowPolicy", "permissionGrantLedgerEvent", "dataQualityRun", "dataQualityCheckState", "dataQualityFinding", "dataQualityNotificationDelivery", "dataQualityEvaluationRequest"] as const;

type RequiredDelegate = (typeof REQUIRED_DELEGATES)[number];
type CachedPrismaClient = PrismaClient & Partial<Record<RequiredDelegate, unknown>>;

const globalForPrisma = global as unknown as {
  prisma?: CachedPrismaClient;
  prismaDatabaseUrl?: string;
};

function requiredPostgresqlUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the PostgreSQL deployment");
  }
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DATABASE_URL must use postgresql:// for the PostgreSQL deployment");
  }
  return databaseUrl;
}

function integerSetting(name: string, fallback: number, minimum: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return value;
}

function isCurrentPrismaClient(client: CachedPrismaClient | undefined): client is PrismaClient {
  return Boolean(
    client
      && REQUIRED_DELEGATES.every((delegate) => {
        const value = client[delegate];
        return value && typeof value === "object";
      }),
  );
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = requiredPostgresqlUrl();
  const cachedPrisma = globalForPrisma.prisma;
  const shouldReuse = isCurrentPrismaClient(cachedPrisma)
    && globalForPrisma.prismaDatabaseUrl === databaseUrl;

  if (shouldReuse && cachedPrisma) return cachedPrisma as PrismaClient;

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: integerSetting("PG_POOL_MAX", 10, 1),
    connectionTimeoutMillis: integerSetting("PG_CONNECTION_TIMEOUT_MS", 5_000, 1),
    idleTimeoutMillis: integerSetting("PG_IDLE_TIMEOUT_MS", 10_000, 0),
    application_name: process.env.PG_APPLICATION_NAME?.trim() || "workspace",
  });
  const client = new PrismaClient({ adapter });

  if (cachedPrisma && cachedPrisma !== client && process.env.NODE_ENV !== "production") {
    void cachedPrisma.$disconnect().catch(() => undefined);
  }
  globalForPrisma.prisma = client;
  globalForPrisma.prismaDatabaseUrl = databaseUrl;
  return client;
}

// Lazy proxy keeps environment loading deterministic for CLI/tests while still
// maintaining exactly one PrismaPg pool per Node process and connection URL.
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
