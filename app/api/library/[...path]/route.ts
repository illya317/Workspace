import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getLibraryFileByRelativePath } from "@workspace/library/server";
import { checkPermission } from "@/server/rbac/check";

function fileErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "File not found";
  const status = message === "File missing" || message === "File not found"
    ? 404
    : message === "Forbidden" || message === "Higher confidentiality required" || message === "File not indexed - run scan first"
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkPermission(user.id, "library", "access"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { path: segments } = await params;

  // 安全路径解析：防止 .. 路径穿越
  const relativePath = segments.join(path.sep);
  try {
    const file = await getLibraryFileByRelativePath(relativePath, user.id);
    return new NextResponse(file.buffer, {
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
