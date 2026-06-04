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
}

/**
 * Generator function signature.
 */
export type GeneratorFn = (input: Record<string, unknown>) => Promise<GeneratorOutput>;

/**
 * Registry entry for a registered generator.
 */
export interface GeneratorEntry {
  key: string;
  name: string;
  generate: GeneratorFn;
}
