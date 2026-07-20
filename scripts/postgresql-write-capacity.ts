import "dotenv/config";

import { prisma } from "@workspace/platform/server/prisma";
import { runSerializableTransaction } from "@workspace/platform/server/serializable-transaction";
import { requirePostgresqlCiDatabase } from "./testing/e2e-database";

const CONCURRENT_INDEPENDENT_WRITES = 24;
const CONCURRENT_CONTENDED_WRITES = 8;
const WRITE_CAPACITY_TIMEOUT_MS = 10_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`write capacity gate exceeded ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function incrementContendedValue(key: string) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.systemConfig.findUniqueOrThrow({ where: { key } });
    await tx.$executeRaw`SELECT pg_sleep(0.01)`;
    return tx.systemConfig.update({
      where: { key },
      data: { value: String(Number(current.value) + 1) },
    });
  });
}

async function main() {
  const database = requirePostgresqlCiDatabase();
  const prefix = `write-capacity-${process.pid}-${Date.now()}`;
  const contendedKey = `${prefix}-counter`;
  const independentKeys = Array.from(
    { length: CONCURRENT_INDEPENDENT_WRITES },
    (_, index) => `${prefix}-independent-${index + 1}`,
  );

  console.log(`✓ write capacity gate is isolated to a *_ci database (${database.databaseName})`);
  try {
    const independentStartedAt = performance.now();
    await withTimeout(Promise.all(independentKeys.map((key) => (
      prisma.systemConfig.create({ data: { key, value: "created" } })
    ))), WRITE_CAPACITY_TIMEOUT_MS);
    const independentElapsedMs = Math.round(performance.now() - independentStartedAt);
    assert(
      await prisma.systemConfig.count({ where: { key: { in: independentKeys } } }) === CONCURRENT_INDEPENDENT_WRITES,
      `${CONCURRENT_INDEPENDENT_WRITES} independent writes commit without pool loss (${independentElapsedMs} ms)`,
    );

    await prisma.systemConfig.create({ data: { key: contendedKey, value: "0" } });
    const contendedStartedAt = performance.now();
    const results = await withTimeout(
      Promise.allSettled(Array.from(
        { length: CONCURRENT_CONTENDED_WRITES },
        () => incrementContendedValue(contendedKey),
      )),
      WRITE_CAPACITY_TIMEOUT_MS,
    );
    const contendedElapsedMs = Math.round(performance.now() - contendedStartedAt);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    assert(
      failures.length === 0,
      `${CONCURRENT_CONTENDED_WRITES} contended Serializable writes survive bounded retries (${contendedElapsedMs} ms)`,
    );
    const counter = await prisma.systemConfig.findUniqueOrThrow({ where: { key: contendedKey } });
    assert(
      Number(counter.value) === CONCURRENT_CONTENDED_WRITES,
      "contended writes converge without lost updates",
    );
  } finally {
    await prisma.systemConfig.deleteMany({ where: { key: { startsWith: prefix } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
