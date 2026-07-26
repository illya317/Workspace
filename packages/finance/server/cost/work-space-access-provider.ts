import { registerRemoteBusinessSpaceNaturalAccessProvider } from "@workspace/platform/server/business-space-access-providers";

let registered = false;

export function registerFinanceWorkSpaceAccessProvider() {
  if (registered) return;
  registerRemoteBusinessSpaceNaturalAccessProvider({
    ownerUnitId: "work",
    callerUnitId: "finance",
    targetType: "project",
  });
  registered = true;
}
