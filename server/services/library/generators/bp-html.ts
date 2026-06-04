import type { GeneratorOutput } from "./types";

export async function generateBpHtml(input: Record<string, unknown>): Promise<GeneratorOutput> {
  const title = typeof input.title === "string" ? input.title : "商业计划书";
  const summary = typeof input.summary === "string" ? input.summary : undefined;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body>
<h1>${escapeHtml(title)}</h1>
${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
<p><!-- auto-generated --></p>
</body>
</html>`;

  return {
    fileName: `${slug(title)}.html`,
    title,
    summary,
    content: html,
    mimeType: "text/html",
    extension: "html",
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slug(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w一-龥-]/g, "")
    .slice(0, 50);
}
