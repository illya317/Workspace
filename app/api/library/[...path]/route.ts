import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/server/auth/session";
import { safeResolve, getDefaultRoot } from "@/server/services/library/config";
import { prisma } from "@/lib/prisma";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";
import { checkPermission } from "@/server/rbac/check";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkPermission(user.id, "library", "access"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { path: segments } = await params;

  // 安全路径解析：防止 .. 路径穿越
  const relativePath = segments.join(path.sep);
  const filePath = safeResolve(relativePath);
  if (!filePath) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 二次确认：必须在允许的根目录内
  const root = getDefaultRoot();
  const normalizedRoot = path.resolve(root) + path.sep;
  if (!path.resolve(filePath).startsWith(normalizedRoot)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Phase 2: documentId 权限校验 — 通过 relativePath 查 DB 确认保密等级
  const doc = await prisma.libraryDocument.findFirst({
    where: { relativePath: relativePath.replace(/\\/g, "/") },
    select: { id: true, confidentialityLevel: true, status: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "File not indexed — run scan first" }, { status: 403 });
  }
  const maxLevel = await getMaxConfidentialityLevel(user.id);
  if (doc.confidentialityLevel > maxLevel) {
    return NextResponse.json({ error: "Higher confidentiality required" }, { status: 403 });
  }
  if (doc.status === "missing") {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) return NextResponse.json({ error: "Not a file" }, { status: 400 });

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain", ".csv": "text/csv",
      ".json": "application/json", ".xml": "application/xml",
      ".zip": "application/zip", ".tar": "application/x-tar", ".gz": "application/gzip",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
        "Content-Length": String(s.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
