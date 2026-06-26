"use client";

import { useState } from "react";
import { InputControl } from "@workspace/core/ui";

export interface SegmentedCodeInputEditableSegment {
  /** 从完整编码中提取可编辑片段 */
  extract: (fullCode: string) => string;
  /** 把编辑后的片段拼回完整编码 */
  compose: (segment: string, fullCode: string) => string;
  /** 输入时归一化（限制字符、长度等） */
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

/**
 * 分段编码输入。
 *
 * 平时显示完整编码，聚焦后只保留可编辑片段，失焦后再拼回完整编码。
 * 适用于“编码由固定前缀 + 可变序号”组成的场景，例如岗位编码、部门编码等。
 */
export default function SegmentedCodeInput({
  value,
  editableSegment,
  disabled,
  className,
  onChange,
}: SegmentedCodeInputProps) {
  const [focused, setFocused] = useState(false);
  const [segment, setSegment] = useState(() => editableSegment.extract(value));

  function handleFocus() {
    setSegment(editableSegment.extract(value));
    setFocused(true);
  }

  function handleBlur() {
    setFocused(false);
    const normalized = editableSegment.normalize ? editableSegment.normalize(segment) : segment;
    const nextCode = editableSegment.compose(normalized, value);
    if (nextCode !== value) onChange(nextCode);
  }

  function handleChange(next: string) {
    const normalized = editableSegment.normalize ? editableSegment.normalize(next) : next;
    setSegment(normalized);
  }

  const displayValue = focused ? segment : value;

  return (
    <InputControl
      spec={{ valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }}
      value={displayValue}
      placeholder={editableSegment.placeholder}
      onChange={(next) => handleChange(String(next ?? ""))}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
    />
  );
}
