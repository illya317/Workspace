import { prisma } from "@workspace/platform/server/prisma";
import {
  commitFinanceArchiveImport,
  prepareFinanceArchiveImport,
  ReadableImportRequestSchema,
} from "../../packages/finance/server/import/readable/index";
import { selectReadableBatches } from "./finance-readable-source-plan";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const parsedYear = argument("year");
  const root = argument("root");
  if (!root) throw new Error("--root=<validated readable snapshot directory> is required");
  const request = ReadableImportRequestSchema.parse({
    root,
    mode: argument("mode") || "preview",
    companyCode: argument("company"),
    year: parsedYear ? Number(parsedYear) : undefined,
  });
  const specs = selectReadableBatches(request.companyCode, request.year);
  if (!specs.length) throw new Error("No readable finance batches matched the requested scope");
  const companyCodes = [...new Set(specs.map((item) => item.companyCode))];
  const companies = await prisma.company.findMany({
    where: { code: { in: companyCodes } }, select: { code: true },
  });
  const existingCodes = new Set(companies.map((item) => item.code));
  const missing = companyCodes.filter((code) => !existingCodes.has(code));
  if (missing.length) throw new Error(`Workspace companies missing: ${missing.join(", ")}`);
  for (const spec of specs) {
    const prepared = await prepareFinanceArchiveImport(request.root, spec);
    process.stdout.write(`${JSON.stringify({ event: "preview", ...prepared.preview })}\n`);
    if (request.mode === "commit") {
      const result = await commitFinanceArchiveImport(prepared.batch);
      process.stdout.write(`${JSON.stringify({ event: "committed", ...result })}\n`);
    }
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
