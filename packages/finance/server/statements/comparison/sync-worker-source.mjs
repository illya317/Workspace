#!/usr/bin/env node
/**
 * 从 ingest-worker.cjs 机械再生成 ingest-worker-source.ts。
 * worker-source.test.ts 断言内嵌副本与 canonical .cjs 逐字节一致；
 * 漂移时运行：node packages/finance/server/statements/comparison/sync-worker-source.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "ingest-worker.cjs"), "utf8");

const header = `/**
 * 隔离 worker 源码的内嵌副本（机械生成，勿手改）。
 *
 * canonical 实现是 ingest-worker.cjs；本文件由 sync-worker-source.mjs 生成，
 * worker-source.test.ts 断言两者逐字节一致。宿主以 eval worker 加载该源码，
 * 因此 worker 代码随 Next server bundle 进入 standalone 产物，
 * 这是「standalone 打包包含 worker」的结构性保证（marker 见 standalone-packaging.test.ts）。
 */

export const INGEST_WORKER_SOURCE_MARKER = "finance-workbook-ingest-worker-v1";

export const INGEST_WORKER_SOURCE: string = ${JSON.stringify(source)};
`;

fs.writeFileSync(path.join(here, "ingest-worker-source.ts"), header);
console.log("ingest-worker-source.ts regenerated");
