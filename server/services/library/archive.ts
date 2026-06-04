import { prisma } from "@/lib/prisma";

export interface ArchiveSnapshot {
  requestId: number;
  archivedAt: Date;
  questions: Array<{
    questionId: number;
    questionText: string;
    materials: Array<{
      documentId: number;
      title: string | null;
      fileName: string;
      selected: boolean;
    }>;
  }>;
}

export async function archiveRequest(id: number): Promise<ArchiveSnapshot> {
  const req = await prisma.dueDiligenceRequest.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { createdAt: "asc" },
        include: {
          materials: {
            where: { selected: true },
            include: {
              document: { select: { id: true, title: true, fileName: true } },
            },
          },
        },
      },
    },
  });
  if (!req) throw new Error("Request not found");
  if (req.status !== "approved") {
    throw new Error("Request must be approved before archiving");
  }

  const empty = req.questions.filter((q) => q.materials.length === 0);
  if (empty.length > 0) {
    throw new Error(`${empty.length} question(s) have no selected materials`);
  }

  await prisma.dueDiligenceRequest.update({
    where: { id },
    data: { status: "provided" },
  });

  return {
    requestId: id,
    archivedAt: new Date(),
    questions: req.questions.map((q) => ({
      questionId: q.id,
      questionText: q.questionText,
      materials: q.materials.map((m) => ({
        documentId: m.document.id,
        title: m.document.title,
        fileName: m.document.fileName,
        selected: m.selected,
      })),
    })),
  };
}
