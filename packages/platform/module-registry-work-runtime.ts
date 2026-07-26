import type { WorkspacePackageRegistration } from "@workspace/core";

export const WORK_RUNTIME_REGISTRY_FRAGMENT = {
  apiRoutes: [
    { method: "POST", pathPrefix: "/api/modules/work/internal/account", access: "internal", notes: "Signed internal RPC for account inbox and Work preferences; only the Workspace Shell caller unit is accepted." },
    { method: "POST", pathPrefix: "/api/modules/work/internal/business-space-access", access: "internal", notes: "Signed internal RPC for natural project-space access; only the Finance caller unit is accepted." },
    { method: "POST", pathPrefix: "/api/modules/work/agent/rpc", access: "internal", notes: "Signed internal RPC Work Agent catalog and execution boundary; only the Assistant caller unit is accepted." },
  ],
} satisfies Pick<WorkspacePackageRegistration, "apiRoutes">;
