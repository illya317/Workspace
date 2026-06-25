"use client";

import type { ReactNode } from "react";
import { CalendarDateInput, FormField, SectionCard, SelectField, TextField, TimeField } from "@workspace/core/ui";
import type { MeetingDetail } from "./meeting-types";
import { statusLabel } from "./meeting-utils";

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return <SectionCard title={title} className="min-w-0">
      <div className="space-y-3">{children}</div>
    </SectionCard>;
}

export function InlineForm({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-3">{children}</div>;
}

export function InputBox({
  label,
  value,
  onChange,
  kind = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind?: "text" | "number" | "date" | "datetime";
  className?: string;
}) {
  const dateTime = splitDateTimeValue(value);
  return <FormField label={label} className={className}>
      {kind === "date" ? <CalendarDateInput value={value} onChange={next => onChange(next ?? "")} className="w-full" /> : kind === "datetime" ? <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
          <CalendarDateInput value={dateTime.date} onChange={date => onChange(combineDateTimeValue(date, dateTime.time))} className="w-full" />
          <TimeField value={dateTime.time} onChange={time => onChange(combineDateTimeValue(dateTime.date, time))} className="w-full" />
        </div> : <TextField type={kind === "number" ? "number" : "text"} value={value} onChange={onChange} className="w-full" />}
    </FormField>;
}

function splitDateTimeValue(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  return {
    date: match?.[1] ?? "",
    time: match?.[2] ?? "",
  };
}

function combineDateTimeValue(date: string | null, time: string | null) {
  if (!date) return "";
  return `${date}T${time || "09:00"}`;
}

export function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  return <FormField label={label} className="min-w-0">
      <SelectField value={value} options={options} onChange={onChange} className="w-full" triggerClassName="w-full" searchable={options.length > 6} />
    </FormField>;
}

export function AgendaSelect({
  meeting,
  value,
  onChange,
}: {
  meeting: MeetingDetail;
  value: string;
  onChange: (value: string) => void;
}) {
  return <SelectBox label="关联议题" value={value} options={[{
    value: "",
    label: "不关联",
  }, ...meeting.agendaItems.map(item => ({
    value: String(item.id),
    label: item.title,
  }))]} onChange={onChange} />;
}

export function DecisionSelect({
  meeting,
  value,
  onChange,
}: {
  meeting: MeetingDetail;
  value: string;
  onChange: (value: string) => void;
}) {
  return <SelectBox label="关联决议" value={value} options={[{
    value: "",
    label: "不关联",
  }, ...meeting.decisions.map(item => ({
    value: String(item.id),
    label: item.title,
  }))]} onChange={onChange} />;
}

export function SimpleList({
  items,
  emptyText,
}: {
  items: Array<{
    id: number;
    title: string;
    meta?: string | null;
  }>;
  emptyText: string;
}) {
  if (items.length === 0) return <EmptyLine text={emptyText} />;
  return <div className="space-y-2">
      {items.map(item => <div key={item.id} className="rounded-md border border-slate-100 px-3 py-2">
          <div className="text-sm font-medium text-slate-800">{item.title}</div>
          {item.meta && <div className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{item.meta}</div>}
        </div>)}
    </div>;
}

export function EmptyLine({
  text,
}: {
  text: string;
}) {
  return <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">{text}</div>;
}

export function StatusPill({
  status,
}: {
  status: string;
}) {
  const className = status === "closed" ? "bg-slate-100 text-slate-600" : status === "in_progress" ? "bg-sky-50 text-sky-700" : status === "passed" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
  return <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${className}`}>{statusLabel(status)}</span>;
}
