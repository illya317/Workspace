import { prisma } from "@/lib/prisma";

// ─── Simple keyword-based matching ───────────────────────────

const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也",
  "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那",
  "请", "说明", "描述", "提供", "列出", "是否", "什么", "如何", "哪些", "相关", "关于",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "shall", "should", "can", "could", "may", "might",
  "must", "shall", "should", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below", "between",
  "and", "or", "but", "so", "yet", "it", "its", "this", "that", "these", "those",
]);

function tokenize(text: string): string[] {
  // Simple tokenizer: split by non-word chars, filter stop words and short tokens
  return text
    .toLowerCase()
    .replace(/[^一-龥a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function extractKeywords(text: string): string[] {
  const tokens = tokenize(text);
  // Deduplicate while preserving order
  return Array.from(new Set(tokens));
}

function scoreDocument(
  keywords: string[],
  doc: { title: string | null; summary: string | null; fileName: string; categoryName: string | null; categoryCode: string | null },
): number {
  let score = 0;
  const haystack = `${doc.title ?? ""} ${doc.summary ?? ""} ${doc.fileName} ${doc.categoryName ?? ""} ${doc.categoryCode ?? ""}`.toLowerCase();
  for (const kw of keywords) {
    if (haystack.includes(kw)) {
      score += 1;
      // Boost exact title match
      if ((doc.title ?? "").toLowerCase().includes(kw)) score += 2;
      // Boost category match
      if ((doc.categoryName ?? "").toLowerCase().includes(kw)) score += 1;
    }
  }
  return score;
}

export interface MatchResult {
  documentId: number;
  documentVersionId: number | null;
  matchScore: number;
  reason: string;
}

export async function matchDocumentsForQuestion(
  questionText: string,
  maxConfidentialityLevel: number,
  limit: number = 10,
): Promise<MatchResult[]> {
  const keywords = extractKeywords(questionText);
  if (keywords.length === 0) return [];

  // Fetch candidate documents within confidentiality range
  const docs = await prisma.libraryDocument.findMany({
    where: {
      status: "active",
      confidentialityLevel: { lte: maxConfidentialityLevel },
    },
    select: {
      id: true,
      title: true,
      summary: true,
      fileName: true,
      categoryName: true,
      categoryCode: true,
      versions: { orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true } },
    },
  });

  const scored = docs
    .map((doc) => ({
      doc,
      score: scoreDocument(keywords, doc),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => ({
    documentId: s.doc.id,
    documentVersionId: s.doc.versions[0]?.id ?? null,
    matchScore: s.score,
    reason: `关键词匹配: ${keywords.slice(0, 5).join(", ")}`,
  }));
}

// ─── Agent-based matching (placeholder) ──────────────────────

export async function matchDocumentsWithAgent(
  _questionText: string,
  _maxConfidentialityLevel: number,
): Promise<MatchResult[]> {
  // TODO: Integrate with /api/agent to get semantic recommendations.
  // For now, return empty to keep the flow simple.
  return [];
}
