"use client";

import { useState } from "react";
import InputControl from "./InputControl";

export interface SegmentedCodeInputEditableSegment {
  extract: (fullCode: string) => string;
  compose: (segment: string, fullCode: string) => string;
  normalize?: (segment: string) => string;
  placeholder?: string;
}

export interface SegmentedCodeInputProps {
  value: string;
  editableSegment: SegmentedCodeInputEditableSegment;
  disabled?: boolean;
  className?: string;
  onChange: (fullCode: string) => void;
}

export default function SegmentedCodeInput({
  value,
  editableSegment,
  disabled,
  className,
  onChange,
}: SegmentedCodeInputProps) {
  const [focused, setFocused] = useState(false);
  const [segment, setSegment] = useState(() => editableSegment.extract(value));

  function normalizeSegment(next: string) {
    return editableSegment.normalize ? editableSegment.normalize(next) : next;
  }

  function handleFocus() {
    setSegment(editableSegment.extract(value));
    setFocused(true);
  }

  function handleBlur() {
    setFocused(false);
    const nextCode = editableSegment.compose(normalizeSegment(segment), value);
    if (nextCode !== value) onChange(nextCode);
  }

  const displayValue = focused ? segment : value;

  return (
    <InputControl
      spec={{ valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }}
      value={displayValue}
      placeholder={editableSegment.placeholder}
      onChange={(next) => setSegment(normalizeSegment(String(next ?? "")))}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
    />
  );
}
