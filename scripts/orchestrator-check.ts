import fs from "node:fs";
import path from "node:path";
import {
  type Agent,
  classifyPR,
  explainClassification,
  isAgent,
  pathMatchesPattern,
  uniqueFiles,
} from "../orchestrator/pr-classifier";

type LockMode = {
  locked_paths: string[];
  exempt_paths?: string[];
  allowed_agents: Agent[];
};

type ParsedArgs = {
  agent?: string;
  files: string[];
  filesFrom?: string;
};

const ROOT = path.resolve(__dirname, "..");
const locks = JSON.parse(
  fs.readFileSync(path.join(ROOT, "orchestrator", "locks.json"), "utf8"),
) as Record<string, LockMode>;

export function check(files: string[], agent: string) {
  if (!isAgent(agent)) {
    throw new Error(`Agent must be one of: architect, feature, data, ops. Received: ${agent || "<empty>"}`);
  }

  const normalizedFiles = uniqueFiles(files);
  if (normalizedFiles.length === 0) {
    throw new Error("No changed files were provided to the orchestrator check.");
  }

  const role = classifyPR(normalizedFiles);
  if (role === "unknown") {
    const unknown = explainClassification(normalizedFiles)
      .filter((entry) => entry.agent === "unknown")
      .map((entry) => `  - ${entry.file}`)
      .join("\n");
    throw new Error(`PR contains paths that are not routed to an agent:\n${unknown}`);
  }

  if (role === "mixed") {
    const routes = explainClassification(normalizedFiles)
      .map((entry) => `  - ${entry.file}: ${entry.agent}${entry.pattern ? ` (${entry.pattern})` : ""}`)
      .join("\n");
    throw new Error(`PR crosses agent boundaries. Split the PR before merging:\n${routes}`);
  }

  if (role !== agent) {
    throw new Error(`Agent mismatch: PR belongs to ${role}, but is labeled as ${agent}.`);
  }

  const lock = locks[`${agent.toUpperCase()}_MODE`];
  if (!lock) {
    throw new Error(`Missing lock mode for ${agent}.`);
  }
  if (!lock.allowed_agents.includes(agent)) {
    throw new Error(`${agent} is not allowed to run ${agent.toUpperCase()}_MODE.`);
  }

  const lockedFiles = normalizedFiles.filter((file) => isLocked(file, lock));
  if (lockedFiles.length > 0) {
    throw new Error(`Path locked for ${agent}:\n${lockedFiles.map((file) => `  - ${file}`).join("\n")}`);
  }

  return role;
}

function isLocked(file: string, lock: LockMode) {
  const exempt = lock.exempt_paths?.some((pattern) => pathMatchesPattern(file, pattern)) ?? false;
  if (exempt) return false;
  return lock.locked_paths.some((pattern) => pathMatchesPattern(file, pattern));
}

function parseArgs(argv: string[]): ParsedArgs {
  const files: string[] = [];
  let filesFrom: string | undefined;
  let agent = process.env.ORCHESTRATOR_AGENT ?? process.env.AGENT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--agent") {
      agent = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--agent=")) {
      agent = arg.slice("--agent=".length);
      continue;
    }
    if (arg === "--files-from") {
      filesFrom = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--files-from=")) {
      filesFrom = arg.slice("--files-from=".length);
      continue;
    }
    files.push(arg);
  }

  return { agent, files, filesFrom };
}

function readFiles(args: ParsedArgs) {
  const fromFile = args.filesFrom ? fs.readFileSync(args.filesFrom, "utf8").split(/\r?\n/) : [];
  return uniqueFiles([...fromFile, ...args.files]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const role = check(readFiles(args), args.agent ?? "");
  console.log(`Orchestrator guard passed: ${role}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
