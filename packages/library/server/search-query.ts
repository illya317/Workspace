import { prisma } from "@workspace/platform/server/prisma";
import { matchText } from "@workspace/platform/search";

function searchTerms(query: string) {
  const terms = query.normalize("NFKC").split(/[\s,，。；;、:：!?！？()（）]+/).map((term) => term.trim()).filter((term) => term.length >= 2);
  return [...new Set(terms.length > 0 ? terms : [query])].slice(0, 8);
}

function scoreMatch(input: { query: string; terms: string[]; docId: string; title: string | null; fileName: string; summary: string | null; tags: string[]; chunks: string[] }) {
  const query = input.query.toLocaleLowerCase("zh-CN");
  const text = (value: string | null) => (value || "").toLocaleLowerCase("zh-CN");
  let score = 0;
  if (text(input.docId) === query) score += 120;
  if (text(input.title) === query || text(input.fileName) === query) score += 80;
  score += Math.min(45, input.terms.filter((term) => matchText(input.title || "", term)).length * 30);
  score += Math.min(35, input.terms.filter((term) => matchText(input.fileName, term)).length * 25);
  score += Math.min(20, input.terms.filter((term) => matchText(input.summary || "", term)).length * 12);
  score += Math.min(30, input.tags.filter((tag) => input.terms.some((term) => matchText(tag, term))).length * 15);
  score += Math.min(30, input.chunks.filter((chunk) => input.terms.some((term) => matchText(chunk, term))).length * 10);
  return score;
}

export async function queryLibraryDocumentSet(input: {
  query: string;
  limit: number;
  maxConfidentialityLevel: number;
}) {
  const terms = searchTerms(input.query);
  const textConditions = (term: string) => [
    { docId: { contains: term } }, { title: { contains: term } }, { fileName: { contains: term } }, { summary: { contains: term } },
    { tags: { some: { tag: { status: "active", name: { contains: term } } } } },
    { tagCandidates: { some: { status: "pending", proposedName: { contains: term } } } },
    { metadataCandidates: { some: { status: "pending", OR: [{ keywordsJson: { contains: term } }, { entitiesJson: { contains: term } }] } } },
    { currentVersion: { is: { chunks: { some: { content: { contains: term } } } } } },
  ];
  const chunkConditions = terms.map((term) => ({ content: { contains: term } }));
  const tagConditions = terms.map((term) => ({ proposedName: { contains: term } }));
  const documents = await prisma.libraryDocument.findMany({
    where: {
      status: "active",
      confidentialityLevel: { lte: input.maxConfidentialityLevel },
      currentVersionId: { not: null },
      OR: terms.flatMap(textConditions),
    },
    take: 100,
    select: {
      id: true, documentUid: true, docId: true, title: true, fileName: true, summary: true,
      categoryName: true, confidentialityLevel: true,
      tags: { select: { tag: { select: { name: true } } } },
      currentVersion: {
        select: {
          id: true, versionUid: true,
          chunks: {
            where: { OR: chunkConditions }, take: 3, orderBy: { ordinal: "asc" },
            select: { chunkUid: true, content: true, locatorJson: true },
          },
        },
      },
      tagCandidates: {
        where: { status: "pending", OR: tagConditions }, take: 5,
        select: { proposedName: true },
      },
    },
  });
  const ranked = documents.map((document) => {
    const formalTags = document.tags.map((tag) => tag.tag.name);
    const candidateTags = document.tagCandidates.map((tag) => tag.proposedName);
    const tags = [...new Set([...formalTags, ...candidateTags])];
    const chunks = document.currentVersion?.chunks ?? [];
    return {
      score: scoreMatch({
        query: input.query, terms, docId: document.docId, title: document.title, fileName: document.fileName,
        summary: document.summary, tags, chunks: chunks.map((chunk) => chunk.content),
      }),
      documentId: document.id,
      versionId: document.currentVersion!.id,
      documentUid: document.documentUid,
      versionUid: document.currentVersion!.versionUid,
      docId: document.docId,
      title: document.title || document.fileName,
      categoryName: document.categoryName,
      confidentialityLevel: document.confidentialityLevel,
      tags: formalTags,
      candidateTags,
      evidence: chunks.map((chunk) => ({ chunkUid: chunk.chunkUid, quote: chunk.content, locator: JSON.parse(chunk.locatorJson) })),
    };
  }).sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  const selected = ranked.slice(0, input.limit);
  return {
    kind: "document-set" as const,
    query: input.query,
    totalCandidates: ranked.length,
    documents: selected,
    selection: selected.map((document) => ({ documentUid: document.documentUid, versionUid: document.versionUid })),
  };
}
