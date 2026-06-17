import Module from "module";
import path from "path";

type ModuleLoader = (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown;

const originalLoad = (Module as unknown as { _load: ModuleLoader })._load;
(Module as unknown as { _load: ModuleLoader })._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  process.env.WORKSPACE_CONFIG_DIR ||= path.resolve(process.cwd(), "..", ".workspace");
  const { buildQcTemplateCache } = await import("../server/services/production/qc/template-cache");
  const cache = await buildQcTemplateCache();
  const productCount = Object.keys(cache.templates).length;
  const testCount = Object.values(cache.templates).reduce(
    (sum, template) => sum + template.stages.reduce((stageSum, stage) => stageSum + stage.tests.length, 0),
    0,
  );
  console.log(`QC template cache built: ${productCount} products, ${testCount} tests, hash=${cache.contentHash.slice(0, 12)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
