import {
  type Agent,
  classifyPR,
  normalizeAgent,
  pathMatchesPattern,
  uniqueFiles,
} from "./pr-classifier";

export type RiskLevel = "low" | "medium" | "high";

export type OrchestratorDecision = {
  target: Agent;
  risk: RiskLevel;
  review_required: boolean;
};

export type ReassignDecision = {
  action: "REASSIGN";
  new_agent: Agent | "reviewer";
  reason: string;
  previous_agent: Agent | null;
  retry: true;
};

export type OrchestratorInput = {
  files: string[];
  declaredAgent?: string | null;
  confidence?: number | null;
  reviewerResult?: string | null;
  taskComplexity?: RiskLevel | null;
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

const AGENT_CAPABILITY: Record<Agent, RiskLevel> = {
  feature: "medium",
  data: "medium",
  ops: "medium",
  architecture: "high",
};

const RISK_RANK: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function evaluatePR(input: OrchestratorInput): OrchestratorDecision | ReassignDecision {
  const files = uniqueFiles(input.files);
  const declaredRole = normalizeAgent(input.declaredAgent);
  const role = classifyPR(files);
  const target = isConcreteRole(role) ? role : "architecture";
  const risk = evaluateRisk(files, role, declaredRole);
  const reassignment = evaluateReassignment({
    target,
    risk,
    declaredRole,
    confidence: input.confidence,
    reviewerResult: input.reviewerResult,
    taskComplexity: input.taskComplexity,
  });

  if (reassignment) return reassignment;

  return {
    target,
    risk,
    review_required: risk !== "low",
  };
}

function evaluateReassignment(input: {
  target: Agent;
  risk: RiskLevel;
  declaredRole: Agent | null;
  confidence?: number | null;
  reviewerResult?: string | null;
  taskComplexity?: RiskLevel | null;
}): ReassignDecision | null {
  const previousAgent = input.declaredRole;

  if (typeof input.confidence === "number" && input.confidence < 0.6) {
    return reassign("reviewer", "routing confidence below 0.6", previousAgent);
  }

  if (input.reviewerResult === "wrong_domain") {
    const newAgent = previousAgent && previousAgent !== input.target ? input.target : "reviewer";
    return reassign(newAgent, "reviewer rejected current assignment as wrong domain", previousAgent);
  }

  if (previousAgent && previousAgent !== input.target) {
    return reassign(input.target, `agent mismatch: ${previousAgent} assigned to ${input.target} route`, previousAgent);
  }

  if (previousAgent && exceedsCapability(input.taskComplexity ?? input.risk, previousAgent)) {
    return reassign("architecture", `task complexity exceeds ${previousAgent} capability`, previousAgent);
  }

  return null;
}

function reassign(newAgent: Agent | "reviewer", reason: string, previousAgent: Agent | null): ReassignDecision {
  return {
    action: "REASSIGN",
    new_agent: newAgent,
    reason,
    previous_agent: previousAgent,
    retry: true,
  };
}

function exceedsCapability(complexity: RiskLevel, agent: Agent) {
  return RISK_RANK[complexity] > RISK_RANK[AGENT_CAPABILITY[agent]];
}

function isConcreteRole(role: ReturnType<typeof classifyPR>): role is Agent {
  return role !== "mixed" && role !== "unknown";
}

function evaluateRisk(files: string[], role: ReturnType<typeof classifyPR>, declaredRole: Agent | null): RiskLevel {
  if (files.length === 0 || !declaredRole || role === "mixed" || role === "unknown") return "high";
  if (declaredRole && isConcreteRole(role) && declaredRole !== role) return "high";
  if (files.some((file) => HIGH_RISK_PATTERNS.some((pattern) => pathMatchesPattern(file, pattern)))) return "high";
  if (files.some((file) => MEDIUM_RISK_PATTERNS.some((pattern) => pathMatchesPattern(file, pattern)))) return "medium";
  return "low";
}
