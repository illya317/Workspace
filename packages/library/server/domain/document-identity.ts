import { randomUUID } from "node:crypto";

export interface LibraryDocumentIdentity {
  documentUid: string;
  docId: string;
}

export function createLibraryDocumentIdentity(now = new Date()): LibraryDocumentIdentity {
  const documentUid = randomUUID();
  const year = now.getUTCFullYear();
  const suffix = documentUid.replace(/-/g, "").slice(0, 12).toUpperCase();
  return { documentUid, docId: `LIB-${year}-${suffix}` };
}
