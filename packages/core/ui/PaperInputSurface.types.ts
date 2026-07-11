export type PaperInputValueType = "text" | "number" | "date" | "datetime";

export interface PaperInputRangeSpec {
  min?: number | null;
  max?: number | null;
}

export interface PaperInputLayoutSpec {
  fieldKey: string;
  width?: string;
  align?: "left" | "center" | "right";
  underline?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  withTime?: boolean;
  valueType?: PaperInputValueType;
  numberFormat?: "round" | "round_half_even" | "ceil" | "floor" | "truncate";
  precision?: number;
  defaultValue?: string;
  defaultOffsetDays?: number;
  readonlyDisplay?: boolean;
  recommendedRange?: PaperInputRangeSpec;
}

interface PaperInputSurfaceBaseProps {
  layout: PaperInputLayoutSpec;
  value?: string;
  readOnly?: boolean;
  placement?: "inline" | "table";
}

export interface PaperInputSurfaceLineProps extends PaperInputSurfaceBaseProps {
  kind: "line";
  onChange?: (value: string) => void;
}

export interface PaperInputSurfaceDateProps extends PaperInputSurfaceBaseProps {
  kind: "date";
  hourValue?: string;
  onChange?: (value: string) => void;
  onHourChange?: (value: string) => void;
}

export interface PaperInputSurfaceSelectProps extends PaperInputSurfaceBaseProps {
  kind: "select";
  options: string[];
  onChange?: (value: string) => void;
}

export interface PaperInputSurfaceChoiceProps extends Omit<PaperInputSurfaceBaseProps, "layout"> {
  kind: "choice";
  fieldKey: string;
  options: string[];
  multiple?: boolean;
  onChange?: (value: string) => void;
}

export type PaperInputSurfaceProps =
  | PaperInputSurfaceLineProps
  | PaperInputSurfaceDateProps
  | PaperInputSurfaceSelectProps
  | PaperInputSurfaceChoiceProps;
