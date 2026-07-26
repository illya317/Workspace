import { matchText } from "@workspace/platform/search";

const SEARCH_TERM_LIMIT = 12;
const IDENTIFIER_PATTERN = /[A-Za-z0-9]+(?:[-_.:/][A-Za-z0-9]+)+/g;
const LATIN_OR_NUMBER_PATTERN = /[A-Za-z][A-Za-z0-9]*|\d{2,}/g;
const HAN_RUN_PATTERN = /\p{Script=Han}+/gu;
const PURE_HAN_PATTERN = /^\p{Script=Han}+$/u;
const SEARCH_STOP_WORDS = new Set([
  "一个", "一下", "上", "下", "与", "中", "为什么", "了", "什么", "从", "他们", "以及", "你们", "其中",
  "关于", "到", "吗", "呢", "和", "哪些", "在", "如何", "对", "就是", "是否", "有关", "有", "相关", "的",
  "着", "请", "请问", "这个", "这些", "那个", "那些", "里", "里面", "问题", "需要",
]);

export const LIBRARY_CHUNK_CANDIDATE_LIMIT = 12;
export const LIBRARY_EVIDENCE_LIMIT_PER_DOCUMENT = 3;
export const LIBRARY_EVIDENCE_QUOTE_MAX_CHARS = 1_800;
export const LIBRARY_MODEL_CONTEXT_MAX_CHARS = 24_000;

type JsonObject = Record<string, unknown>;

type WordSegment = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};

export interface LibraryChunkCandidate {
  chunkUid: string;
  ordinal: number;
  quote: string;
  locator: JsonObject;
  headingPath?: JsonObject | null;
  quoteCharStart?: number;
  quoteCharEnd?: number;
  quoteTruncated?: boolean;
}

export interface RankedLibraryChunk extends LibraryChunkCandidate {
  relevanceScore: number;
}

export interface LibraryModelEvidence {
  chunkUid?: string;
  quote: string;
  locator: JsonObject;
  quoteCharStart?: number;
  quoteCharEnd?: number;
  quoteTruncated?: boolean;
}

export interface LibraryModelDocument {
  score: number;
  documentId: number;
  documentUid: string;
  versionUid: string;
  docId: string;
  title: string;
  evidence: LibraryModelEvidence[];
}

export interface LibrarySearchModelContext {
  kind: "library-search-evidence-v1";
  query: string;
  candidates: {
    total: number;
    returned: number;
    included: number;
  };
  documents: Array<{
    title: string;
    docId: string;
    viewPath: string;
    documentUid: string;
    versionUid: string;
    evidence: LibraryModelEvidence[];
  }>;
  omitted: {
    candidateDocumentsOutsideResult: number;
    returnedDocumentsWithoutEvidence: number;
    documentsDueToCharacterBudget: number;
    evidenceQuotesDueToCharacterBudget: number;
  };
  characterBudget: number;
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").replace(/[\u2010-\u2015\u2212]/g, "-").trim();
}

function isUsefulTerm(value: string) {
  const term = value.trim();
  if (term.length < 2 || SEARCH_STOP_WORDS.has(term.toLocaleLowerCase("zh-CN"))) return false;
  return PURE_HAN_PATTERN.test(term) || /[A-Za-z0-9]/.test(term);
}

function segmentWords(value: string): WordSegment[] {
  try {
    if (typeof Intl.Segmenter !== "function") return [];
    return [...new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(value)]
      .map((item) => ({ segment: item.segment, index: item.index, isWordLike: item.isWordLike }));
  } catch {
    return [];
  }
}

export function extractLibrarySearchTerms(query: string) {
  const normalized = normalizeSearchText(query);
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    const term = candidate.trim();
    const key = term.toLocaleLowerCase("zh-CN");
    if (!isUsefulTerm(term) || seen.has(key)) return;
    seen.add(key);
    terms.push(term);
  };

  if (/^[A-Za-z0-9]+(?:[-_.:/][A-Za-z0-9]+)+$/.test(normalized)) {
    add(normalized);
    return terms;
  }
  for (const match of normalized.matchAll(IDENTIFIER_PATTERN)) add(match[0]);
  const lexicalInput = normalized.replace(IDENTIFIER_PATTERN, (identifier) => " ".repeat(identifier.length));

  const segments = segmentWords(lexicalInput);
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (!PURE_HAN_PATTERN.test(current.segment) || !PURE_HAN_PATTERN.test(next.segment)) continue;
    if (current.segment.length !== 1 || next.segment.length !== 1) continue;
    if (current.index + current.segment.length !== next.index) continue;
    add(`${current.segment}${next.segment}`);
  }
  for (const item of segments) {
    if (item.isWordLike === false) continue;
    add(item.segment);
  }

  // ICU dictionaries vary. Han bigrams keep recall deterministic when a useful
  // phrase (for example “关账”) is emitted as adjacent single-character words.
  for (const match of lexicalInput.matchAll(HAN_RUN_PATTERN)) {
    const run = match[0];
    for (let index = 0; index < run.length - 1; index += 1) add(run.slice(index, index + 2));
  }
  for (const match of lexicalInput.matchAll(LATIN_OR_NUMBER_PATTERN)) add(match[0]);

  if (terms.length === 0) add(normalized);
  return terms.slice(0, SEARCH_TERM_LIMIT);
}

function headingText(candidate: LibraryChunkCandidate) {
  const values: string[] = [];
  const append = (value: unknown) => {
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) value.forEach(append);
  };
  append(candidate.locator.sectionPath);
  append(candidate.headingPath?.path);
  append(candidate.headingPath?.sectionPath);
  append(candidate.headingPath?.kind);
  return values.join(" ");
}

function scoreChunk(query: string, terms: string[], candidate: LibraryChunkCandidate) {
  const heading = headingText(candidate);
  let score = 0;
  if (heading && matchText(heading, query)) score += 180;
  if (matchText(candidate.quote, query)) score += 120;
  for (const term of terms) {
    if (heading && matchText(heading, term)) score += 36;
    if (matchText(candidate.quote, term)) score += 14;
  }
  if (!candidate.quoteTruncated) score += 1;
  return score;
}

export function rankLibraryChunkCandidates(input: {
  query: string;
  terms: string[];
  chunks: LibraryChunkCandidate[];
}) {
  return input.chunks
    .map((chunk) => ({ ...chunk, relevanceScore: scoreChunk(input.query, input.terms, chunk) }))
    .sort((left, right) => right.relevanceScore - left.relevanceScore
      || left.ordinal - right.ordinal
      || left.chunkUid.localeCompare(right.chunkUid));
}

function serializedLength(value: unknown) {
  return JSON.stringify(value).length;
}

export function buildLibrarySearchModelContext(input: {
  query: string;
  totalCandidates: number;
  documents: LibraryModelDocument[];
}, options?: { maxChars?: number }): LibrarySearchModelContext {
  const maxChars = options?.maxChars ?? LIBRARY_MODEL_CONTEXT_MAX_CHARS;
  const totalEvidence = input.documents.reduce((total, document) => total + document.evidence.length, 0);
  const context: LibrarySearchModelContext = {
    kind: "library-search-evidence-v1",
    query: input.query,
    candidates: { total: input.totalCandidates, returned: input.documents.length, included: 0 },
    documents: [],
    omitted: {
      candidateDocumentsOutsideResult: Math.max(0, input.totalCandidates - input.documents.length),
      returnedDocumentsWithoutEvidence: input.documents.filter((document) => document.evidence.length === 0).length,
      documentsDueToCharacterBudget: input.documents.length,
      evidenceQuotesDueToCharacterBudget: totalEvidence,
    },
    characterBudget: maxChars,
  };
  if (serializedLength(context) > maxChars) throw new Error("Library model context character budget is too small");

  const includedByVersion = new Map<string, LibrarySearchModelContext["documents"][number]>();
  for (const document of input.documents) {
    const modelDocument: LibrarySearchModelContext["documents"][number] = {
      title: document.title,
      docId: document.docId,
      viewPath: `/library/basic-info/documents/${document.documentId}`,
      documentUid: document.documentUid,
      versionUid: document.versionUid,
      evidence: [],
    };
    context.documents.push(modelDocument);
    context.candidates.included = context.documents.length;
    context.omitted.documentsDueToCharacterBudget = input.documents.length - context.documents.length;
    if (serializedLength(context) <= maxChars) {
      includedByVersion.set(document.versionUid, modelDocument);
      continue;
    }
    context.documents.pop();
    context.candidates.included = context.documents.length;
    context.omitted.documentsDueToCharacterBudget = input.documents.length - context.documents.length;
  }

  const candidates = input.documents.flatMap((document, documentIndex) =>
    document.evidence.map((evidence, evidenceIndex) => ({
      document,
      evidence,
      documentIndex,
      evidenceIndex,
      priority: document.score - evidenceIndex * 10,
    })))
    .sort((left, right) => right.priority - left.priority
      || left.documentIndex - right.documentIndex
      || left.evidenceIndex - right.evidenceIndex);
  let includedEvidence = 0;

  for (const candidate of candidates) {
    const modelDocument = includedByVersion.get(candidate.document.versionUid);
    if (!modelDocument) continue;
    modelDocument.evidence.push(candidate.evidence);
    context.omitted.evidenceQuotesDueToCharacterBudget = totalEvidence - includedEvidence - 1;

    if (serializedLength(context) <= maxChars) {
      includedEvidence += 1;
      continue;
    }

    modelDocument.evidence.pop();
    context.omitted.evidenceQuotesDueToCharacterBudget = totalEvidence - includedEvidence;
  }

  return context;
}
