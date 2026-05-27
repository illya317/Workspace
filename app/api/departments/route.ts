// ⚠️ 已迁移到 /api/hr/departments，本文件保留兼容期
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/hr/departments", url.origin);
  target.search = url.search;
  target.searchParams.set("pageSize", "99999");
  return fetch(target, { headers: request.headers });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/hr/departments", url.origin);
  return fetch(target, {
    method: "POST",
    headers: request.headers,
    body: await request.text(),
  });
}
