import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve("..");
const qcRoot = path.join(workspaceRoot, ".workspace/config/pharma-qc");
const scanRoots = ["items", "dedicated_methods", "records", "templates", "full"].map((name) => path.join(qcRoot, name));
const auditJsonPath = path.join(qcRoot, "deprecated_display_params_audit.json");
const auditMdPath = path.join(qcRoot, "deprecated_display_params_audit.md");

function str(value) {
  return value == null ? "" : String(value);
}

function rec(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isOldParamText(value) {
  const text = str(value).trim();
  if (!text) return false;
  if (text.includes("related_substances_numbered_rules")) return true;
  if (/\bprofile\s*=/.test(text)) return true;
  if (text.includes("含量测定项下记录的色谱图")) return true;
  return text.includes("取本品") && text.includes("目测") && text.includes("本品为");
}

async function listJsonFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  }));
  return nested.flat().sort();
}

function scan(value, filePath, pathParts = [], hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, filePath, [...pathParts, index], hits));
    return hits;
  }
  if (!value || typeof value !== "object") return hits;

  const data = rec(value);
  const type = str(data.type);
  const visibleText = [
    data.text,
    data.defaultValue,
    data.name,
    data.label,
    data.title,
    data.rawText,
  ].map(str).filter(Boolean).join(" ");

  if (type === "param" && isOldParamText(visibleText)) {
    hits.push({
      severity: "high",
      reason: "deprecated-param-rendered",
      file: filePath,
      path: pathParts.join("."),
      text: visibleText.slice(0, 240),
    });
  }

  for (const [key, child] of Object.entries(data)) {
    const nextPath = [...pathParts, key];
    if (typeof child === "string" && (child.includes("related_substances_numbered_rules") || /\bprofile\s*=/.test(child))) {
      hits.push({
        severity: "high",
        reason: "deprecated-template-leak",
        file: filePath,
        path: nextPath.join("."),
        text: child.slice(0, 240),
      });
    }
    const isParamContainer = pathParts.includes("record_config") || /(^|_)params$/i.test(str(key));
    if (typeof child === "string" && isParamContainer && isOldParamText(child)) {
      hits.push({
        severity: "high",
        reason: "deprecated-param-container-value",
        file: filePath,
        path: nextPath.join("."),
        text: child.slice(0, 240),
      });
    }
    scan(child, filePath, nextPath, hits);
  }
  return hits;
}

const files = (await Promise.all(scanRoots.map(listJsonFiles))).flat();
const hits = [];
for (const filePath of files) {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  scan(parsed, filePath, [], hits);
}

const summary = {
  checked_file_count: files.length,
  high_count: hits.filter((hit) => hit.severity === "high").length,
  hits,
};

const md = [
  "# Deprecated Display Params Audit",
  "",
  `Checked files: ${summary.checked_file_count}`,
  `High count: ${summary.high_count}`,
  "",
  ...hits.map((hit) => `- ${hit.severity} ${hit.reason}: ${path.relative(qcRoot, hit.file)}#${hit.path} — ${hit.text}`),
  "",
].join("\n");

await fs.writeFile(auditJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await fs.writeFile(auditMdPath, md, "utf8");

if (summary.high_count > 0) {
  console.error(`Deprecated display params audit failed: ${summary.high_count} high findings.`);
  process.exitCode = 1;
} else {
  console.log(`Deprecated display params audit passed: ${summary.checked_file_count} files checked.`);
}
