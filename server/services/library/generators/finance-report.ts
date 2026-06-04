import type { GeneratorOutput } from "./types";

export async function generateFinanceReport(input: Record<string, unknown>): Promise<GeneratorOutput> {
  const title = typeof input.title === "string" ? input.title : "财务报表";
  const summary = typeof input.summary === "string" ? input.summary : undefined;

  const md = `# ${title}\n\n${summary ? summary + "\n\n" : ""}<!-- auto-generated -->\n`;

  return {
    fileName: `${slug(title)}.md`,
    title,
    summary,
    content: md,
    mimeType: "text/markdown",
    extension: "md",
  };
}

function slug(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w一-龥-]/g, "")
    .slice(0, 50);
}
