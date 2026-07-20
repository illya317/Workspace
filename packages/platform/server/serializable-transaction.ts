import { Prisma, prisma } from "./prisma";

export class SerializableTransactionConflictError extends Error {
  constructor() {
    super("并发写入导致事务冲突，请刷新后重试");
    this.name = "SerializableTransactionConflictError";
  }
}

const DEFAULT_MAX_ATTEMPTS = 8;
const MAX_RETRY_DELAY_MS = 160;

function serializationRetryDelayMs(attempt: number) {
  const baseDelay = Math.min(10 * (2 ** Math.max(attempt - 1, 0)), MAX_RETRY_DELAY_MS);
  return baseDelay + Math.floor(Math.random() * (baseDelay + 1));
}

function waitForSerializationRetry(attempt: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, serializationRetryDelayMs(attempt));
  });
}

/**
 * Runs a mutation at PostgreSQL Serializable isolation and retries serialization/deadlock conflicts.
 * Callers must keep the callback database-only and free of external side effects.
 */
export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable) throw error;
      if (attempt === maxAttempts) throw new SerializableTransactionConflictError();
      await waitForSerializationRetry(attempt);
    }
  }
  throw new SerializableTransactionConflictError();
}
