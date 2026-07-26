#!/usr/bin/env node

import fs from "node:fs";
import { generatorHandler } from "@prisma/generator-helper";

generatorHandler({
  onManifest() {
    return { prettyName: "Relation Catalog DMMF reporter", defaultOutput: "./relation-catalog-dmmf" };
  },
  async onGenerate(options) {
    const outputPath = process.env.RELATION_DMMF_OUTPUT;
    if (!outputPath) throw new Error("RELATION_DMMF_OUTPUT is required");
    fs.writeFileSync(outputPath, JSON.stringify(options.dmmf.datamodel));
  },
});
