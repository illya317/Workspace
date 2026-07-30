import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { downloadFinanceWorkbook } from "./workbook-download";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

function replaceProperty(
  target: object,
  key: PropertyKey,
  value: unknown,
): () => void {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  });
  return original
    ? () => Object.defineProperty(target, key, original)
    : () => Reflect.deleteProperty(target, key);
}

test("下载失败时透传服务端业务错误", async (t) => {
  const restoreFetch = replaceProperty(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ error: "报表范围尚未就绪" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    }),
  );
  t.after(restoreFetch);

  await assert.rejects(
    downloadFinanceWorkbook("/api/modules/finance/statements/export", "报表.xlsx"),
    /报表范围尚未就绪/,
  );
});

test("下载成功时采用响应文件名并释放对象 URL", async (t) => {
  const link = {
    href: "",
    download: "",
    clicked: false,
    click() {
      this.clicked = true;
    },
  };
  const revoked: string[] = [];
  const objectUrl = "blob:finance-workbook";

  const restoreFetch = replaceProperty(
    globalThis,
    "fetch",
    async () => new Response(new Blob(["workbook"]), {
      status: 200,
      headers: {
        "content-disposition": "attachment; filename*=UTF-8''%E5%90%88%E5%B9%B6%E6%8A%A5%E8%A1%A8.xlsx",
      },
    }),
  );
  const restoreDocument = replaceProperty(
    globalThis,
    "document",
    { createElement: () => link },
  );
  const restoreCreateObjectUrl = replaceProperty(
    URL,
    "createObjectURL",
    () => objectUrl,
  );
  const restoreRevokeObjectUrl = replaceProperty(
    URL,
    "revokeObjectURL",
    (value: string) => revoked.push(value),
  );
  t.after(() => {
    restoreRevokeObjectUrl();
    restoreCreateObjectUrl();
    restoreDocument();
    restoreFetch();
  });

  await downloadFinanceWorkbook("/api/modules/finance/statements/export", "fallback.xlsx");

  assert.equal(link.href, objectUrl);
  assert.equal(link.download, "合并报表.xlsx");
  assert.equal(link.clicked, true);
  assert.deepEqual(revoked, [objectUrl]);
});

test("Finance UI 只保留 workbook-download 能力入口", () => {
  const removedEntrypoints = [
    resolve(currentDirectory, "components/downloadFinanceWorkbook.ts"),
    resolve(currentDirectory, "statements/statement-download.ts"),
  ];
  for (const file of removedEntrypoints) {
    assert.equal(existsSync(file), false, `旧下载入口不应存在: ${file}`);
  }

  const callers = [
    "assets/useAssetExportAction.ts",
    "ledger/useLedgerExportAction.ts",
    "statements/ReportTab.tsx",
    "statements/ConsolidatedReportTab.tsx",
    "statements/ConsolidationWorksheetTab.tsx",
  ];
  for (const caller of callers) {
    const source = readFileSync(resolve(currentDirectory, caller), "utf8");
    assert.doesNotMatch(source, /components\/downloadFinanceWorkbook|statement-download|downloadStatementWorkbook/);
    assert.match(source, /workbook-download/);
  }
});
