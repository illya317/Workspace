import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { withLibraryAccess } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { safeResolve, getDefaultRoot } from "@/server/services/library/config";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const doc = await prisma.libraryDocument.findUnique({
    where: { id: docId },
    select: { id: true, relativePath: true, fileName: true, confidentialityLevel: true, status: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  if (doc.confidentialityLevel > maxLevel) {
    return NextResponse.json({ error: "Higher confidentiality required" }, { status: 403 });
  }
  if (doc.status === "missing") {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
  if (!doc.relativePath) {
    return NextResponse.json({ error: "No file path" }, { status: 400 });
  }

  const filePath = safeResolve(doc.relativePath);
  if (!filePath) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 二次确认：必须在允许的根目录内
  const root = getDefaultRoot();
  const normalizedRoot = path.resolve(root) + path.sep;
  if (!path.resolve(filePath).startsWith(normalizedRoot)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "Content-Length": String(s.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
});
