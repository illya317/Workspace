import { prisma } from "@workspace/platform/server/prisma";

export interface ArchiveSnapshot {
  requestId: number;
  archivedAt: Date;
  archivedBy: number;
  questions: Array<{
    questionId: number;
    questionText: string;
    materials: Array<{
      documentId: number;
      documentVersionId: number | null;
      title: string | null;
      fileName: string;
      selected: boolean;
    }>;
  }>;
}

export async function archiveRequest(
  id: number,
  userId: number,
  maxConfidentialityLevel: number,
): Promise<ArchiveSnapshot> {
  const req = await prisma.dueDiligenceRequest.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { createdAt: "asc" },
        include: {
          materials: {
            where: { selected: true },
            include: {
              document: { select: { id: true, title: true, fileName: true, confidentialityLevel: true } },
              documentVersion: { select: { id: true, documentId: true, versionNo: true } },
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

  // P1: Filter out materials exceeding user's confidentiality level
  const filteredQuestions = req.questions.map((q) => ({
    ...q,
    materials: q.materials.filter((m) => m.document.confidentialityLevel <= maxConfidentialityLevel),
  }));

  // P3: Every question must have at least one selected material after filtering
  const empty = filteredQuestions.filter((q) => q.materials.length === 0);
  if (empty.length > 0) {
    throw new Error(`${empty.length} question(s) have no selected materials`);
  }

  // P2: Validate documentVersion consistency before archiving
  for (const q of filteredQuestions) {
    for (const m of q.materials) {
      if (m.documentVersionId !== null && m.documentVersion !== null) {
        if (m.documentVersion.documentId !== m.documentId) {
          throw new Error(
            `Version consistency error: selection ${m.id} references documentVersion ${m.documentVersionId} which does not belong to document ${m.documentId}`,
          );
        }
      }
    }
  }

  const now = new Date();

  await prisma.dueDiligenceRequest.update({
    where: { id },
    data: { status: "provided", archivedAt: now, archivedBy: userId },
  });

  return {
    requestId: id,
    archivedAt: now,
    archivedBy: userId,
    questions: filteredQuestions.map((q) => ({
      questionId: q.id,
      questionText: q.questionText,
      materials: q.materials.map((m) => ({
        documentId: m.document.id,
        documentVersionId: m.documentVersion?.id ?? null,
        title: m.document.title,
        fileName: m.document.fileName,
        selected: m.selected,
      })),
    })),
  };
}
