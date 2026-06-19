import {
  type Agent,
  type Classification,
  type FileClassification,
  classifyPR,
  explainClassification,
  normalizeAgent,
  pathMatchesPattern,
  uniqueFiles,
} from "./pr-classifier";

export type RiskLevel = "low" | "medium" | "high";
export type RoutingDecision = "approve" | "review" | "block";

export type DecisionReason = {
  code: string;
  message: string;
  files?: string[];
};

export type OrchestratorDecision = {
  version: 1;
  classification: {
    role: Classification;
    declaredRole: Agent | null;
    files: FileClassification[];
  };
  risk: {
    level: RiskLevel;
    reasons: DecisionReason[];
  };
  routing: {
    decision: RoutingDecision;
    reason: string;
  };
};

export type OrchestratorInput = {
  files: string[];
  declaredAgent?: string | null;
};

const HIGH_RISK_PATTERNS = [
  "orchestrator/**",
  ".github/**",
  "scripts/orchestrator-check.ts",
  "scripts/arch/**",
  "scripts/check/**",
  "core/**",
  "packages/core/**",
  "packages/platform/**",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "dependency-cruiser.config.cjs",
];

const MEDIUM_RISK_PATTERNS = [
  "prisma/**",
  "scripts/data/**",
  "scripts/import/**",
  "packages/*/import/**",
  "server/services/**",
];

export function evaluatePR(input: OrchestratorInput): OrchestratorDecision {
  const files = uniqueFiles(input.files);
  const declaredRole = normalizeAgent(input.declaredAgent);
  const classifications = explainClassification(files);
  const role = classifyPR(files);
  const reasons: DecisionReason[] = [];

  if (files.length === 0) {
    reasons.push({
      code: "no_changed_files",
      message: "No changed files were provided.",
    });
  }

  if (!declaredRole) {
    reasons.push({
      code: "invalid_declared_agent",
      message: "A single agent label is required: architecture, feature, data, or ops.",
    });
  }

  if (role === "unknown") {
    reasons.push({
      code: "unknown_route",
      message: "At least one changed file does not match an Orchestrator route.",
      files: classifications.filter((entry) => entry.agent === "unknown").map((entry) => entry.file),
    });
  }

  if (role === "mixed") {
    reasons.push({
      code: "mixed_route",
      message: "Changed files cross Orchestrator agent routes.",
      files,
    });
  }

  if (declaredRole && isConcreteRole(role) && declaredRole !== role) {
    reasons.push({
      code: "agent_mismatch",
      message: `Declared agent ${declaredRole} does not match classified route ${role}.`,
      files,
    });
  }

  const highRiskFiles = files.filter((file) => HIGH_RISK_PATTERNS.some((pattern) => pathMatchesPattern(file, pattern)));
  if (highRiskFiles.length > 0) {
    reasons.push({
      code: "high_risk_paths",
      message: "Changed files touch repository guardrails or architecture-sensitive paths.",
      files: highRiskFiles,
    });
  }

  const mediumRiskFiles = files.filter((file) => MEDIUM_RISK_PATTERNS.some((pattern) => pathMatchesPattern(file, pattern)));
  if (mediumRiskFiles.length > 0) {
    reasons.push({
      code: "medium_risk_paths",
      message: "Changed files touch data, import, or service paths.",
      files: mediumRiskFiles,
    });
  }

  const riskLevel = getRiskLevel(reasons);
  const blocked = reasons.some((reason) =>
    ["no_changed_files", "invalid_declared_agent", "unknown_route", "mixed_route", "agent_mismatch"].includes(reason.code),
  );
  const routingDecision: RoutingDecision = blocked ? "block" : riskLevel === "low" ? "approve" : "review";

  return {
    version: 1,
    classification: {
      role,
      declaredRole,
      files: classifications,
    },
    risk: {
      level: riskLevel,
      reasons,
    },
    routing: {
      decision: routingDecision,
      reason: getRoutingReason(routingDecision, riskLevel),
    },
  };
}

export function isBlockingDecision(decision: OrchestratorDecision) {
  return decision.routing.decision === "block";
}

function isConcreteRole(role: Classification): role is Agent {
  return role !== "mixed" && role !== "unknown";
}

function getRiskLevel(reasons: DecisionReason[]): RiskLevel {
  if (
    reasons.some((reason) =>
      ["no_changed_files", "invalid_declared_agent", "unknown_route", "mixed_route", "agent_mismatch", "high_risk_paths"].includes(
        reason.code,
      ),
    )
  ) {
    return "high";
  }
  if (reasons.some((reason) => reason.code === "medium_risk_paths")) return "medium";
  return "low";
}

function getRoutingReason(decision: RoutingDecision, riskLevel: RiskLevel) {
  if (decision === "block") return "Policy violation requires blocking this PR.";
  if (decision === "review") return `${riskLevel} risk requires reviewer routing.`;
  return "Low-risk PR can be approved by the Orchestrator guard.";
}
