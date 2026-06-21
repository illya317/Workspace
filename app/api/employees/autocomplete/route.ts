// @deprecated 兼容入口，新代码请使用 /api/modules/hr/reference-options 或 Core FkFieldInput。本文件纯代理，不再新增业务逻辑。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/hr/autocomplete", url.origin);
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q");
  if (type) target.searchParams.set("entity", type);
  if (q) target.searchParams.set("keyword", q);
  return fetch(target, { headers: request.headers });
}
