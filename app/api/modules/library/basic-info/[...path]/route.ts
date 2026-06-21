import { NextResponse } from "next/server";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { getLibraryFileByRelativePath } from "@workspace/library/server";
import { authorize } from "@workspace/platform/server/auth";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";

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
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await authorize({ user, resourceKey: "library.basicInfo", action: "access" }))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { path: segments } = await params;

  const relativePath = segments.join("/");
  try {
    const file = await getLibraryFileByRelativePath(relativePath, user.id);
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
