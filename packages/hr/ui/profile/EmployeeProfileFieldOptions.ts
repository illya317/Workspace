import {
  HR_MAJOR_OPTIONS,
  HR_PROFESSIONAL_TITLE_GROUPS,
  normalizeProfessionalTitle,
} from "@workspace/hr/constants/field-options";
import { HR_SCHOOL_OPTIONS } from "@workspace/hr/constants/school-options";
import type { InputOption } from "@workspace/core/ui";

export function readAliasTags(value: unknown) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? normalizeAliasTags(parsed) : [];
  } catch {
    return splitDraftTags(String(value));
  }
}

function splitDraftTags(value: string) {
  return normalizeAliasTags(value.split(/[,，、;；\n]+/));
}

function normalizeAliasTags(tags: unknown[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of tags) {
    const tag = String(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

export function serializeAliasTags(tags: unknown[]) {
  const normalized = normalizeAliasTags(tags);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function majorOptions(): InputOption[] {
  return HR_MAJOR_OPTIONS.map((option) => ({
    value: option.specialty,
    label: option.specialty,
    subtitle: option.category,
    searchText: option.category,
  }));
}

export function schoolOptions(): InputOption[] {
  return HR_SCHOOL_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    searchText: "aliases" in option && Array.isArray(option.aliases) ? option.aliases.join(" ") : "",
  }));
}

export function professionalTitleGroups() {
  return HR_PROFESSIONAL_TITLE_GROUPS.map((group) => ({
    key: group.series,
    label: group.series,
    options: group.levels.map((item) => ({
      value: item.title,
      label: item.title,
      description: item.level,
    })),
  }));
}

export function rankGroups(options: string[]) {
  const grouped = new Map<string, string[]>();
  for (const option of options) {
    const match = option.match(/^([MPT])(\d+)$/);
    if (!match) continue;
    const list = grouped.get(match[1]) ?? [];
    list.push(match[2]);
    grouped.set(match[1], list);
  }
  return ["M", "P", "T"]
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      label: key,
      options: [...(grouped.get(key) ?? [])]
        .sort((a, b) => Number(a) - Number(b))
        .map((level) => ({ value: `${key}${level}`, label: `${key}${level}` })),
    }));
}

export function normalizeRank(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

export { normalizeProfessionalTitle };
