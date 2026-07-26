import { isValidElement, type ReactNode } from "react";

function collectText(value: ReactNode, parts: string[]) {
  if (typeof value === "string" || typeof value === "number") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, parts));
    return;
  }
  if (!isValidElement<{ children?: ReactNode }>(value)) return;
  collectText(value.props.children, parts);
}

/** Returns the complete plain-text label used by a visually truncated Core element. */
export function textOverflowTitle(value: ReactNode) {
  const parts: string[] = [];
  collectText(value, parts);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text || undefined;
}
