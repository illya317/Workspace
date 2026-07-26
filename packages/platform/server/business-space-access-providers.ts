import type { NaturalSpaceActionProfile } from "../permission-natural-space-actions";
import { callWorkspaceInternalJson } from "./internal-unit-rpc";

export type BusinessSpaceNaturalAccessProvider = {
  targetType: string;
  resolveActionProfile: (input: {
    userId: number;
    targetId: number;
  }) => Promise<NaturalSpaceActionProfile | null>;
};

const providers = new Map<string, BusinessSpaceNaturalAccessProvider>();

export function registerBusinessSpaceNaturalAccessProvider(
  provider: BusinessSpaceNaturalAccessProvider,
) {
  providers.set(provider.targetType, provider);
}

export function registerRemoteBusinessSpaceNaturalAccessProvider(input: {
  callerUnitId: string;
  ownerUnitId: string;
  targetType: string;
}) {
  for (const [label, value] of [["caller unit", input.callerUnitId], ["owner unit", input.ownerUnitId]] as const) {
    if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new Error(`Remote business-space ${label} is invalid`);
  }
  registerBusinessSpaceNaturalAccessProvider({
    targetType: input.targetType,
    resolveActionProfile: async ({ userId, targetId }) => {
      const result = await callWorkspaceInternalJson<{ actionProfile: NaturalSpaceActionProfile | null }>({
        callerUnitId: input.callerUnitId,
        path: `/api/modules/${input.ownerUnitId}/internal/business-space-access`,
        targetUnitId: input.ownerUnitId,
        body: { userId, targetType: input.targetType, targetId },
      });
      return result.actionProfile;
    },
  });
}

export async function resolveRegisteredBusinessSpaceNaturalActionProfile(
  userId: number,
  targetType: string,
  targetId: number,
) {
  const provider = providers.get(targetType);
  return provider?.resolveActionProfile({ userId, targetId }) ?? null;
}
