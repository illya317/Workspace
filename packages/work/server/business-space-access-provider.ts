import { registerBusinessSpaceNaturalAccessProvider } from "@workspace/platform/server/business-space-access-providers";

import { getAccessibleProjectWorkspaceEntry } from "./access";

let registered = false;

export function registerWorkBusinessSpaceNaturalAccessProvider() {
  if (registered) return;
  registerBusinessSpaceNaturalAccessProvider({
    targetType: "project",
    resolveActionProfile: async ({ userId, targetId }) => (
      (await getAccessibleProjectWorkspaceEntry({ userId, projectId: targetId })).ok
        ? "read"
        : null
    ),
  });
  registered = true;
}
