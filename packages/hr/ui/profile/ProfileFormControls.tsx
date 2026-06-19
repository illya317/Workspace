"use client";

import { useMemo, useState, type ReactNode } from "react";
import EntitySearchInput, { type SearchOption } from "../components/EntitySearchInput";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import {
  SectionCard,
  TextField,
  TextareaField,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
  getTagInputShellClassName,
  getTagPillClassName,
} from "@workspace/core/ui";
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
      className={getTagInputShellClassName()}
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className={getTagPillClassName()}
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
        <TextField
          value={draft}
          onChange={setDraft}
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
          unstyled
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
        className={getReadOnlyFieldClassName()}
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
        fkKey={field.fkKey}
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
      <TextareaField
        disabled={disabled}
        value={normalizeInputValue(value)}
        onChange={(next) => onChange(field.key, next || null)}
        rows={3}
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
        className={getFieldInputClassName()}
      />
    );
  }

  if (field.type === "phone") {
    return (
      <TextField
        disabled={disabled}
        type="tel"
        value={formatPhoneNumber(value)}
        onChange={(next) => onChange(field.key, normalizePhoneValue(next))}
        inputMode="tel"
      />
    );
  }

  if (field.type === "percent") {
    return (
      <div className={getFieldInputClassName("flex overflow-hidden px-0 py-0 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500")}>
        <TextField
          disabled={disabled}
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={toPercentDisplay(value)}
          onChange={(next) => onChange(field.key, fromPercentDisplay(next))}
          unstyled
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
        <span className="grid w-10 place-items-center border-l border-slate-200 bg-slate-50 text-slate-500">%</span>
      </div>
    );
  }

  if (field.type === "chineseId") {
    return (
      <TextField
        disabled={disabled}
        type="text"
        value={normalizeChineseIdNumber(value) ?? ""}
        onChange={(next) => onChange(field.key, normalizeChineseIdNumber(next)?.slice(0, 18) ?? null)}
        inputMode="text"
        maxLength={18}
      />
    );
  }

  return (
    <TextField
      disabled={disabled}
      type={field.type === "number" ? "number" : "text"}
      value={normalizeInputValue(value)}
      onChange={(raw) => {
        onChange(field.key, field.type === "number" ? (raw ? Number(raw) : null) : raw || null);
      }}
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
    <SectionCard
      title={(
        <div>
          <div>{title}</div>
          {status && <div className="mt-2">{status}</div>}
        </div>
      )}
      subtitle={subtitle}
      actions={actions && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>}
      bodyClassName="p-5"
    >
      {children}
    </SectionCard>
  );
}
