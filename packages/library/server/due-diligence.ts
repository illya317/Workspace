import { prisma } from "@workspace/platform/server/prisma";
import type {
  DueDiligenceMaterialSelection,
  DueDiligenceQuestion,
  DueDiligenceRequest,
} from "@workspace/platform/server/prisma";

// ─── Types ───────────────────────────────────────────────────

export interface CreateRequestInput {
  title: string;
  partyName: string;
  defaultConfidentialityLevel?: number;
}

export interface UpdateRequestInput {
  title?: string;
  partyName?: string;
  status?: string;
  defaultConfidentialityLevel?: number;
}

export interface RequestWithQuestions extends DueDiligenceRequest {
  questions: QuestionWithMaterials[];
  _count?: { questions: number };
}

export interface QuestionWithMaterials extends DueDiligenceQuestion {
  materials: MaterialWithDocument[];
}

export interface MaterialWithDocument extends DueDiligenceMaterialSelection {
  document: { id: number; title: string | null; fileName: string; categoryName: string | null; confidentialityLevel: number };
  documentVersion: { id: number; versionNo: number } | null;
}

// ─── Simple questionnaire splitter ───────────────────────────

function isQuestionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Skip headers like "尽调问卷", "一、" etc. if they are very short
  if (trimmed.length < 5 && !trimmed.match(/\d/)) return false;
  return true;
}

export function splitQuestionnaire(text: string): string[] {
  const lines = text.split(/\n|\r\n/);
  const questions: string[] = [];
  let current = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current.trim()) {
        questions.push(current.trim());
        current = "";
      }
      continue;
    }
    // Detect numbered items: 1. 1、 Q1: (1) etc.
    const isNewItem = /^\s*(?:\d+[\.、\)\]】]|\([\d一二三四五六七八九十]+\)|[Qq]\d+[\.:：]|\d+\s+[\.、])/.test(line);
    if (isNewItem && current.trim()) {
      questions.push(current.trim());
      current = line;
    } else {
      current += (current ? " " : "") + line;
    }
  }
  if (current.trim()) {
    questions.push(current.trim());
  }

  // Filter out non-questions
  return questions.filter(isQuestionLine);
}

// ─── CRUD ────────────────────────────────────────────────────

export async function listRequests(): Promise<RequestWithQuestions[]> {
  const requests = await prisma.dueDiligenceRequest.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { questions: true } },
    },
  });
  return requests as RequestWithQuestions[];
}

export async function createRequest(
  input: CreateRequestInput,
  _userId: number,
): Promise<DueDiligenceRequest> {
  // Party is just a label; auto-create/reuse by name
  let party = await prisma.dueDiligenceParty.findFirst({
    where: { name: input.partyName },
  });
  if (!party) {
    party = await prisma.dueDiligenceParty.create({
      data: { name: input.partyName, type: "external" },
    });
  }
  return prisma.dueDiligenceRequest.create({
    data: {
      title: input.title,
      partyId: party.id,
      status: "draft",
      defaultConfidentialityLevel: input.defaultConfidentialityLevel ?? 2,
    },
  });
}

export async function getRequest(
  id: number,
  maxConfidentialityLevel?: number,
): Promise<RequestWithQuestions | null> {
  const req = await prisma.dueDiligenceRequest.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { createdAt: "asc" },
        include: {
          materials: {
            include: {
              document: { select: { id: true, title: true, fileName: true, categoryName: true, confidentialityLevel: true } },
              documentVersion: { select: { id: true, versionNo: true } },
            },
          },
        },
      },
    },
  });
  if (!req) return null;

  if (maxConfidentialityLevel !== undefined) {
    const filtered = req.questions.map((q) => ({
      ...q,
      materials: q.materials.filter((m) => m.document.confidentialityLevel <= maxConfidentialityLevel),
    }));
    return { ...req, questions: filtered } as RequestWithQuestions;
  }

  return req as RequestWithQuestions;
}

export async function updateRequest(
  id: number,
  input: UpdateRequestInput,
): Promise<DueDiligenceRequest> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.status !== undefined) data.status = input.status;
  if (input.defaultConfidentialityLevel !== undefined) data.defaultConfidentialityLevel = input.defaultConfidentialityLevel;
  return prisma.dueDiligenceRequest.update({ where: { id }, data });
}

export async function deleteRequest(id: number): Promise<void> {
  await prisma.dueDiligenceRequest.delete({ where: { id } });
}

// ─── Questions ───────────────────────────────────────────────

export async function createQuestions(
  requestId: number,
  texts: string[],
): Promise<DueDiligenceQuestion[]> {
  const data = texts.map((text) => ({
    requestId,
    questionText: text,
    status: "draft" as const,
  }));
  return prisma.dueDiligenceQuestion.createManyAndReturn({ data });
}

export async function updateQuestion(
  id: number,
  input: { answerDraft?: string; status?: string; notes?: string },
): Promise<DueDiligenceQuestion> {
  const data: Record<string, unknown> = {};
  if (input.answerDraft !== undefined) data.answerDraft = input.answerDraft;
  if (input.status !== undefined) data.status = input.status;
  if (input.notes !== undefined) data.notes = input.notes;
  return prisma.dueDiligenceQuestion.update({ where: { id }, data });
}

// ─── Material Selections ─────────────────────────────────────

export async function createMaterialSelections(
  questionId: number,
  selections: Array<{
    documentId: number;
    documentVersionId?: number;
    matchScore?: number;
    reason?: string;
  }>,
): Promise<void> {
  if (selections.length === 0) return;
  await prisma.dueDiligenceMaterialSelection.createMany({
    data: selections.map((s) => ({
      questionId,
      documentId: s.documentId,
      documentVersionId: s.documentVersionId ?? null,
      matchScore: s.matchScore ?? null,
      reason: s.reason ?? null,
      selected: false,
    })),
  });
}

export async function updateMaterialSelection(
  id: number,
  input: { selected?: boolean; selectedBy?: number },
): Promise<DueDiligenceMaterialSelection> {
  const data: Record<string, unknown> = {};
  if (input.selected !== undefined) {
    data.selected = input.selected;
    data.selectedAt = input.selected ? new Date() : null;
  }
  if (input.selectedBy !== undefined) data.selectedBy = input.selectedBy;
  return prisma.dueDiligenceMaterialSelection.update({ where: { id }, data });
}

export async function clearMaterialSelections(questionId: number): Promise<void> {
  await prisma.dueDiligenceMaterialSelection.deleteMany({ where: { questionId } });
}

export async function verifyQuestionBelongsToRequest(requestId: number, questionId: number) {
  const question = await prisma.dueDiligenceQuestion.findUnique({
    where: { id: questionId },
    select: { requestId: true },
  });
  if (!question) return { ok: false as const, status: 404, error: "Question not found" };
  if (question.requestId !== requestId) {
    return { ok: false as const, status: 403, error: "Question does not belong to this request" };
  }
  return { ok: true as const };
}

export async function listQuestionMaterialSelections(questionId: number, maxConfidentialityLevel: number) {
  return prisma.dueDiligenceMaterialSelection.findMany({
    where: {
      questionId,
      document: { confidentialityLevel: { lte: maxConfidentialityLevel } },
    },
    include: {
      document: { select: { id: true, title: true, fileName: true, categoryName: true, confidentialityLevel: true } },
      documentVersion: { select: { id: true, versionNo: true } },
    },
    orderBy: { matchScore: "desc" },
  });
}

export async function getMaterialSelectionAccess(selectionId: number) {
  return prisma.dueDiligenceMaterialSelection.findUnique({
    where: { id: selectionId },
    select: {
      questionId: true,
      document: { select: { confidentialityLevel: true } },
    },
  });
}
