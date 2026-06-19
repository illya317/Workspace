import { prisma } from "@workspace/platform/server/prisma";

function generateDocId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `DOC-${date}-${rand}`;
}

export async function generateUniqueDocId(): Promise<string> {
  let attempts = 0;
  while (attempts < 5) {
    const candidate = generateDocId();
    const existing = await prisma.libraryDocument.findUnique({ where: { docId: candidate } });
    if (!existing) return candidate;
    attempts++;
  }
  // 兜底：加时间戳微秒
  return `DOC-${Date.now()}`;
}
