export type CompanyPaperSection = {
  key: string;
  title: string;
  level: number;
  order: number;
  parentKey: string | null;
  summary: string;
  content: string;
};

type CompanyPaperKnowledge = {
  schemaVersion: 1;
  title: string;
  sections: CompanyPaperSection[];
};

function plainHeading(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function sectionKey(title: string, used: Map<string, number>) {
  const base = plainHeading(title)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "section";
  const count = (used.get(base) ?? 0) + 1;
  used.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function sectionSummary(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--.*?-->/gs, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function buildCompanyPaperKnowledge(markdown: string): CompanyPaperKnowledge {
  const source = markdown.replace(/^<!--.*?-->\s*/s, "");
  const lines = source.split(/\r?\n/);
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
  const headings = lines.flatMap((line, lineIndex) => {
    const match = headingPattern.exec(line);
    return match ? [{ lineIndex, level: match[1]!.length, title: plainHeading(match[2]!) }] : [];
  });
  const title = headings.find((heading) => heading.level === 1)?.title || "Untitled document";
  const sectionHeadings = headings.filter((heading) => heading.level >= 2);
  const usedKeys = new Map<string, number>();
  const parentStack: Array<{ level: number; key: string }> = [];
  const sections = sectionHeadings.map((heading, index) => {
    while (parentStack.length && parentStack[parentStack.length - 1]!.level >= heading.level) parentStack.pop();
    const key = sectionKey(heading.title, usedKeys);
    const next = sectionHeadings[index + 1];
    const content = lines.slice(heading.lineIndex + 1, next?.lineIndex ?? lines.length).join("\n").trim();
    const section: CompanyPaperSection = {
      key,
      title: heading.title,
      level: heading.level,
      order: index + 1,
      parentKey: parentStack[parentStack.length - 1]?.key ?? null,
      summary: sectionSummary(content),
      content,
    };
    parentStack.push({ level: heading.level, key });
    return section;
  });
  return { schemaVersion: 1, title, sections };
}

export function companyPaperSectionCatalog(knowledge: CompanyPaperKnowledge) {
  return knowledge.sections.map(({ content: _content, ...section }) => section);
}

export function searchCompanyPaperKnowledge(
  knowledge: CompanyPaperKnowledge,
  query: string,
  offset: number,
  limit: number,
) {
  const normalized = query.trim().toLocaleLowerCase();
  const all = knowledge.sections.filter((section) => (
    `${section.title}\n${section.content}`.toLocaleLowerCase().includes(normalized)
  ));
  return {
    total: all.length,
    offset,
    limit,
    items: all.slice(offset, offset + limit).map(({ content: _content, ...section }) => section),
  };
}
