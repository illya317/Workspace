import { matchText } from "@workspace/platform/search";

import { extractLibrarySearchTerms } from "./search-relevance";

const DELIVERY_REQUEST_PATTERN = /(打包|资料包|压缩包|\bzip\b|发(?:送)?(?:给我|到企业微信|到企微)?|直接发)/iu;
const DELIVERY_NEGATION_PATTERN = /(不要|不用|无需|别).{0,8}(打包|资料包|压缩包|\bzip\b|发)/iu;
const DELIVERY_WORD_PATTERN = /(请|麻烦|帮我|我需要|需要|你|直接|把|将|给我|打包下载|打包|压缩包|资料包|下载链接|链接|下载|发给我|发送给我|发到企业微信|发送到企业微信|发到企微|发送到企微|发送|发)/giu;
const GENERIC_TERMS = new Set([
  "一个", "一些", "上面", "下面", "之前", "什么", "刚才", "几个", "几份", "这些", "那些", "哪个", "哪些",
  "文件", "明细", "查看", "相关", "直接", "给我", "资料", "这个", "那个", "里面", "内容", "即可", "可以",
]);

export const DIRECT_LIBRARY_FILE_LIMIT = 10;

export type LibraryDeliveryHistoryMessage = { role: "user" | "agent"; content: string };

export interface LibraryDeliveryDocument {
  documentUid: string;
  versionUid: string;
  title: string;
  docId: string;
  categoryName?: string | null;
  tags?: string[];
}

export function isLibraryDeliveryRequest(message: string) {
  return DELIVERY_REQUEST_PATTERN.test(message) && !DELIVERY_NEGATION_PATTERN.test(message);
}

function cleanDeliveryQuery(message: string) {
  return message
    .normalize("NFKC")
    .replace(DELIVERY_WORD_PATTERN, " ")
    .replace(/[，。！？!?、:：；;（）()[\]{}“”"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deliveryTerms(query: string) {
  return extractLibrarySearchTerms(query)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !GENERIC_TERMS.has(term) && !term.includes("的"));
}

function hasSpecificDeliverySubject(query: string) {
  return deliveryTerms(query).length > 0;
}

export function resolveLibraryDeliveryQuery(
  message: string,
  history: LibraryDeliveryHistoryMessage[] = [],
) {
  const current = cleanDeliveryQuery(message);
  if (hasSpecificDeliverySubject(current)) return current;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role !== "user") continue;
    const candidate = cleanDeliveryQuery(item.content);
    if (hasSpecificDeliverySubject(candidate)) return candidate;
  }
  return "";
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
