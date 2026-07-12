import { queryLibraryDocumentSet } from "@workspace/library/server/search-query";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
function required(name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const query = required("--query");
const maxConfidentialityLevel = Number(required("--max-confidentiality"));
queryLibraryDocumentSet({ query, limit: 10, maxConfidentialityLevel })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .finally(() => prisma.$disconnect());
