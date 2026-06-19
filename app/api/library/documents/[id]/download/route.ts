import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getLibraryFileByDocumentId } from "@workspace/library/server";

function fileErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "File not found";
  const status = message === "Not found" || message === "File missing" || message === "File not found"
    ? 404
    : message === "Forbidden" || message === "Higher confidentiality required"
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const file = await getLibraryFileByDocumentId(docId, user.userId);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(file.size),
      },
    });
  } catch (error) {
    return fileErrorResponse(error);
  }
});
