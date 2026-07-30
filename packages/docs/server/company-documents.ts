import "server-only";

import {
  listTenantCompanyDocumentMetadata,
  readTenantCompanyDocumentSource,
  type TenantCompanyDocumentMetadata,
} from "@workspace/platform/server/company-documents";

import {
  COMPANY_DOCUMENTS_UI_PATH,
  companyDocumentStructuredPath,
  type CompanyDocumentItem,
} from "../company-documents";
import {
  buildCompanyPaperKnowledge,
  companyPaperSectionCatalog,
  searchCompanyPaperKnowledge,
} from "../internal/company-document-knowledge";

function documentItem(
  metadata: TenantCompanyDocumentMetadata,
  markdown: string | null,
): CompanyDocumentItem {
  return {
    ...metadata,
    markdown,
  };
}

export async function listCompanyDocuments(): Promise<CompanyDocumentItem[]> {
  const documents = await listTenantCompanyDocumentMetadata();
  return Promise.all(documents.map(async (document) => {
    if (document.format !== "paper") return documentItem(document, null);
    const source = await readTenantCompanyDocumentSource(document.key);
    return documentItem(source, new TextDecoder().decode(source.content));
  }));
}

export async function listCompanyDocumentCatalog() {
  const documents = (await listTenantCompanyDocumentMetadata()).map((document) => ({
    key: document.key,
    title: document.title,
    description: document.description,
    format: document.format,
    fileName: document.fileName,
    fileSizeBytes: document.fileSizeBytes,
    updatedAt: document.updatedAt,
    uiPath: COMPANY_DOCUMENTS_UI_PATH,
    structuredPath: document.format === "paper" ? companyDocumentStructuredPath(document.key) : null,
  }));
  return {
    schemaVersion: 1,
    guidance: "Start here. Select the narrowest relevant paper document, fetch its section catalog, then request one section or search by q. Do not load every document into model context.",
    documents,
  };
}

export async function queryCompanyPaperDocument(
  documentKey: string,
  query: { section?: string; q?: string; offset: number; limit: number },
) {
  try {
    const source = await readTenantCompanyDocumentSource(documentKey);
    if (source.format !== "paper") {
      return { status: 400, body: { error: "Structured lookup is available only for paper documents" } };
    }
    const knowledge = buildCompanyPaperKnowledge(new TextDecoder().decode(source.content));
    const document = {
      key: source.key,
      title: source.title,
      description: source.description,
      updatedAt: source.updatedAt,
      uiPath: COMPANY_DOCUMENTS_UI_PATH,
    };
    if (query.section) {
      const section = knowledge.sections.find((item) => item.key === query.section);
      if (!section) {
        return {
          status: 404,
          body: { error: "Document section not found", document, sections: companyPaperSectionCatalog(knowledge) },
        };
      }
      return { status: 200, body: { schemaVersion: 1, document, section } };
    }
    if (query.q) {
      return {
        status: 200,
        body: {
          schemaVersion: 1,
          document,
          query: query.q,
          results: searchCompanyPaperKnowledge(knowledge, query.q, query.offset, query.limit),
        },
      };
    }
    return {
      status: 200,
      body: {
        schemaVersion: 1,
        document,
        guidance: "Choose a returned section key and call this path with ?section=<key>, or search summaries with ?q=<term>. The default response intentionally omits full content.",
        sections: companyPaperSectionCatalog(knowledge),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Company document unavailable";
    return {
      status: message === "Company document not found" ? 404 : 503,
      body: { error: message === "Company document not found" ? message : "Company document unavailable" },
    };
  }
}
