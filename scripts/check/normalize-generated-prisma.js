const fs = require("node:fs");
const path = require("node:path");

const namespacePath = path.resolve(
  __dirname,
  "../../generated/prisma/internal/prismaNamespace.ts",
);
const source = fs.readFileSync(namespacePath, "utf8");
const normalized = source.replace(/[\t ]+$/gm, "");

if (normalized !== source) fs.writeFileSync(namespacePath, normalized);
