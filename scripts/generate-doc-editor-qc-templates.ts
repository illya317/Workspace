import Module from "module";
import path from "path";

type ModuleLoader = (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown;

const originalLoad = (Module as unknown as { _load: ModuleLoader })._load;
(Module as unknown as { _load: ModuleLoader })._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only" || request.endsWith("/server-only/index.js")) return {};
  return originalLoad.call(this, request, parent, isMain);
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const outputRoot = path.resolve(argValue("output") || "generated/docs-editor/qc");
  const configRoot = argValue("config-root") || process.env.WORKSPACE_QC_CONFIG_ROOT;
  const sourceSchemaRoot = argValue("source-schema-root") || process.env.QC_SOURCE_SCHEMA_ROOT;
  const productKeys = argValue("products")?.split(",").map((item) => item.trim()).filter(Boolean);
  const { generateQcEditorTemplates } = await import("../packages/production/server/qc/editor-template-generator");
  const audit = await generateQcEditorTemplates({ configRoot, sourceSchemaRoot, outputRoot, productKeys });
  console.log([
    `QC docs-editor templates generated: ${audit.totals.products} products`,
    `stages=${audit.totals.stages}`,
    `items=${audit.totals.experimentItems}`,
    `tables=${audit.totals.tables}`,
    `fields=${audit.totals.fields}`,
    `formulas=${audit.totals.formulas}`,
    `output=${audit.outputRoot}`,
  ].join(" "));
  if (audit.sourceInventory.warnings.length) {
    console.log("Source audit warnings:");
    for (const warning of audit.sourceInventory.warnings) console.log(`- ${warning}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
