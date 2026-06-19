import fs from "node:fs";
import { classifyPR, explainClassification, uniqueFiles } from "./pr-classifier";

type ParsedArgs = {
  files: string[];
  filesFrom?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const files: string[] = [];
  let filesFrom: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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

  return { files, filesFrom };
}

function readFiles(args: ParsedArgs) {
  const fromFile = args.filesFrom ? fs.readFileSync(args.filesFrom, "utf8").split(/\r?\n/) : [];
  return uniqueFiles([...fromFile, ...args.files]);
}

function writeGitHubOutput(key: string, value: string) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `${key}=${value}\n`);
}

function writeGitHubEnv(key: string, value: string) {
  const envPath = process.env.GITHUB_ENV;
  if (!envPath) return;
  fs.appendFileSync(envPath, `${key}=${value}\n`);
}

const files = readFiles(parseArgs(process.argv.slice(2)));
const agent = classifyPR(files);

console.log(`AGENT=${agent}`);
writeGitHubOutput("agent", agent);
writeGitHubEnv("ORCHESTRATOR_INFERRED_AGENT", agent);

for (const entry of explainClassification(files)) {
  const route = entry.pattern ? `${entry.agent} via ${entry.pattern}` : "unknown";
  console.log(`${entry.file}: ${route}`);
}
