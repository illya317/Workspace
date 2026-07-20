const fs = require("node:fs");
const path = require("node:path");

const generatedPaths = [
  "../../generated/prisma/internal/prismaNamespace.ts",
  "../../generated/prisma/models/MutationImpactBatch.ts",
  "../../generated/prisma/models/MutationImpactEffect.ts",
  "../../generated/prisma/models/WorkKpiAssignment.ts",
  "../../generated/prisma/models/WorkKpiDefinition.ts",
  "../../generated/prisma/models/WorkKpiResultSnapshot.ts",
].map((filePath) => path.resolve(__dirname, filePath));

for (const filePath of generatedPaths) {
  const source = fs.readFileSync(filePath, "utf8");
  const normalized = source.replace(/[\t ]+$/gm, "");
  if (normalized !== source) fs.writeFileSync(filePath, normalized);
}
