import { requireAuth } from "@workspace/platform/server/auth";
import { ModuleDisabledPageView } from "@workspace/platform/ui/system/ModuleDisabledPage";

export default async function ModuleDisabledPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; resourceKey?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  const reason = params.reason || "模块未启用";

  return ModuleDisabledPageView({ reason, resourceKey: params.resourceKey, user });
}
