#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const REGISTRY_DIR = "packages/core/ui/registry";
const REGISTRY_GLOB = /^packages\/core\/ui\/registry\/component-registry/;
const DESKTOP_REQUEST_PATH = process.env.CORE_UI_REQUEST_PATH
  || (process.env.WORKSPACE_CONFIG_DIR
    ? path.join(process.env.WORKSPACE_CONFIG_DIR, "config/engineering/core-ui-change-request.md")
    : "");
const REPO_REQUEST_PATH = "core-ui-change-request.md";
const AUTOCOMPLETE_OPTION_DISPLAY_HELPER = "packages/core/ui/internal/input/autocomplete-option-display.ts";
const AUTOCOMPLETE_RENDERERS = [
  "packages/core/ui/internal/input/FkFieldInput.tsx",
  "packages/core/ui/internal/input/SearchableOptionInput.tsx",
];
const BODY_SURFACE_TYPES = "packages/core/ui/BodySurface.types.ts";
const BODY_SURFACE_RENDERER = "packages/core/ui/BodySurface.tsx";
const CREATE_ANCHOR_CONTEXT = "packages/core/ui/internal/create/CreateSurfaceAnchorContext.tsx";
const AMOUNT_CELL = "packages/core/ui/internal/data/AmountCell.tsx";
const DATA_SURFACE_RENDERERS = "packages/core/ui/internal/data/DataSurface.renderers.tsx";

const mode = process.argv.includes("--staged") ? "staged" : "working-tree";

function runGit(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function splitLines(text) {
  return text ? text.split(/\r?\n/).filter(Boolean) : [];
}

function parseNameStatus(line) {
  const parts = line.split(/\t/);
  const status = parts[0] ?? "";
  const file = parts[parts.length - 1] ?? "";
  return { status, file };
}

function getChangedEntries() {
  const args = mode === "staged"
    ? ["diff", "--cached", "--name-status", "--diff-filter=ACMRTD"]
    : ["diff", "HEAD", "--name-status", "--diff-filter=ACMRTD"];
  const entries = splitLines(runGit(args)).map(parseNameStatus);

  if (mode === "working-tree") {
    const untracked = splitLines(runGit(["ls-files", "--others", "--exclude-standard"]))
      .map((file) => ({ status: "A", file }));
    entries.push(...untracked);
  }

  return entries;
}

function getDiffText() {
  const args = mode === "staged"
    ? ["diff", "--cached", "-U0"]
    : ["diff", "HEAD", "-U0"];
  return runGit(args);
}

function readRegistryNames() {
  const names = new Set();
  const re = /\{\s*name:\s*"([^"]+)"/g;

  const dataFiles = fs.readdirSync(path.join(ROOT, REGISTRY_DIR))
    .filter((file) => /^component-registry-data/.test(file) && /\.(ts|tsx)$/.test(file))
    .map((file) => path.join(REGISTRY_DIR, file));

  for (const file of dataFiles) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    let match;
    while ((match = re.exec(source))) names.add(match[1]);
  }

  return names;
}

function isSourceFile(file) {
  return /\.(tsx|ts)$/.test(file);
}

function isCoreUiFile(file) {
  return file.startsWith("packages/core/ui/") && isSourceFile(file);
}

function isRegistryFile(file) {
  return REGISTRY_GLOB.test(file);
}

function protectedCoreUiReason(file, registeredNames) {
  if (isRegistryFile(file)) return "core UI registry changed";
  if (!isCoreUiFile(file)) return null;

  const basename = path.basename(file).replace(/\.(tsx|ts)$/, "");
  for (const name of registeredNames) {
    if (basename === name || basename.startsWith(name)) {
      return `registered core UI or private implementation changed (${name})`;
    }
  }

  return "core UI source changed";
}

function hasAuthorization(changedFiles) {
  if (process.env.CORE_UI_CHANGE === "1") return true;
  if (fs.existsSync(DESKTOP_REQUEST_PATH)) return true;
  if (changedFiles.includes(REPO_REQUEST_PATH)) return true;
  return false;
}

function findDuplicateToolbarShells(entries) {
  return entries
    .filter(({ status, file }) => status.startsWith("A") && /^packages\/[^/]+\/ui\/.*Toolbar\.tsx$/.test(file))
    .map(({ file }) => file);
}

function businessLifecycleNarrationLineNumbers(source) {
  return source.split(/\r?\n/).flatMap((line, index) => (/冻结输出/.test(line) ? [index + 1] : []));
}

function findBusinessLifecycleNarration(entries) {
  const violations = [];
  for (const { status, file } of entries) {
    if (status.startsWith("D") || !isSourceFile(file)) continue;
    if (!file.startsWith("app/") && !/^packages\/[^/]+\/ui\//.test(file)) continue;
    const sourcePath = path.join(ROOT, file);
    if (!fs.existsSync(sourcePath)) continue;
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const line of businessLifecycleNarrationLineNumbers(source)) violations.push(`${file}:${line}`);
  }
  return violations;
}

function findLintExemptions(diffText) {
  return splitLines(diffText).filter((line) => {
    if (!line.startsWith("+") || line.startsWith("+++")) return false;
    return /(?:\/\/|\/\*|<!--)\s*eslint-disable(?:-next-line|-line)?\b/.test(line);
  });
}

function registryChanged(entries) {
  return entries.some(({ file }) => isRegistryFile(file));
}

function findUnsyncedCoreUiAdditions(entries, registeredNames) {
  const registryUpdated = registryChanged(entries);
  const additions = entries
    .filter(({ status, file }) => status.startsWith("A") && isCoreUiFile(file))
    .map(({ file }) => path.basename(file).replace(/\.(tsx|ts)$/, ""))
    .filter((name) => {
      if (registeredNames.has(name)) return false;
      if (/^(.*Parts|.*Content|.*Types|.*utils?|.*styles|.*constants)$/.test(name)) return false;
      return /^[A-Z]/.test(name);
    });

  if (additions.length === 0) return [];
  if (registryUpdated) return [];
  return additions;
}

function findUnsyncedCoreUiDeletions(entries) {
  const registryUpdated = registryChanged(entries);
  const deletions = entries
    .filter(({ status, file }) => status.startsWith("D") && isCoreUiFile(file))
    .map(({ file }) => file);

  if (deletions.length === 0) return [];
  if (registryUpdated) return [];
  return deletions;
}

function findAutocompleteDisplayContractViolations() {
  const violations = [];
  const helperPath = path.join(ROOT, AUTOCOMPLETE_OPTION_DISPLAY_HELPER);
  if (!fs.existsSync(helperPath)) {
    return [`${AUTOCOMPLETE_OPTION_DISPLAY_HELPER}: shared option display contract is missing`];
  }
  const helperSource = fs.readFileSync(helperPath, "utf8");
  if (!helperSource.includes("primaryText") || !helperSource.includes("hoverText")) {
    violations.push(`${AUTOCOMPLETE_OPTION_DISPLAY_HELPER}: must keep primary text separate from hover details`);
  }
  for (const file of AUTOCOMPLETE_RENDERERS) {
    const sourcePath = path.join(ROOT, file);
    if (!fs.existsSync(sourcePath)) {
      violations.push(`${file}: shared autocomplete renderer is missing`);
      continue;
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    if (!source.includes("getAutocompleteOptionDisplay")) {
      violations.push(`${file}: must derive option rows through getAutocompleteOptionDisplay`);
    }
    if (!source.includes("{optionDisplay.primaryText}")) {
      violations.push(`${file}: selectable rows must render only optionDisplay.primaryText`);
    }
    if (!source.includes("title={optionDisplay.hoverText}")) {
      violations.push(`${file}: option details must remain available through hover text`);
    }
    if (/>{\s*optionDisplay\.hoverText\s*}</.test(source)) {
      violations.push(`${file}: hover details must not be rendered as selectable-row text`);
    }
    if (/\{\s*option\.(?:subtitle|description)\s*(?:&&|\})/.test(source)) {
      violations.push(`${file}: subtitle/description must not render inline in selectable rows`);
    }
  }
  return violations;
}

function findSectionCreatePlacementContractViolations() {
  const violations = [];
  const types = fs.readFileSync(path.join(ROOT, BODY_SURFACE_TYPES), "utf8");
  const renderer = fs.readFileSync(path.join(ROOT, BODY_SURFACE_RENDERER), "utf8");
  const anchorContext = fs.readFileSync(path.join(ROOT, CREATE_ANCHOR_CONTEXT), "utf8");

  if (!types.includes("create?: BodySurfaceSectionCreateSpec;")) {
    violations.push(`${BODY_SURFACE_TYPES}: section header create must use the local placement spec`);
  }
  if (!types.includes("body: BodySurfaceSectionBodyProps;")) {
    violations.push(`${BODY_SURFACE_TYPES}: nested section bodies must use the placement-safe body contract`);
  }
  if (!types.includes("BodySurfaceCreateProps<TForm>")) {
    violations.push(`${BODY_SURFACE_TYPES}: nested create bodies must be limited to local surface-triggered creates`);
  }
  if (!types.includes('{ anchor?: never }')) {
    violations.push(`${BODY_SURFACE_TYPES}: section header block create must reject caller-provided anchors`);
  }
  if (!renderer.includes('`body-section-create:${declaredCreate.id}`')) {
    violations.push(`${BODY_SURFACE_RENDERER}: section block create must receive a Core-owned anchor`);
  }
  const anchorIndex = renderer.indexOf("<CreateSurfaceAnchorTarget anchor={createAnchor} />");
  const bodyIndex = renderer.indexOf("<BodySurface {...section.body} />");
  if (anchorIndex < 0 || bodyIndex < 0 || anchorIndex > bodyIndex) {
    violations.push(`${BODY_SURFACE_RENDERER}: section create anchor must render before the section body`);
  }
  if (!anchorContext.includes('className="contents"')) {
    violations.push(`${CREATE_ANCHOR_CONTEXT}: create anchors must remain layout-neutral when closed`);
  }
  return violations;
}

function findFinancialNumberPresentationContractViolations() {
  const violations = [];
  const amountCell = fs.readFileSync(path.join(ROOT, AMOUNT_CELL), "utf8");
  const renderers = fs.readFileSync(path.join(ROOT, DATA_SURFACE_RENDERERS), "utf8");
  if (!amountCell.includes("displayedAsZero ? \"\" : amountCurrencyPrefix")) {
    violations.push(`${AMOUNT_CELL}: displayed zero must not retain a currency prefix`);
  }
  if (!amountCell.includes("minimumFractionDigits: displayedAsZero ? 0")) {
    violations.push(`${AMOUNT_CELL}: displayed zero must use zero fraction digits`);
  }
  const rightAlignedNumericDisplays = renderers.match(/block w-full text-right tabular-nums/g)?.length ?? 0;
  if (rightAlignedNumericDisplays < 2) {
    violations.push(`${DATA_SURFACE_RENDERERS}: number and amount displays must fill and right-align their cells`);
  }
  return violations;
}

function main() {
  const entries = getChangedEntries();
  const changedFiles = entries.map(({ file }) => file);
  const registeredNames = readRegistryNames();
  const protectedChanges = [];

  for (const { file } of entries) {
    const reason = protectedCoreUiReason(file, registeredNames);
    if (reason) protectedChanges.push({ file, reason });
  }

  const duplicateToolbarShells = findDuplicateToolbarShells(entries);
  const businessLifecycleNarration = findBusinessLifecycleNarration(entries);
  const lintExemptions = findLintExemptions(getDiffText());
  const unsyncedAdditions = findUnsyncedCoreUiAdditions(entries, registeredNames);
  const unsyncedDeletions = findUnsyncedCoreUiDeletions(entries);
  const autocompleteDisplayContractViolations = findAutocompleteDisplayContractViolations();
  const sectionCreatePlacementContractViolations = findSectionCreatePlacementContractViolations();
  const financialNumberPresentationContractViolations = findFinancialNumberPresentationContractViolations();
  const authorized = hasAuthorization(changedFiles);
  let failed = false;

  if (protectedChanges.length > 0 && !authorized) {
    failed = true;
    console.error("\n✗ Core UI guard: protected core UI changes require explicit UI-system authorization.");
    console.error("  This is a core UI/system task, not a business task. Do not modify registered core UI or its private implementation casually.");
    console.error("\n  Authorize intentionally with one of:");
    console.error("  - CORE_UI_CHANGE=1 git commit ...");
    console.error(`  - create ${DESKTOP_REQUEST_PATH}`);
    console.error("\n  Protected changes:");
    for (const change of protectedChanges) {
      console.error(`  - ${change.file} (${change.reason})`);
    }
  }

  if (duplicateToolbarShells.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: duplicate business Toolbar shell detected.");
    console.error("  Use the single core Toolbar Page API instead of adding package-specific toolbar wrappers.");
    for (const file of duplicateToolbarShells) console.error(`  - ${file}`);
  }

  if (businessLifecycleNarration.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: business lifecycle narration detected.");
    console.error("  Do not add page copy that narrates frozen-output provenance; expose lifecycle facts through standard status fields and controls.");
    for (const violation of businessLifecycleNarration) console.error(`  - ${violation}`);
  }

  if (lintExemptions.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: lint exemption added.");
    console.error("  Do not add eslint-disable exemptions; fix or split the code instead.");
    for (const line of lintExemptions.slice(0, 20)) console.error(`  ${line}`);
    if (lintExemptions.length > 20) console.error(`  ... ${lintExemptions.length - 20} more`);
  }

  if (unsyncedAdditions.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: new core UI source appears unsynced with registry.");
    console.error("  Add registry updates, or name it as a private implementation.");
    for (const name of unsyncedAdditions) console.error(`  - ${name}`);
  }

  if (unsyncedDeletions.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: deleted core UI source appears unsynced with registry.");
    console.error("  Remove registry/export references in the same UI-system change.");
    for (const file of unsyncedDeletions) console.error(`  - ${file}`);
  }

  if (autocompleteDisplayContractViolations.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: autocomplete option display contract violated.");
    console.error("  Selectable rows show only the primary search name; secondary details belong in hover/search metadata.");
    for (const violation of autocompleteDisplayContractViolations) console.error(`  - ${violation}`);
  }

  if (sectionCreatePlacementContractViolations.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: section create placement contract violated.");
    console.error("  Section header block create belongs immediately below its trigger row and before the section body.");
    for (const violation of sectionCreatePlacementContractViolations) console.error(`  - ${violation}`);
  }

  if (financialNumberPresentationContractViolations.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: financial number presentation contract violated.");
    console.error("  Financial zero values render as 0, and DataSurface number/amount cells stay right-aligned.");
    for (const violation of financialNumberPresentationContractViolations) console.error(`  - ${violation}`);
  }

  if (failed) process.exit(1);

  console.log(`✓ Core UI guard passed (${mode})`);
}

if (require.main === module) main();

module.exports = { businessLifecycleNarrationLineNumbers };
