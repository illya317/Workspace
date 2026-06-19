import { NextResponse } from "next/server";
import { buildQcTemplateCache } from "@workspace/production/server/qc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const token = request.headers.get("x-qc-cache-warmup");
  if (!token || token !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const cache = await buildQcTemplateCache();
  return NextResponse.json({
    ok: true,
    builtAt: cache.builtAt,
    contentHash: cache.contentHash,
    productCount: Object.keys(cache.templates).length,
  });
}
