/**
 * Generator output — unified shape for all document generators.
 */
export interface GeneratorOutput {
  fileName: string;
  title: string;
  summary?: string;
  content: string | Buffer;
  mimeType: string;
  extension: string;
  identityKey?: string;
  asOfDate?: string;
  verifiedAt?: string;
  reviewStatus?: "approved";
}

/**
 * Generator function signature.
 */
export type GeneratorFn = (
  input: Record<string, unknown>,
) => Promise<GeneratorOutput | GeneratorOutput[]>;

/**
 * Registry entry for a registered generator.
 */
export interface GeneratorEntry {
  key: string;
  name: string;
  titleMode?: "custom" | "fixed";
  defaultTitle?: string;
  categoryCode?: string;
  categoryName?: string;
  generate: GeneratorFn;
}
