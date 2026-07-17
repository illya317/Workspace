export { libraryOfficeDocumentType } from "../constants/office-preview";

export function libraryOfficeDocumentKey(versionUid: string, checksumSha256: string) {
  return `${versionUid.replace(/[^a-zA-Z0-9_-]/g, "")}-${checksumSha256.slice(0, 32)}`.slice(0, 128);
}

function htmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function scriptJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderLibraryOnlyOfficeHtml(input: {
  title: string;
  apiScriptPath: string;
  nonce: string;
  config: Record<string, unknown>;
}) {
  const title = htmlText(input.title);
  const apiScriptPath = htmlText(input.apiScriptPath);
  const nonce = htmlText(input.nonce);
  const config = scriptJson(input.config);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>html,body,#onlyoffice-editor{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}</style>
</head>
<body>
  <div id="onlyoffice-editor" aria-label="${title}"></div>
  <script src="${apiScriptPath}"></script>
  <script nonce="${nonce}">
    if (!window.DocsAPI) {
      document.body.textContent = "Office 阅读器暂不可用，请联系管理员检查 ONLYOFFICE 服务。";
    } else {
      new window.DocsAPI.DocEditor("onlyoffice-editor", ${config});
    }
  </script>
</body>
</html>`;
}
