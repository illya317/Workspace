import { matchText } from "@workspace/platform/search";

import { extractLibrarySearchTerms } from "./search-relevance";

const GENERIC_TERMS = new Set([
  "一个", "一些", "上面", "下面", "之前", "什么", "刚才", "几个", "几份", "这些", "那些", "哪个", "哪些",
  "文件", "明细", "查看", "相关", "直接", "给我", "资料", "这个", "那个", "里面", "内容", "即可", "可以",
]);

export const DIRECT_LIBRARY_FILE_LIMIT = 5;

export interface LibraryDeliveryDocument {
  documentUid: string;
  versionUid: string;
  title: string;
  docId: string;
  categoryName?: string | null;
  tags?: string[];
}

function deliveryTerms(query: string) {
  return extractLibrarySearchTerms(query)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !GENERIC_TERMS.has(term) && !term.includes("的"));
}

function documentDeliveryScore(query: string, document: LibraryDeliveryDocument) {
  const searchable = [document.title, document.docId, document.categoryName, ...(document.tags ?? [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  const terms = deliveryTerms(query);
  let score = matchText(searchable, query) ? 100 : 0;
  for (const term of terms) {
    if (matchText(searchable, term)) score += Math.min(8, term.length * 2);
  }
  return score;
}

export function selectLibraryDeliveryDocuments<T extends LibraryDeliveryDocument>(
  query: string,
  documents: T[],
) {
  const scored = documents.map((document, index) => ({
    document,
    index,
    score: documentDeliveryScore(query, document),
  }));
  const bestScore = Math.max(0, ...scored.map((item) => item.score));
  if (bestScore <= 0) return [];
  return scored
    .filter((item) => item.score === bestScore)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.document);
}

export function shouldSendLibraryFilesDirectly(documentCount: number) {
  return documentCount > 0 && documentCount <= DIRECT_LIBRARY_FILE_LIMIT;
}
