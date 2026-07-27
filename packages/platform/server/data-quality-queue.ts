import "server-only";

import { getDataQualityPolicy } from "./data-quality-policy";
import { Prisma, prisma } from "./prisma";

type DataQualityDbClient = Prisma.TransactionClient | typeof prisma;

export async function enqueueDataQualityEvaluation(
  input: { domain: string; entityType: string; entityId: string | number },
  client: DataQualityDbClient = prisma,
) {
  return enqueueDataQualityEvaluations([input], client);
}

export async function enqueueDataQualityEvaluations(
  inputs: Array<{ domain: string; entityType: string; entityId: string | number }>,
  client: DataQualityDbClient = prisma,
) {
  if (inputs.length === 0) return null;
  const policy = await getDataQualityPolicy();
  if (!policy.mutationTrigger.enabled) return null;
  return client.dataQualityEvaluationRequest.createMany({
    data: inputs.map((input) => ({
      domain: input.domain,
      entityType: input.entityType,
      entityId: String(input.entityId),
    })),
  });
}
