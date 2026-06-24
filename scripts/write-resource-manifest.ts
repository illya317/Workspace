import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { RESOURCE_DEFS } from "@workspace/platform/resources";

const outputPath = process.argv[2] ?? ".next/standalone/resource-defs.json";

const resources = RESOURCE_DEFS.map((resource) => ({
  key: resource.key,
  name: resource.name,
  parentKey: resource.parentKey ?? null,
  maxRoleKey: resource.maxRoleKey ?? "admin",
  sortOrder: resource.sortOrder ?? 0,
}));

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ resources }, null, 2)}\n`);
console.log(`Resource manifest written: ${outputPath} (${resources.length} resources)`);
