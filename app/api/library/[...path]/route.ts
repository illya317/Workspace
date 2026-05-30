import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/server/auth/session";

const LIBRARY_ROOT = process.env.LIBRARY_ROOT || "/Users/koito/Desktop/FH/资料库";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path: segments } = await params;
  const filePath = path.join(LIBRARY_ROOT, ...segments);

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) return NextResponse.json({ error: "Not a file" }, { status: 400 });

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain", ".csv": "text/csv",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
        "Content-Length": String(s.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
