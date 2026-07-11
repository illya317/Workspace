export interface AutocompleteOptionDisplay {
  primaryText: string;
  hoverText: string | undefined;
}

export function getAutocompleteOptionDisplay(
  primaryText: string,
  details?: string | null,
): AutocompleteOptionDisplay {
  const primary = primaryText.trim();
  const detail = details?.trim();
  const hoverText = [primary, detail]
    .filter((item, index, list): item is string => Boolean(item) && list.indexOf(item) === index)
    .join(" / ");
  return {
    primaryText: primary,
    hoverText: hoverText || undefined,
  };
}
