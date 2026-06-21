import { NextResponse } from "next/server";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { getLibraryFileByRelativePath } from "@workspace/library/server";

function fileErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "File not found";
  const status = message === "File missing" || message === "File not found"
    ? 404
    : message === "Forbidden" || message === "Higher confidentiality required" || message === "File not indexed - run scan first"
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const { path: segments } = await params;

  const relativePath = segments.join("/");
  try {
    const file = await getLibraryFileByRelativePath(relativePath, auth.user.userId);
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
}
