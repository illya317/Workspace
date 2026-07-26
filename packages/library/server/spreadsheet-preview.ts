import "server-only";

import * as XLSX from "xlsx";

function htmlText(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSheet(workbook: XLSX.WorkBook, sheetName: string) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return "";
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  const body = rows.map((row, rowIndex) => {
    const tag = rowIndex === 0 ? "th" : "td";
    const cells = row.map((cell) => `<${tag}>${htmlText(cell)}</${tag}>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<section><h2>${htmlText(sheetName)}</h2><div class="sheet"><table>${body}</table></div></section>`;
}

export function renderSpreadsheetPreviewHtml(input: { buffer: Buffer; title: string }) {
  const workbook = XLSX.read(input.buffer, { type: "buffer", cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => renderSheet(workbook, sheetName)).join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlText(input.title)} - 本地表格预览</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; color: #172033; background: #f6f8fb; }
    h1 { margin: 0 0 18px; font-size: 20px; }
    h2 { margin: 18px 0 8px; font-size: 15px; }
    .notice { margin: 0 0 16px; color: #596579; font-size: 13px; }
    .sheet { max-width: 100%; overflow: auto; border: 1px solid #d8dee9; background: #fff; }
    table { min-width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
    th, td { min-width: 96px; max-width: 360px; padding: 7px 9px; border-right: 1px solid #e5e9f0; border-bottom: 1px solid #e5e9f0; text-align: left; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
    th { position: sticky; top: 0; z-index: 1; color: #172033; background: #edf2f7; font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    th:last-child, td:last-child { border-right: 0; }
    .empty { padding: 24px; color: #596579; background: #fff; border: 1px solid #d8dee9; }
  </style>
</head>
<body>
  <h1>${htmlText(input.title)}</h1>
  <p class="notice">本地开发环境只读预览；生产环境继续使用 ONLYOFFICE。</p>
  ${sheets || '<div class="empty">工作簿中没有可显示的工作表。</div>'}
</body>
</html>`;
}
