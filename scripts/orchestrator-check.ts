import fs from "node:fs";
import { evaluatePR, isBlockingDecision } from "../orchestrator/decision";
import { uniqueFiles } from "../orchestrator/pr-classifier";

type ParsedArgs = {
  agent?: string;
  files: string[];
  filesFrom?: string;
};

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
  const decision = evaluatePR({
    files: readFiles(args),
    declaredAgent: args.agent,
  });

  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  if (isBlockingDecision(decision)) process.exit(1);
}

if (require.main === module) {
  main();
}
