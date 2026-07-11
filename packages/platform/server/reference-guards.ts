import {
  formatReferenceBlockMessage,
  type ReferenceBlock,
} from "./fk-registry";

export interface ReferenceCount {
  label: string;
  count: () => Promise<number>;
}

export async function guardActiveReferences(
  actionLabel: string,
  references: ReferenceCount[],
) {
  const counts = await Promise.all(references.map((reference) => reference.count()));
  const blocks: ReferenceBlock[] = references.map((reference, index) => ({
    label: reference.label,
    count: counts[index] ?? 0,
  }));
  return formatReferenceBlockMessage(actionLabel, blocks);
}
