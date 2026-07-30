export interface DeploymentProfileSpec {
  id: string;
  version: number;
  label: string;
  unitIds: readonly string[];
  rollout: {
    strategy: "shadow-all-then-atomic-gateway";
    automaticRollback: true;
    requireSameSourceTree: false;
    requireSignedProvenance: true;
  };
}

export const deploymentProfileSpecs: readonly DeploymentProfileSpec[] = [
  {
    id: "full",
    version: 2,
    label: "Workspace 全功能",
    unitIds: [
      "workspace-shell",
      "finance",
      "external",
      "inventory",
      "production",
      "hr",
      "library",
      "docs",
      "assistant",
      "capital-securities",
      "work",
      "administration",
      "news",
    ],
    rollout: {
      strategy: "shadow-all-then-atomic-gateway",
      automaticRollback: true,
      requireSameSourceTree: false,
      requireSignedProvenance: true,
    },
  },
  {
    id: "finance-focused",
    version: 2,
    label: "财务经营协同",
    unitIds: [
      "workspace-shell",
      "finance",
      "hr",
      "work",
      "library",
      "docs",
      "assistant",
      "capital-securities",
      "administration",
    ],
    rollout: {
      strategy: "shadow-all-then-atomic-gateway",
      automaticRollback: true,
      requireSameSourceTree: false,
      requireSignedProvenance: true,
    },
  },
] as const;
