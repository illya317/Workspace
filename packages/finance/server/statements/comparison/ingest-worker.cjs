/* eslint-disable @typescript-eslint/no-require-imports -- eval worker 以 CommonJS 逐字加载本源码；require(node:*) 与运行时定位 vendored xlsx 都是协议的一部分。 */
"use strict";
/**
 * Finance 报表对比证据 — 隔离 worker 的 SheetJS 解析实现（计划 §5.2 隔离解析）。
 *
 * 本文件是 worker 的唯一 canonical 实现：ingest-worker-source.ts 由它机械生成
 * （sync-worker-source.mjs），worker-source.test.ts 断言两者逐字节一致。
 * 宿主以 eval worker 加载该源码，因此 worker 代码随 Next server bundle 一起进入
 * standalone 产物，不依赖额外的文件 trace。
 *
 * worker 只接收 preflight 全过的字节，但仍不信任输入：SheetJS parse、
 * sheet/cell/formula 限额与网络/外部引用公式拒绝全部在这里 fail closed。
 *
 * 协议（one-shot）：workerData = { buffer, limits }；
 * 回 { ok: true, result } 或 { ok: false, failureCode, message }。
 */

const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");

const WORKER_MARKER = "finance-workbook-ingest-worker-v1";

class Reject extends Error {
  constructor(failureCode, message) {
    super(message);
    this.failureCode = failureCode;
  }
}

/** 在仓库根 / Next standalone 运行时根两种 cwd 布局下定位 vendored xlsx。 */
function locateXlsx() {
  const candidates = [];
  const cwd = process.cwd();
  candidates.push(path.join(cwd, "node_modules", "xlsx"));
  // standalone：cwd 是 runtime 根，trace 产物在 <项目目录>/node_modules 下。
  try {
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        candidates.push(path.join(cwd, entry.name, "node_modules", "xlsx"));
      }
    }
  } catch {
    // cwd 不可读时继续尝试向上查找。
  }
  let dir = cwd;
  for (let depth = 0; depth < 3; depth += 1) {
    dir = path.dirname(dir);
    candidates.push(path.join(dir, "node_modules", "xlsx"));
  }
  for (const candidate of candidates) {
    const entry = path.join(candidate, "xlsx.js");
    try {
      fs.accessSync(entry, fs.constants.R_OK);
      return require(entry);
    } catch {
      // 尝试下一个候选路径。
    }
  }
  return null;
}

const CELL_KEY = /^[A-Z]{1,3}[0-9]+$/;
const NETWORK_FORMULA_REF = /https?:\/\//i;
const NETWORK_FORMULA_FUNCTION = /\b(WEBSERVICE|FILTERXML|HYPERLINK)\s*\(/i;
const EXTERNAL_WORKBOOK_REF = /\[\d+\]/;

/** JSON-safe 降级：不可序列化的值转字符串并记 warning，绝不抛到 worker 崩溃。 */
function jsonSafe(value, warnings, address) {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") {
    if (Number.isFinite(value)) return value;
    warnings.push(`cell ${address} 的非有限数值已置空`);
    return null;
  }
  if (value instanceof Date) {
    warnings.push(`cell ${address} 的日期值已按 ISO 字符串保留`);
    return value.toISOString();
  }
  warnings.push(`cell ${address} 的值已降级为字符串`);
  return String(value);
}

function sheetVisibility(bookSheets, index) {
  const state = bookSheets && bookSheets[index] && bookSheets[index].Hidden;
  if (state === 1) return "hidden";
  if (state === 2) return "veryHidden";
  return "visible";
}

function parse(buffer, limits) {
  const XLSX = locateXlsx();
  if (!XLSX) {
    throw new Reject("parser_unavailable", "worker 内无法解析 vendored SheetJS（xlsx）");
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: true,
      cellNF: true,
      cellText: true,
      cellDates: false,
      WTF: false,
    });
  } catch (error) {
    throw new Reject("parse_failed", `SheetJS 解析失败：${error && error.message ? error.message : String(error)}`);
  }

  const book = workbook.Workbook || {};
  // preflight 已按 central directory 拒绝外部链接；这里复核 SheetJS 视角，纵深防御。
  if (book.Links) {
    throw new Reject("external_links", "工作簿包含外部链接记录");
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length > limits.maxWorksheets) {
    throw new Reject("too_many_sheets", `工作表数量超过 ${limits.maxWorksheets} 上限`);
  }

  const warnings = [];
  const unsupported = [];
  const sheets = [];
  let cellCount = 0;
  let formulaCellCount = 0;

  for (let index = 0; index < sheetNames.length; index += 1) {
    const name = sheetNames[index];
    const worksheet = workbook.Sheets[name] || {};
    const cells = [];

    for (const key of Object.keys(worksheet)) {
      if (!CELL_KEY.test(key)) continue;
      const cell = worksheet[key];
      if (!cell || typeof cell !== "object") continue;

      cellCount += 1;
      if (cellCount > limits.maxParsedCells) {
        throw new Reject("too_many_cells", `单元格数量超过 ${limits.maxParsedCells} 上限`);
      }

      const formula = typeof cell.f === "string" ? cell.f : null;
      if (formula !== null) {
        formulaCellCount += 1;
        if (formulaCellCount > limits.maxFormulaCells) {
          throw new Reject("too_many_formulas", `公式单元格数量超过 ${limits.maxFormulaCells} 上限`);
        }
        if (formula.length > limits.maxFormulaLength) {
          throw new Reject("formula_too_long", `公式长度超过 ${limits.maxFormulaLength} 字符上限`);
        }
        if (
          NETWORK_FORMULA_REF.test(formula)
          || NETWORK_FORMULA_FUNCTION.test(formula)
          || EXTERNAL_WORKBOOK_REF.test(formula)
        ) {
          throw new Reject("external_reference_formula", "公式包含网络/外部引用");
        }
      }

      const decoded = XLSX.utils.decode_cell(key);
      const dto = {
        a1: key,
        row: decoded.r,
        col: decoded.c,
        type: typeof cell.t === "string" ? cell.t : "z",
        value: jsonSafe(cell.v === undefined ? null : cell.v, warnings, `${name}!${key}`),
        text: typeof cell.w === "string" ? cell.w : null,
        formula,
        numberFormat: typeof cell.z === "string" ? cell.z : null,
      };
      if (formula !== null) {
        dto.cachedValue = jsonSafe(cell.v === undefined ? null : cell.v, warnings, `${name}!${key}`);
      }
      cells.push(dto);
    }

    let merges = [];
    let mergesTruncated = false;
    if (Array.isArray(worksheet["!merges"])) {
      merges = worksheet["!merges"].slice(0, limits.maxRecordedMerges).map((merge) => ({
        s: { r: merge.s && merge.s.r | 0, c: merge.s && merge.s.c | 0 },
        e: { r: merge.e && merge.e.r | 0, c: merge.e && merge.e.c | 0 },
      }));
      mergesTruncated = worksheet["!merges"].length > limits.maxRecordedMerges;
    }

    sheets.push({
      name,
      index,
      visibility: sheetVisibility(book.Sheets, index),
      usedRange: typeof worksheet["!ref"] === "string" ? worksheet["!ref"] : null,
      merges,
      mergesTruncated,
      cells,
    });
  }

  const namedRanges = Array.isArray(book.Names)
    ? book.Names
        .filter((entry) => entry && typeof entry.Name === "string" && typeof entry.Ref === "string")
        .map((entry) => ({ name: entry.Name, ref: entry.Ref }))
    : [];

  const calcPr = book.CalcPr || null;
  const calculation = {
    mode: calcPr && typeof calcPr.calcMode === "string" ? calcPr.calcMode : null,
    fullCalcOnLoad: calcPr && typeof calcPr.fullCalcOnLoad === "boolean" ? calcPr.fullCalcOnLoad : null,
  };

  return {
    parser: { id: "sheetjs-ce", version: String(XLSX.version || "unknown") },
    calculation,
    namedRanges,
    sheets,
    scan: {
      sheetCount: sheetNames.length,
      cellCount,
      formulaCellCount,
      rejectedExternalLinks: 0,
      warnings,
      unsupported,
    },
  };
}

function main() {
  if (!parentPort || !workerData) {
    throw new Error("worker 缺少 parentPort/workerData");
  }
  const { buffer, limits } = workerData;
  // structured clone 后 Buffer 可能退化为 Uint8Array，统一归一为 Buffer。
  if (!(buffer instanceof Uint8Array) || !limits || typeof limits !== "object") {
    throw new Error("workerData 形状不合法");
  }
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  try {
    const result = parse(bytes, limits);
    parentPort.postMessage({ ok: true, marker: WORKER_MARKER, result });
  } catch (error) {
    if (error instanceof Reject) {
      parentPort.postMessage({ ok: false, marker: WORKER_MARKER, failureCode: error.failureCode, message: error.message });
    } else {
      parentPort.postMessage({
        ok: false,
        marker: WORKER_MARKER,
        failureCode: "parse_failed",
        message: error && error.message ? error.message : String(error),
      });
    }
  }
}

main();
