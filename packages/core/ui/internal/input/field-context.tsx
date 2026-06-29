"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FieldInputShellProps } from "./FieldInputShell";
import type { FieldControlSize } from "../form/FormStyles";

export interface FieldContextValue {
  size?: FieldControlSize;
  density?: FieldInputShellProps["density"];
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function FieldContextProvider({
  value,
  children,
}: {
  value: FieldContextValue;
  children: ReactNode;
}) {
  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>;
}

export function useFieldContext() {
  return useContext(FieldContext);
}
