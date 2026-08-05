import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { INGEST_WORKER_SOURCE, INGEST_WORKER_SOURCE_MARKER } from "./ingest-worker-source";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");

test("内嵌 worker 源码与 canonical ingest-worker.cjs 逐字节一致（漂移则运行 sync-worker-source.mjs）", () => {
  const canonical = fs.readFileSync(path.join(here, "ingest-worker.cjs"), "utf8");
  assert.equal(INGEST_WORKER_SOURCE, canonical);
  assert.ok(INGEST_WORKER_SOURCE.includes(INGEST_WORKER_SOURCE_MARKER));
});

test("next.config 将 xlsx 声明为 serverExternalPackages（standalone 运行时可 require）", () => {
  const config = fs.readFileSync(path.join(repoRoot, "next.config.ts"), "utf8");
  const match = /serverExternalPackages:\s*\[([^\]]*)\]/.exec(config);
  assert.ok(match, "next.config.ts 缺少 serverExternalPackages");
  assert.ok(match[1]!.includes('"xlsx"'), "serverExternalPackages 必须包含 xlsx");
});

/**
 * standalone 打包证据：worker 以 eval 源码内嵌在 server bundle 中，
 * vendored xlsx 作为外部包被 nft trace。
 * 本地无 .next/standalone 时只做配置级断言并显式报告（构建级证据由 CNB build lane
 * 或本地 npm run build 后重跑本测试产出）。上传路径在证据缺失时保持开关 fail-closed。
 */
test("standalone 产物包含 worker 源码 marker 与 vendored xlsx（存在产物时）", (t) => {
  const standaloneRoot = path.join(repoRoot, ".next", "standalone");
  if (!fs.existsSync(standaloneRoot)) {
    t.skip(".next/standalone 不存在：配置级证据已断言，构建级证据待 CNB build 或本地 build 后重跑");
    return;
  }

  const xlsxLocations: string[] = [];
  const visitForXlsx = (directory: string, depth: number) => {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.name === "xlsx" && directory.endsWith("node_modules")) {
        xlsxLocations.push(entryPath);
      } else if (entry.name !== "node_modules" || depth < 2) {
        visitForXlsx(entryPath, depth + 1);
      }
    }
  };
  visitForXlsx(standaloneRoot, 0);
  assert.ok(xlsxLocations.length > 0, "standalone 产物缺少 vendored xlsx");

  const serverRoot = path.join(repoRoot, ".next", "server");
  let markerFound = false;
  const visitForMarker = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visitForMarker(entryPath);
      } else if (entry.name.endsWith(".js") && !markerFound) {
        const stat = fs.statSync(entryPath);
        if (stat.size > 20 * 1024 * 1024) continue;
        if (fs.readFileSync(entryPath, "utf8").includes(INGEST_WORKER_SOURCE_MARKER)) {
          markerFound = true;
        }
      }
    }
  };
  visitForMarker(serverRoot);
  assert.ok(markerFound, "server bundle 缺少内嵌 worker 源码 marker");
});
