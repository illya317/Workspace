import { Prisma, prisma } from "./prisma";

export class SerializableTransactionConflictError extends Error {
  constructor() {
    super("并发写入导致事务冲突，请刷新后重试");
    this.name = "SerializableTransactionConflictError";
  }
}

/**
 * Runs a mutation at PostgreSQL Serializable isolation and retries serialization/deadlock conflicts.
 * Callers must keep the callback database-only and free of external side effects.
 */
export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
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
    }
  }
  throw new SerializableTransactionConflictError();
}
