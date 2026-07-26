#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { assertDeployUnitApp, generatedDeployUnitAppFiles } from "./deploy-unit-app-generator";
import { resolveDeployGraph } from "./deploy-graph";

function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const graph = resolveDeployGraph({ repositoryRoot });
  const existingUnits = graph.units.filter((unit) => (
    unit.runtime.engine === "next-standalone"
    && fs.existsSync(path.join(repositoryRoot, unit.runtime.appRoot))
  ));
  if (existingUnits.length === 0) throw new Error("No generated deploy-unit Next apps exist");
  for (const unit of existingUnits) {
    const nextEnv = generatedDeployUnitAppFiles(unit.id)
      .find((file) => path.basename(file.path) === "next-env.d.ts");
    if (!nextEnv) throw new Error(`${unit.id} has no generated next-env.d.ts contract`);
    if (!fs.existsSync(nextEnv.path)) fs.writeFileSync(nextEnv.path, nextEnv.content);
    assertDeployUnitApp(unit.id);
  }
  process.stdout.write(`Deploy-unit app contract passed: ${existingUnits.map((unit) => unit.id).join(", ")}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
