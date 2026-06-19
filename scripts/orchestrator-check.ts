import fs from "node:fs";
import { evaluatePR } from "../orchestrator/decision";
import { uniqueFiles } from "../orchestrator/pr-classifier";

type ParsedArgs = {
  agent?: string;
  confidence?: number;
  reviewerResult?: string;
  taskComplexity?: "low" | "medium" | "high";
  files: string[];
  filesFrom?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const files: string[] = [];
  let filesFrom: string | undefined;
  let agent = process.env.ORCHESTRATOR_AGENT ?? process.env.AGENT;
  let confidence: number | undefined;
  let reviewerResult: string | undefined;
  let taskComplexity: "low" | "medium" | "high" | undefined;

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
    if (arg === "--confidence") {
      argsConfidence(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--confidence=")) {
      argsConfidence(arg.slice("--confidence=".length));
      continue;
    }
    if (arg === "--reviewer-result") {
      reviewerResult = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--reviewer-result=")) {
      reviewerResult = arg.slice("--reviewer-result=".length);
      continue;
    }
    if (arg === "--complexity") {
      taskComplexity = parseRisk(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--complexity=")) {
      taskComplexity = parseRisk(arg.slice("--complexity=".length));
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

  return { agent, confidence, reviewerResult, taskComplexity, files, filesFrom };

  function argsConfidence(value: string | undefined) {
    const parsed = Number(value);
    confidence = Number.isFinite(parsed) ? parsed : undefined;
  }
}

function readFiles(args: ParsedArgs) {
  const fromFile = args.filesFrom ? fs.readFileSync(args.filesFrom, "utf8").split(/\r?\n/) : [];
  return uniqueFiles([...fromFile, ...args.files]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const decision = evaluatePR({
    files: readFiles(args),
    declaredAgent: args.agent,
    confidence: args.confidence,
    reviewerResult: args.reviewerResult,
    taskComplexity: args.taskComplexity,
  });

  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

function parseRisk(value: string | undefined) {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}
