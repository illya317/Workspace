import type { Prisma } from "@workspace/platform/server/prisma";
import { validateFinanceCloseEvidenceSnapshotPersistence } from "../domain/close-persistence-validation";

type EvidenceSnapshotStore = Pick<Prisma.TransactionClient, "financeCloseEvidenceSnapshot">;

interface EvidenceSnapshotInput {
  taskId: number;
  taskKey: string;
  inputFingerprint: string;
  contributorVersion: string;
  payloadSha256: string;
  payload: Prisma.InputJsonValue;
}

export class FinanceCloseEvidenceSnapshotConflict extends Error {}

export async function createOrReadFinanceCloseEvidenceSnapshot(
  client: EvidenceSnapshotStore,
  input: EvidenceSnapshotInput,
) {
  const validated = validateFinanceCloseEvidenceSnapshotPersistence(input);
  if (!validated.ok) throw new FinanceCloseEvidenceSnapshotConflict(validated.issue.message);
  input = validated.data;
  const identity = {
    taskId: input.taskId,
    inputFingerprint: input.inputFingerprint,
    contributorVersion: input.contributorVersion,
  };
  await client.financeCloseEvidenceSnapshot.createMany({
    data: [{ ...identity, payloadSha256: input.payloadSha256, payload: input.payload }],
    skipDuplicates: true,
  });
  const evidence = await client.financeCloseEvidenceSnapshot.findUnique({
    where: { taskId_inputFingerprint_contributorVersion: identity },
    select: { id: true, payloadSha256: true },
  });
  if (!evidence) {
    throw new FinanceCloseEvidenceSnapshotConflict(`任务 ${input.taskKey} 的证据快照未能持久化`);
  }
  if (evidence.payloadSha256 !== input.payloadSha256) {
    throw new FinanceCloseEvidenceSnapshotConflict(`任务 ${input.taskKey} 的证据指纹发生冲突`);
  }
  return evidence;
}
