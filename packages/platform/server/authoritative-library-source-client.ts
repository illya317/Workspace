import "server-only";

import {
  authoritativeLibraryArtifactsSchema,
} from "./authoritative-library-source-contract";
import { callWorkspaceInternalJson } from "./internal-unit-rpc";

const LIBRARY_UNIT_ID = "library";

export async function loadRemoteAuthoritativeLibraryArtifact(input: {
  ownerUnitId: string;
  routeModuleKey?: string;
  sourceKey: string;
}) {
  const routeModuleKey = input.routeModuleKey ?? input.ownerUnitId;
  const artifacts = await callWorkspaceInternalJson({
    callerUnitId: LIBRARY_UNIT_ID,
    path: `/api/modules/${routeModuleKey}/internal/library-source`,
    targetUnitId: input.ownerUnitId,
    body: { sourceKey: input.sourceKey },
  });
  const parsed = authoritativeLibraryArtifactsSchema.safeParse(artifacts);
  if (!parsed.success) throw new Error("权威资料来源返回了无效快照");
  if (parsed.data.some((artifact) => (
    artifact.ownerUnitId !== input.ownerUnitId || artifact.sourceKey !== input.sourceKey
  ))) {
    throw new Error("权威资料来源身份不匹配");
  }
  return parsed.data;
}
