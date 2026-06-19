"use client";

import { useMemo, useState, type ReactNode } from "react";
import EntitySearchInput, { type SearchOption } from "../components/EntitySearchInput";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import EthnicityPicker from "../components/EthnicityPicker";
import MajorPicker from "../components/MajorPicker";
import OptionPicker from "../components/OptionPicker";
import ProfessionalTitlePicker from "../components/ProfessionalTitlePicker";
import RankPicker from "../components/RankPicker";
import SchoolPicker from "../components/SchoolPicker";
import type { ProfileField } from "@workspace/hr/types";
import { solarToLunarBirthday } from "./lunar-birthday";
import { formatPhoneNumber, normalizeChineseIdNumber, normalizePhoneValue } from "@workspace/hr/utils/identity";

interface FieldInputProps {
  field: ProfileField;
  value: unknown;
  displayValue?: string | null;
  disabled?: boolean;
  onChange: (key: string, value: unknown, option?: SearchOption) => void;
}

function normalizeInputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toPercentDisplay(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return String(Number((parsed * 100).toFixed(4)));
}

function fromPercentDisplay(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return String(parsed / 100);
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

function readAliasTags(value: unknown) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? normalizeAliasTags(parsed) : [];
  } catch {
    return [];
  }
}

function splitDraftTags(value: string) {
  return normalizeAliasTags(value.split(/[,，、;；\n]+/));
}

function serializeAliasTags(tags: unknown[]) {
  const normalized = normalizeAliasTags(tags);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function AliasTagsInput({
  field,
  value,
  disabled,
  onChange,
}: FieldInputProps) {
  const [draft, setDraft] = useState("");
  const tags = useMemo(() => readAliasTags(value), [value]);

  function commitDraft() {
    const nextTags = splitDraftTags(draft);
    if (nextTags.length === 0) return;
    onChange(field.key, serializeAliasTags([...tags, ...nextTags]));
    setDraft("");
  }

  function removeTag(index: number) {
    onChange(field.key, serializeAliasTags(tags.filter((_, tagIndex) => tagIndex !== index)));
  }

  return (
    <div
      className="flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 shadow-sm focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400 disabled:bg-slate-100"
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm"
        >
          <span className="truncate">{tag}</span>
          {!disabled && (
            <button
              type="button"
              aria-label={`删除别名 ${tag}`}
              onClick={() => removeTag(index)}
              className="grid size-4 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {disabled ? (
        tags.length === 0 ? <span className="text-slate-400">未设置</span> : null
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === "，" || event.key === "、") {
              if (draft.trim()) {
                event.preventDefault();
                commitDraft();
              }
            }
            if (event.key === "Backspace" && !draft && tags.length > 0) {
              removeTag(tags.length - 1);
            }
          }}
          placeholder={tags.length === 0 ? "添加别名" : ""}
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      )}
    </div>
  );
}

export function ProfileFieldInput({
  field,
  value,
  displayValue,
  disabled,
  onChange,
}: FieldInputProps) {
  if (field.type === "lunarBirthday") {
    return (
      <div
        aria-readonly="true"
        className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-500 shadow-sm"
      >
        {solarToLunarBirthday(value) || <span className="text-slate-400">未设置</span>}
      </div>
    );
  }

  if (field.type === "tags") {
    return (
      <AliasTagsInput
        field={field}
        value={value}
        displayValue={displayValue}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (field.type === "major") {
    return (
      <MajorPicker
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "school") {
    return (
      <SchoolPicker
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "professionalTitle") {
    return (
      <ProfessionalTitlePicker
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "boolean") {
    const labels = field.booleanLabels ?? { true: "是", false: "否", unset: "未设置" };
    return (
      <OptionPicker
        disabled={disabled}
        value={value === true ? "true" : value === false ? "false" : null}
        options={[
          { label: labels.true, value: "true" },
          { label: labels.false, value: "false" },
        ]}
        placeholder={labels.unset ?? "未设置"}
        onChange={(next) => {
          onChange(field.key, next === null ? null : next === "true");
        }}
      />
    );
  }

  if (field.type === "fk" && field.entity) {
    const display = displayValue || (field.valueFrom === "name" ? normalizeInputValue(value) : undefined);
    return (
      <EntitySearchInput
        entity={field.entity}
        value={value == null ? "" : String(value)}
        displayValue={display}
        disabled={disabled}
        activeOnly={field.activeOnly}
        placeholder={`搜索${field.label}`}
        onChange={(_label, option) => {
          const next =
            field.valueFrom === "name"
              ? option?.name
              : field.valueFrom === "subtitle"
                ? option?.subtitle
                : option?.id;
          onChange(field.key, next ?? null, option);
        }}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        disabled={disabled}
        value={normalizeInputValue(value)}
        onChange={(event) => onChange(field.key, event.target.value || null)}
        rows={3}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
      />
    );
  }

  if (field.type === "select") {
    if (field.key === "ethnicity") {
      return (
        <EthnicityPicker
          disabled={disabled}
          value={value}
          onChange={(next) => onChange(field.key, next)}
        />
      );
    }

    if (field.key === "rank") {
      return (
        <RankPicker
          disabled={disabled}
          value={value}
          options={field.options || []}
          onChange={(next) => onChange(field.key, next)}
        />
      );
    }

    return (
      <OptionPicker
        disabled={disabled}
        value={normalizeInputValue(value)}
        options={(field.options || []).map((option) => ({ label: option, value: option }))}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <CalendarDateInput
        disabled={disabled}
        value={normalizeInputValue(value)}
        onChange={(next) => onChange(field.key, next)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
      />
    );
  }

  if (field.type === "phone") {
    return (
      <input
        disabled={disabled}
        type="tel"
        value={formatPhoneNumber(value)}
        onChange={(event) => onChange(field.key, normalizePhoneValue(event.target.value))}
        inputMode="tel"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
      />
    );
  }

  if (field.type === "percent") {
    return (
      <div className="flex w-full overflow-hidden rounded-md border border-slate-300 bg-white text-sm text-slate-800 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
        <input
          disabled={disabled}
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={toPercentDisplay(value)}
          onChange={(event) => onChange(field.key, fromPercentDisplay(event.target.value))}
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
        <span className="grid w-10 place-items-center border-l border-slate-200 bg-slate-50 text-slate-500">%</span>
      </div>
    );
  }

  if (field.type === "chineseId") {
    return (
      <input
        disabled={disabled}
        type="text"
        value={normalizeChineseIdNumber(value) ?? ""}
        onChange={(event) => onChange(field.key, normalizeChineseIdNumber(event.target.value)?.slice(0, 18) ?? null)}
        inputMode="text"
        maxLength={18}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
      />
    );
  }

  return (
    <input
      disabled={disabled}
      type={field.type === "number" ? "number" : "text"}
      value={normalizeInputValue(value)}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(field.key, field.type === "number" ? (raw ? Number(raw) : null) : raw || null);
      }}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
    />
  );
}

export function SectionShell({
  title,
  subtitle,
  status,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          {status && <div className="mt-2">{status}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
