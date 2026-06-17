import {
  asRecord,
  asString,
  type LayoutParams,
} from "./layout-block-utils";
import type { QcLayoutPart } from "./types";

export function paramScope(raw: Record<string, unknown>, params: LayoutParams) {
  const path = asString(raw.params_path || raw.paramsPath);
  return path ? { ...params, ...asRecord(params[path]) } : params;
}

function formatTemplateKeepParams(text: string, params: LayoutParams) {
  return text.replace(/\[([^\]]*\{([\w.-]+)\}[^\]]*)\]/g, (match, body, key) => params[key] == null || params[key] === "" ? "" : body);
}

function fieldPart(label: string): QcLayoutPart {
  const match = label.match(/^(.+?)（(.+)）$/);
  return { type: "line", field: match?.[1] || label, placeholder: match?.[2], width: "6.5rem", underline: true };
}

function blankPart(fieldKey: string, blank: string): QcLayoutPart {
  const width = `${Math.max(3.5, Math.min(12, blank.length * 0.9))}em`;
  return { type: "line", fieldKey, width, underline: true };
}

const INLINE_TOKEN_RE = /\{FIELD:([^}]+)\}|\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}|[_＿]{2,}/g;

function literalPart(text: string, mode: "text" | "param", name?: string): QcLayoutPart | null {
  if (!text) return null;
  return mode === "param"
    ? { type: "param", name, defaultValue: text }
    : { type: "text", text };
}

function inlineParts(
  text: string,
  params: LayoutParams,
  keyPrefix: string,
  literalMode: "text" | "param" = "text",
  paramName?: string,
): QcLayoutPart[] {
  const parts: QcLayoutPart[] = [];
  let cursor = 0;
  let blankIndex = 0;
  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    if (match.index && match.index > cursor) {
      const literal = literalPart(text.slice(cursor, match.index), literalMode, paramName);
      if (literal) parts.push(literal);
    }
    if (match[1]) {
      parts.push(fieldPart(match[1]));
    } else if (match[2] || match[3]) {
      const key = match[2] || match[3];
      const value = params[key];
      if (value == null || typeof value === "object") {
        parts.push({ type: "param", name: key });
      } else {
        parts.push(...inlineParts(String(value), params, `${keyPrefix}/${key}`, "param", key));
      }
    } else {
      blankIndex += 1;
      parts.push(blankPart(`${keyPrefix}/blank_${blankIndex}`, match[0]));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    const literal = literalPart(text.slice(cursor), literalMode, paramName);
    if (literal) parts.push(literal);
  }
  return parts;
}

export function textParts(template: string, params: LayoutParams, keyPrefix = "layout/operation"): QcLayoutPart[] {
  const text = formatTemplateKeepParams(template, params);
  return inlineParts(text, params, keyPrefix, "text");
}
