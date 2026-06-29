"use client";

import { useState } from "react";
import TextField, { type TextFieldProps } from "./TextField";
import type { InputMask } from "./InputControlTypes";

export type SegmentedCodeInputEditableSegment = Extract<InputMask, { kind: "editableSegment" }>;

export interface SegmentedCodeInputProps {
  value: string;
  editableSegment: SegmentedCodeInputEditableSegment;
  disabled?: boolean;
  className?: string;
  size?: TextFieldProps["size"];
  density?: TextFieldProps["density"];
  onBlur?: TextFieldProps["onBlur"];
  onFocus?: TextFieldProps["onFocus"];
  onChange: (fullCode: string) => void;
}

export default function SegmentedCodeInput({
  value,
  editableSegment,
  disabled,
  className,
  size,
  density,
  onBlur,
  onFocus,
  onChange,
}: SegmentedCodeInputProps) {
  const [focused, setFocused] = useState(false);
  const [segment, setSegment] = useState(() => editableSegment.extract(value));

  function normalizeSegment(next: string) {
    return editableSegment.normalize ? editableSegment.normalize(next) : next;
  }

  const handleFocus: TextFieldProps["onFocus"] = (event) => {
    setSegment(editableSegment.extract(value));
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: TextFieldProps["onBlur"] = (event) => {
    setFocused(false);
    const nextCode = editableSegment.compose(normalizeSegment(segment), value);
    if (nextCode !== value) onChange(nextCode);
    onBlur?.(event);
  };

  const displayValue = focused ? segment : value;

  return (
    <TextField
      value={displayValue}
      disabled={disabled}
      placeholder={editableSegment.placeholder}
      onChange={(next) => setSegment(normalizeSegment(next))}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      size={size}
      density={density}
    />
  );
}
