"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import FloatingPortalSurface from "../common/FloatingPortalSurface";
import {
  getAdaptiveControlWidthStyle,
  type AdaptiveControlWidthMode,
} from "./adaptive-control-width";
import {
  AUTOCOMPLETE_EMPTY_CLASS_NAME,
  AUTOCOMPLETE_INLINE_LIST_CLASS_NAME,
  AUTOCOMPLETE_LIST_BODY_CLASS_NAME,
  AUTOCOMPLETE_LIST_CLASS_NAME,
  getAutocompleteOptionClassName,
} from "./autocomplete-list-styles";
import { getAutocompleteOptionDisplay } from "./autocomplete-option-display";
import { CONTROL_SIZES, type ControlSize } from "../common/interactionTokens";
import FieldShell, { type FieldShellProps } from "./FieldShell";
import type { FieldControlSize } from "../form/FormStyles";

export type LifecycleScope = "active" | "all" | "archived";

export interface FkFieldOption {
  id: number;
  name: string;
  subtitle?: string;
  departmentId?: number | null;
  departmentPath?: string | null;
  lifecycleStatus?: "active" | "archived" | "inactive";
}

export type FkFieldInputAppearance = "field" | "toolbar" | "inline";

export interface FkFieldInputProps {
  fkKey: string;
  endpoint: string;
  value: string;
  displayValue?: string;
  onChange: (value: string, option?: FkFieldOption) => void;
  onCancel?: () => void;
  placeholder?: string;
  disabled?: boolean;
  lifecycleScope?: LifecycleScope;
  queryParams?: Record<string, string | number | boolean | null | undefined>;
  appearance?: FkFieldInputAppearance;
  size?: FieldControlSize;
  density?: FieldShellProps["density"];
  widthMode?: AdaptiveControlWidthMode;
  minChars?: number;
  maxChars?: number;
  visibleCount?: number;
  dropdownPresentation?: "popover" | "inline";
  autoFocus?: boolean;
  className?: string;
}

function getFkInputClassName(
  appearance: FkFieldInputAppearance,
  size: ControlSize,
  extra?: string,
): string {
  const tokens = CONTROL_SIZES[size];
  const sizeBase = [tokens.height, tokens.paddingX, tokens.radius].filter(Boolean).join(" ");
  switch (appearance) {
    case "toolbar":
      return [
        sizeBase,
        "min-w-0 border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500",
        tokens.text,
        extra,
      ].filter(Boolean).join(" ");
    case "inline":
      return [
        "min-w-0 border-b border-transparent bg-transparent px-1 py-0 text-sm text-slate-700 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-500 focus:outline-none disabled:text-slate-400",
        extra,
      ].filter(Boolean).join(" ");
    default:
      return [
        sizeBase,
        "w-full min-w-0 border border-slate-200 bg-white py-0 font-sans text-sm text-slate-800 shadow-sm tabular-nums placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500",
        extra,
      ].filter(Boolean).join(" ");
  }
}

const UNSTYLED_INPUT_CLASS_NAME =
  "h-full w-full min-w-0 border-0 bg-transparent p-0 text-sm leading-none text-current outline-none placeholder:text-slate-400 disabled:bg-transparent disabled:text-slate-500";

export default function FkFieldInput({
  fkKey,
  endpoint,
  value,
  displayValue,
  onChange,
  onCancel,
  placeholder = "输入搜索...",
  disabled,
  lifecycleScope = "active",
  queryParams,
  appearance = "field",
  size = "md",
  density = "normal",
  widthMode = appearance === "field" ? "fill" : "content",
  minChars = 12,
  maxChars = 32,
  visibleCount = 5,
  dropdownPresentation = "popover",
  autoFocus,
  className,
}: FkFieldInputProps) {
  const controlSize: ControlSize = size;
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<FkFieldOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<FkFieldOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const selectedOptionMatchesValue = selectedOption
    && (
      String(selectedOption.id) === value
      || selectedOption.name === value
      || selectedOption.name === displayValue
      || selectedOption.subtitle === value
      || selectedOption.subtitle === displayValue
    );
  const selectedOptionDisplay = selectedOptionMatchesValue
    ? getAutocompleteOptionDisplay(selectedOption.name, selectedOption.subtitle)
    : null;
  const selectedName = value ? selectedOptionDisplay?.primaryText || displayValue || value : "";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current
        && !containerRef.current.contains(target)
        && !panelRef.current?.contains(target)
      ) {
        setShowDropdown(false);
        setSearching(false);
        setKeyword("");
        onCancel?.();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
  useEffect(() => {
    if (!autoFocus || disabled || !inputRef.current) return;
    inputRef.current.focus({ preventScroll: true });
  }, [autoFocus, disabled]);

  const search = useCallback(
    async (q: string) => {
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      setLoading(true);
      try {
        const keyword = q.trim();
        const params = new URLSearchParams({
          fkKey,
          keyword,
          lifecycleScope,
        });
        for (const [key, item] of Object.entries(queryParams ?? {})) {
          if (item === null || item === undefined || item === "") continue;
          params.set(key, String(item));
        }
        const response = await fetch(workspacePath(`${endpoint}?${params.toString()}`));
        if (response.ok) {
          const data = (await response.json()) as { items?: FkFieldOption[] };
          if (requestSeqRef.current === requestSeq) setOptions((data.items || []).slice(0, visibleCount));
        } else {
          if (requestSeqRef.current === requestSeq) setOptions([]);
        }
      } finally {
        if (requestSeqRef.current === requestSeq) setLoading(false);
      }
    },
    [endpoint, fkKey, lifecycleScope, queryParams, visibleCount],
  );

  function handleInputChange(nextValue: string) {
    if (!nextValue && selectedName) {
      onChange("");
    }
    setKeyword(nextValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(nextValue), 250);
    setShowDropdown(true);
  }

  function handleSelect(option: FkFieldOption) {
    setSelectedOption(option);
    onChange(option.name, option);
    setKeyword("");
    setSearching(false);
    setOptions([]);
    setShowDropdown(false);
  }

  const display = searching ? keyword : selectedName;

  const widthStyle = getAdaptiveControlWidthStyle({
    mode: widthMode,
    text: display || placeholder,
    minChars,
    maxChars,
  });
  const containerClassName = widthMode === "fill"
    ? "relative w-full min-w-0"
    : "relative inline-block max-w-full align-middle";
  const isField = appearance === "field";
  const inputClassName = isField
    ? [UNSTYLED_INPUT_CLASS_NAME, className].filter(Boolean).join(" ")
    : getFkInputClassName(appearance, controlSize, className);
  const input = (
    <input
      ref={inputRef}
      type="text"
      value={display}
      onChange={(event) => {
        setSearching(true);
        handleInputChange(event.target.value);
      }}
      onFocus={() => {
        setSearching(true);
        setKeyword("");
        setShowDropdown(true);
        search("");
      }}
      disabled={disabled}
      title={selectedOptionDisplay?.hoverText}
      placeholder={selectedName || placeholder}
      className={inputClassName}
    />
  );
  const listContent = showDropdown && searching ? (
    <div className={AUTOCOMPLETE_LIST_BODY_CLASS_NAME}>
      {loading ? (
        <div className={AUTOCOMPLETE_EMPTY_CLASS_NAME}>搜索中...</div>
      ) : options.length === 0 ? (
        <div className={AUTOCOMPLETE_EMPTY_CLASS_NAME}>{keyword ? "无匹配结果" : "暂无可选项"}</div>
      ) : (
        options.map((option) => {
          const optionDisplay = getAutocompleteOptionDisplay(option.name, option.subtitle);
          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              title={optionDisplay.hoverText}
              className={getAutocompleteOptionClassName({
                selected: option.name === selectedName || String(option.id) === value,
              })}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate font-medium" title={optionDisplay.primaryText}>{optionDisplay.primaryText}</span>
            </button>
          );
        })
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={containerClassName} style={widthStyle}>
      {isField ? (
        <FieldShell disabled={disabled} size={size} density={density}>
          {input}
        </FieldShell>
      ) : (
        input
      )}
      {dropdownPresentation === "inline" && listContent ? (
        <div className={AUTOCOMPLETE_INLINE_LIST_CLASS_NAME}>{listContent}</div>
      ) : (
        <FloatingPortalSurface
          open={Boolean(listContent)}
          triggerRef={containerRef}
          surfaceRef={panelRef}
          matchTriggerWidth
          className={AUTOCOMPLETE_LIST_CLASS_NAME}
        >
          {listContent}
        </FloatingPortalSurface>
      )}
    </div>
  );
}
