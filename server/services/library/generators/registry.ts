import type { GeneratorEntry } from "./types";
import { generateBpHtml } from "./bp-html";
import { generateFinanceReport } from "./finance-report";

const entries: GeneratorEntry[] = [
  { key: "bp-html", name: "BP HTML", generate: generateBpHtml },
  { key: "finance-report", name: "财务报表", generate: generateFinanceReport },
];

const map = new Map(entries.map((e) => [e.key, e]));

export function getGenerator(key: string): GeneratorEntry | undefined {
  return map.get(key);
}

export function listGenerators(): GeneratorEntry[] {
  return entries.slice();
}
