"use client";

import { useCallback, useMemo, useState } from "react";
import type { EditorDocument, FieldModel } from "@workspace/platform/document-editor";
import {
  computeQcRuntimeValues,
  initialQcRuntimeValues,
  type QcRuntimeValues,
} from "@workspace/production/qc/runtime-values";

export type EditorRuntimeValues = QcRuntimeValues;

export function useEditorRuntimeFormulaEngine(fieldModel: FieldModel, document: EditorDocument, saved: EditorRuntimeValues = {}) {
  const [manualValues, setManualValues] = useState(() => initialQcRuntimeValues(fieldModel, document, saved));
  const values = useMemo(
    () => computeQcRuntimeValues(fieldModel, document, manualValues).values,
    [document, fieldModel, manualValues],
  );
  const setValue = useCallback((key: string, value: string) => {
    setManualValues((current) => current[key] === value ? current : { ...current, [key]: value });
  }, []);
  return { values, setValue };
}
