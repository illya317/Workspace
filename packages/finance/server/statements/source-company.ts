function normalizedCompany(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\s:：.．]/g, "")
    .replace(/(有限责任公司|股份有限公司|有限公司)$/g, "")
    .toLocaleLowerCase("zh-CN");
}

export function matchesStatementSourceCompany(parsedName: string, names: Array<string | null>) {
  const parsed = normalizedCompany(parsedName);
  return Boolean(parsed) && names.some((name) => {
    const candidate = normalizedCompany(name ?? "");
    return Boolean(candidate) && (parsed.includes(candidate) || candidate.includes(parsed));
  });
}
