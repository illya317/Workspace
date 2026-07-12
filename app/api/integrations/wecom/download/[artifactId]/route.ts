import { NextResponse } from "next/server";
import { z } from "zod";

import { getLibraryExportFile } from "@workspace/library/server/export";
import { getLibraryFileByVersionUid } from "@workspace/library/server/file-access";
import { verifyWecomArtifactToken } from "@workspace/platform/server/agent";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { authenticate } from "@workspace/platform/server/auth";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const paramsSchema = z.object({ artifactId: z.string().uuid() });
const querySchema = z.object({ token: z.string().min(80).max(1000) });

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!params.success || !query.success) return jsonErrorResponse("Invalid download link", 400);

  const claims = verifyWecomArtifactToken(query.data.token);
  if (!claims || claims.artifactId !== params.data.artifactId) {
    return jsonErrorResponse("下载链接无效或已过期", 403);
  }

  const user = await authenticate(request);
  if (!user) {
    const nextPath = `${BASE_PATH}/api/integrations/wecom/download/${encodeURIComponent(params.data.artifactId)}?token=${encodeURIComponent(query.data.token)}`;
    const login = new URL(`${BASE_PATH}/api/auth/wecom/start`, request.url);
    login.searchParams.set("next", nextPath);
    return NextResponse.redirect(login);
  }
  if (user.userId !== claims.userId) return jsonErrorResponse("该下载链接不属于当前用户", 403);

  try {
    const file = claims.source === "library-version"
      ? await getLibraryFileByVersionUid(params.data.artifactId, user.userId)
      : await getLibraryExportFile(params.data.artifactId, user.userId);
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(file.size),
        "Content-Type": file.contentType,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return jsonErrorResponse("资料包不存在或当前已无权下载", 403);
  }
}
