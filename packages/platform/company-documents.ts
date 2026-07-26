export type CompanyDocumentItem = {
  key: string;
  title: string;
  description: string;
  format: "office" | "paper";
  fileName: string;
  fileSizeBytes: number;
  updatedAt: string;
  markdown: string | null;
};
