"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CONTROL_SIZES } from "./interactionTokens";
import type { ControlSize } from "./interactionTokens";
import type { LifecycleScope } from "./FkFieldInput";
import InputControl, { type InputFieldSpec } from "./InputControl";
import { PickerOptionButton } from "./PickerParts";
import type { SelectFieldOption } from "./SelectField";

export type FieldValueFilterValueKind = "text" | "fk";

export interface FieldValueFilterField extends SelectFieldOption {
  valueKind?: FieldValueFilterValueKind;
  fkKey?: string;
  fkReturnField?: "id" | "name";
  referenceEndpoint?: string;
  lifecycleScope?: LifecycleScope;
  placeholder?: string;
}

export interface FieldValueFilterProps {
  fields: FieldValueFilterField[];
  valueOptions: Record<string, SelectFieldOption[]>;
  fieldKey: string;
  onFieldKeyChange: (key: string) => void;
  value: string;
  onValueChange: (value: string, fieldKey?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  referenceEndpoint?: string;
  className?: string;
  style?: CSSProperties;
  size?: ControlSize;
}

const FLOATING_PANEL_MARGIN = 8;
const FLOATING_PANEL_GAP = 4;
const FLOATING_PANEL_MAX_WIDTH = 448;
const FLOATING_PANEL_MIN_HEIGHT = 160;

export default function FieldValueFilter({
  fields,
  valueOptions,
  fieldKey,
  onFieldKeyChange,
  value,
  onValueChange,
  placeholder = "选择筛选",
  disabled = false,
  referenceEndpoint,
  className,
  style,
  size = "md",
}: FieldValueFilterProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"field" | "value">("field");
  const [draftFieldKey, setDraftFieldKey] = useState(fieldKey);
  const [draftValue, setDraftValue] = useState(value);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedField = fields.find((field) => field.value === fieldKey);
  const currentOptions = valueOptions[fieldKey] ?? [];
  const selectedValue = currentOptions.find((option) => option.value === value);
  const draftField = fields.find((field) => field.value === draftFieldKey);
  const draftOptions = valueOptions[draftFieldKey] ?? [];
  const selectableDraftOptions = draftOptions.filter((option) => option.value !== "");
  const draftReferenceEndpoint = draftField?.referenceEndpoint ?? referenceEndpoint;
  const displayValue = useMemo(() => selectedValue?.label ?? (value || "全部"), [selectedValue, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const updatePanelPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const trigger = rootRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.max(0, Math.min(FLOATING_PANEL_MAX_WIDTH, viewportWidth - FLOATING_PANEL_MARGIN * 2));
    const measuredWidth = panelRef.current?.offsetWidth ?? triggerRect.width;
    const panelWidth = Math.min(Math.max(measuredWidth, triggerRect.width), maxWidth);
    const left = Math.min(
      Math.max(triggerRect.left, FLOATING_PANEL_MARGIN),
      Math.max(FLOATING_PANEL_MARGIN, viewportWidth - panelWidth - FLOATING_PANEL_MARGIN),
    );
    const spaceBelow = viewportHeight - triggerRect.bottom - FLOATING_PANEL_GAP - FLOATING_PANEL_MARGIN;
    const spaceAbove = triggerRect.top - FLOATING_PANEL_GAP - FLOATING_PANEL_MARGIN;
    const measuredHeight = panelRef.current?.offsetHeight ?? 0;
    const placeAbove = measuredHeight > spaceBelow && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      FLOATING_PANEL_MIN_HEIGHT,
      placeAbove ? spaceAbove : spaceBelow,
    );

    setPanelStyle({
      position: "fixed",
      left,
      top: placeAbove ? undefined : triggerRect.bottom + FLOATING_PANEL_GAP,
      bottom: placeAbove ? viewportHeight - triggerRect.top + FLOATING_PANEL_GAP : undefined,
      minWidth: triggerRect.width,
      maxWidth,
      maxHeight: availableHeight,
      zIndex: 60,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const animationFrame = window.requestAnimationFrame(updatePanelPosition);
    const panel = panelRef.current;
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePanelPosition)
      : null;
    if (panel) resizeObserver?.observe(panel);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, step, updatePanelPosition]);

  function selectField(nextKey: string) {
    setDraftFieldKey(nextKey);
    setDraftValue("");
    setStep("value");
  }

  function commitValue(nextValue: string, closeAfterCommit = draftOptions.length > 0) {
    setDraftValue(nextValue);
    onFieldKeyChange(draftFieldKey);
    onValueChange(nextValue, draftFieldKey);
    if (closeAfterCommit) {
      setOpen(false);
      setStep("field");
    }
  }

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        setDraftFieldKey(fieldKey);
        setDraftValue(value);
        setStep("field");
      }
      return next;
    });
  }

  const valuePlaceholder = draftField?.placeholder ?? (draftField?.label ? `搜索${draftField.label}` : "输入搜索...");
  const sizeTokens = CONTROL_SIZES[size];
  const valueInputSpec: InputFieldSpec = selectableDraftOptions.length > 0
    ? {
        valueType: "string",
        editor: "autocomplete",
        options: { source: "static", items: selectableDraftOptions, visibleCount: 6 },
      }
    : draftField?.valueKind === "fk" && draftField.fkKey && draftReferenceEndpoint
      ? {
          valueType: "reference",
          editor: "autocomplete",
          options: {
            source: "remote",
            fkKey: draftField.fkKey,
            endpoint: draftReferenceEndpoint,
            returnField: draftField.fkReturnField,
            lifecycleScope: draftField.lifecycleScope ?? "all",
            visibleCount: 5,
          },
        }
      : { valueType: "string", editor: "input" };
  const closeOnValueChange = valueInputSpec.editor !== "input";
  const panelContent = open && !disabled && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="w-max overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
        >
          {step === "field" ? (
            <div className="space-y-1.5">
              <div className={`${CONTROL_SIZES[size].text} font-semibold text-slate-400`}>字段</div>
              <div className="flex max-w-full flex-wrap gap-1.5">
                {fields.map((field) => (
                  <PickerOptionButton
                    key={field.value}
                    selected={field.value === draftFieldKey}
                    onClick={() => selectField(field.value)}
                    align="center"
                    size="compact"
                    className="min-h-8"
                  >
                    <span className="truncate">{field.label}</span>
                  </PickerOptionButton>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep("field")}
                  className={`${CONTROL_SIZES[size].text} font-semibold text-slate-400 hover:text-slate-700`}
                >
                  字段
                </button>
                <div className={`min-w-0 flex-1 text-right ${CONTROL_SIZES[size].text} font-semibold text-slate-400`}>
                  {draftField?.label ?? "值"}
                </div>
              </div>
              <div className="space-y-1.5">
                <PickerOptionButton
                  selected={draftValue === ""}
                  onClick={() => commitValue("", true)}
                  align="center"
                  size="compact"
                  className="min-h-8"
                >
                  全部
                </PickerOptionButton>
                <InputControl
                  spec={valueInputSpec}
                  value={draftValue}
                  placeholder={valuePlaceholder}
                  autocompletePresentation={valueInputSpec.editor === "autocomplete" ? "inline" : undefined}
                  onChange={(nextValue) => commitValue(String(nextValue ?? ""), closeOnValueChange)}
                />
              </div>
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <span ref={rootRef} style={style} className={`inline-block ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleOpen}
        className={`inline-flex ${sizeTokens.height} ${sizeTokens.minWidth} items-center gap-2 ${sizeTokens.paddingX} ${sizeTokens.radius} border border-slate-200 bg-white ${sizeTokens.text} font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`}
      >
        {selectedField ? (
          <>
            <span className="shrink-0 text-slate-400">{selectedField.label}</span>
            <span className="min-w-0 flex-1 truncate">{displayValue}</span>
          </>
        ) : (
          <span className="truncate">{placeholder}</span>
        )}
        <svg
          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {panelContent}
    </span>
  );
}
