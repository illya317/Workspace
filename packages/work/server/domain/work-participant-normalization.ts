export function parseParticipants(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/,|，/)
    .map((name) => name.trim())
    .filter(Boolean);
}
