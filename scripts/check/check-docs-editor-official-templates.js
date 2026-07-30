const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const forbiddenRepoRoots = [
  path.join(repoRoot, "generated", "production"),
  path.join(repoRoot, "generated", "docs-editor", "qc"),
];
const hrSourcePath = path.join(
  repoRoot,
  "packages",
  "docs",
  "server",
  "official-template-sources",
  "hr-position-description.json",
);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolvePrivatePath(configRoot, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be relative to WORKSPACE_CONFIG_DIR`);
  }
  const root = fs.realpathSync(configRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes WORKSPACE_CONFIG_DIR`);
  }
  return resolved;
}

function signatureFooterCells(document) {
  return (document.blocks || [])
    .filter((block) => block.type === "table" && block.label === "test_signature_footer")
    .map((table) => Math.max(0, ...(table.rows || []).map((row) => (row.cells || []).length)));
}

for (const forbiddenRoot of forbiddenRepoRoots) {
  if (fs.existsSync(forbiddenRoot)) {
    fail(`Private generated template data must not exist in the repository: ${path.relative(repoRoot, forbiddenRoot)}`);
  }
}

const hrSource = readJson(hrSourcePath);
if (hrSource.sourceKind !== "hr.position-description.official" || hrSource.sourceProductKey !== "hr.position-description.default") {
  fail("HR official template source identity is invalid");
}
if (!hrSource.document || !hrSource.fieldModel) {
  fail("HR official template source must include document and fieldModel");
}

const configuredRoot = (process.env.WORKSPACE_CONFIG_DIR || process.env.LOCAL_WORKSPACE_CONFIG_DIR || "").trim();
if (configuredRoot) {
  if (!path.isAbsolute(configuredRoot)) {
    fail("WORKSPACE_CONFIG_DIR must be absolute when validating private QC snapshots");
  } else {
    try {
      const profile = readJson(path.join(configuredRoot, "config/tenant/profile.json"));
      const qcRoot = resolvePrivatePath(
        configuredRoot,
        profile.directories?.qcTemplateSnapshots,
        "profile.directories.qcTemplateSnapshots",
      );
      const expectedProducts = profile.docs?.officialQcProductKeys;
      if (!Array.isArray(expectedProducts) || expectedProducts.some((key) => typeof key !== "string" || !key)) {
        throw new Error("profile.docs.officialQcProductKeys must be an array of non-empty strings");
      }
      const productRoot = path.join(qcRoot, "products");
      const files = fs.existsSync(productRoot)
        ? fs.readdirSync(productRoot).filter((file) => file.endsWith(".json")).sort()
        : [];
      const actualProducts = files.map((file) => path.basename(file, ".json"));
      const expectedSet = new Set(expectedProducts);
      const missing = expectedProducts.filter((key) => !actualProducts.includes(key));
      const extra = actualProducts.filter((key) => !expectedSet.has(key));
      if (missing.length || extra.length) {
        fail(`Private QC official snapshot inventory differs from the tenant profile. missing=${missing.join(",") || "-"} extra=${extra.join(",") || "-"}`);
      }

      for (const key of expectedProducts) {
        const payload = readJson(path.join(productRoot, `${key}.json`));
        if (payload.productKey !== key) fail(`Private QC snapshot productKey mismatch: ${key}`);
        const badCounts = signatureFooterCells(payload.document).filter((count) => count !== 4);
        if (badCounts.length) {
          fail(`Private QC snapshot ${key} has non-4-cell signature footer rows: ${[...new Set(badCounts)].join(",")}`);
        }
      }

      const auditPath = path.join(qcRoot, "audit.json");
      if (!fs.existsSync(auditPath)) throw new Error("private QC snapshot audit.json is missing");
      const audit = readJson(auditPath);
      const auditOutputRoot = path.isAbsolute(audit.outputRoot || "")
        ? path.resolve(audit.outputRoot)
        : resolvePrivatePath(configuredRoot, audit.outputRoot, "audit.outputRoot");
      if (auditOutputRoot !== path.resolve(qcRoot)) {
        fail("Private QC snapshot audit outputRoot does not match the tenant profile");
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}

if (!process.exitCode) {
  process.stdout.write(
    configuredRoot
      ? "Docs editor official templates OK: repository source plus private tenant snapshots.\n"
      : "Docs editor official templates OK: repository source only; private snapshots were not requested.\n",
  );
}
