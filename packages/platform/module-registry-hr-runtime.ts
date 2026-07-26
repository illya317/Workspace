import type { WorkspacePackageRegistration } from "@workspace/core";

export const HR_RUNTIME_REGISTRY_FRAGMENT = {
  apiRoutes: [
    { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", access: "protected", notes: "Performance workflow draft/action routes are action-mapped by permission-api-action-policy and enforced by hrPerformanceApprovalAdapter." },
    { method: "PUT", pathPrefix: "/api/modules/hr/performance/submissions", access: "protected", notes: "Performance workflow stage revisions are action-mapped by permission-api-action-policy and enforced by hrPerformanceApprovalAdapter." },
    { method: "POST", pathPrefix: "/api/modules/hr/internal/data-quality", access: "internal", notes: "Signed caller-bound HR data-quality provider; only the Workspace Shell caller unit is accepted." },
    { method: "POST", pathPrefix: "/api/modules/hr/internal/library-source", access: "internal", notes: "Signed caller-bound HR authoritative snapshot transport; only the Library caller unit is accepted." },
    { method: "POST", pathPrefix: "/api/modules/hr/agent/rpc", access: "internal", notes: "Signed caller-bound HR Agent catalog and execution boundary; only the Assistant caller unit is accepted." },
  ],
} satisfies Pick<WorkspacePackageRegistration, "apiRoutes">;
