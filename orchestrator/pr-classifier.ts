export const AGENTS = ["architecture", "feature", "data", "ops"] as const;

export type Agent = (typeof AGENTS)[number];
export type Classification = Agent | "mixed" | "unknown";

type RouteRule = {
  agent: Agent;
  patterns: string[];
};

export type FileClassification = {
  file: string;
  agent: Agent | "unknown";
  pattern?: string;
};

const ROUTE_RULES: RouteRule[] = [
  {
    agent: "architecture",
    patterns: [
      "core/**",
      "packages/core/**",
      "packages/platform/**",
      "orchestrator/**",
      ".github/workflows/orchestrator.yml",
      "scripts/orchestrator-check.ts",
      "scripts/arch/**",
      "scripts/check/**",
      "docs/**",
      "AGENTS.md",
      "README.md",
      "rules.md",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      ".gitignore",
      "next.config.ts",
      "eslint.config.mjs",
      "playwright.config.ts",
    ],
  },
  {
    agent: "data",
    patterns: ["prisma/**", "scripts/data/**", "scripts/import/**", "packages/*/import/**"],
  },
  {
    agent: "ops",
    patterns: [".github/**", "ops/**", "deploy.sh"],
  },
  {
    agent: "feature",
    patterns: ["app/**", "lib/**", "server/services/**", "packages/*/**"],
  },
];

export function isAgent(value: string): value is Agent {
  return AGENTS.includes(value.trim().toLowerCase() as Agent);
}

export function normalizeAgent(value: string | null | undefined): Agent | null {
  const normalized = normalizeAgentName(value ?? "");
  return AGENTS.includes(normalized as Agent) ? (normalized as Agent) : null;
}

function normalizeAgentName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "architect") return "architecture";
  return normalized;
}

export function normalizePath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

export function pathMatchesPattern(filePath: string, pattern: string) {
  const file = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);

  if (!file || !normalizedPattern) return false;
  if (normalizedPattern.endsWith("/")) {
    return file === normalizedPattern.slice(0, -1) || file.startsWith(normalizedPattern);
  }

  const regex = new RegExp(`^${globToRegex(normalizedPattern)}$`);
  return regex.test(file);
}

export function classifyFile(filePath: string): FileClassification {
  const file = normalizePath(filePath);
  for (const rule of ROUTE_RULES) {
    const pattern = rule.patterns.find((candidate) => pathMatchesPattern(file, candidate));
    if (pattern) return { file, agent: rule.agent, pattern };
  }
  return { file, agent: "unknown" };
}

export function explainClassification(files: string[]) {
  return uniqueFiles(files).map(classifyFile);
}

export function classifyPR(files: string[]): Classification {
  const classifications = explainClassification(files);
  if (classifications.length === 0) return "unknown";
  if (classifications.some((entry) => entry.agent === "unknown")) return "unknown";

  const agents = new Set(classifications.map((entry) => entry.agent));
  if (agents.size > 1) return "mixed";

  return classifications[0]?.agent ?? "unknown";
}

export function uniqueFiles(files: string[]) {
  return [...new Set(files.map(normalizePath).filter(Boolean))];
}

function globToRegex(pattern: string) {
  let regex = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      regex += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    regex += escapeRegex(char);
  }
  return regex;
}

function escapeRegex(char: string) {
  return char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
