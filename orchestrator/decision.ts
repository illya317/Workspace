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
  const role = classifyPR(files);
  const target = isConcreteRole(role) ? role : "architecture";
  const risk = evaluateRisk(files, role, declaredRole);

  return {
    target,
    risk,
    review_required: risk !== "low",
  };
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
