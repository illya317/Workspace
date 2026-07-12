const LIBRARY_TAG_ALIASES = new Map<string, string>([
  ["合同协议", "合同"],
]);

export function canonicalizeLibraryTagName(value: string) {
  const normalized = value.normalize("NFKC").trim();
  return LIBRARY_TAG_ALIASES.get(normalized) || normalized;
}

export function canonicalizeLibraryTagNames(values: string[]) {
  const tags = new Map<string, string>();
  for (const value of values) {
    const name = canonicalizeLibraryTagName(value);
    const key = name.toLocaleLowerCase("zh-CN");
    if (key) tags.set(key, name);
  }
  return [...tags.values()];
}
