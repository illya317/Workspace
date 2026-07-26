"use client";

import { useEffect, useState } from "react";
import FieldShell from "./FieldShell";
import { useFieldContext } from "./field-context";
import {
  normalizeTimeTextPart,
  parseTimeValue,
  updateTimeDraftPart,
} from "./time-field-value";
import type { TimePartName } from "./time-field-value";

export interface TimeFieldProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
}

function TimePart({
  label,
  value,
  max,
  disabled,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  disabled?: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      readOnly={readOnly}
      value={editing ? draft : value}
      placeholder="00"
      aria-label={label}
      onFocus={(event) => {
        setDraft(value);
        setEditing(true);
        event.currentTarget.select();
      }}
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        const next = normalizeTimeTextPart(event.target.value, max);
        setDraft(next);
        onChange(next);
      }}
      className="w-8 bg-transparent text-center font-mono text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300 disabled:text-slate-500"
    />
  );
}

export default function TimeField({
  value,
  onChange,
  disabled,
  readOnly,
  className,
}: TimeFieldProps) {
  const parsedValue = parseTimeValue(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(parsedValue);
  const fieldContext = useFieldContext();

  useEffect(() => {
    if (!editing) setDraft(parseTimeValue(value));
  }, [editing, value]);

  function commit(part: TimePartName, nextValue: string) {
    const next = updateTimeDraftPart(draft, part, nextValue);
    setDraft(next.draft);
    onChange(next.value);
  }

  const displayedValue = editing ? draft : parsedValue;

  return (
    <FieldShell
      disabled={disabled}
      readOnly={readOnly}
      size={fieldContext?.size}
      density={fieldContext?.density}
      className={`flex items-center justify-center gap-1 px-2 tabular-nums ${className ?? ""}`}
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDraft(parsedValue);
          setEditing(true);
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setEditing(false);
      }}
    >
      <TimePart
        label="小时"
        value={displayedValue.hour}
        max={23}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(next) => commit("hour", next)}
      />
      <span className="font-mono text-sm font-semibold text-slate-400">:</span>
      <TimePart
        label="分钟"
        value={displayedValue.minute}
        max={59}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(next) => commit("minute", next)}
      />
    </FieldShell>
  );
}
