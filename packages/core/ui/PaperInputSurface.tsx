"use client";

import PaperDateInput from "./internal/paper/PaperDateInput";
import {
  PaperChoiceInput,
  PaperLineInput,
  PaperSelectInput,
} from "./internal/paper/PaperInputParts";
import type { PaperInputSurfaceProps } from "./PaperInputSurface.types";

export type * from "./PaperInputSurface.types";

export default function PaperInputSurface(props: PaperInputSurfaceProps) {
  if (props.kind === "choice") {
    return (
      <PaperChoiceInput
        fieldKey={props.fieldKey}
        options={props.options}
        type={props.multiple ? "checkbox" : "radio"}
        disabled={props.readOnly}
        value={props.value}
        onChange={props.onChange}
      />
    );
  }
  const inTable = props.placement === "table";
  if (props.kind === "date") {
    return (
      <PaperDateInput
        part={props.layout}
        value={props.value}
        hourValue={props.hourValue}
        onChange={props.onChange}
        onHourChange={props.onHourChange}
        readOnly={props.readOnly}
        inTable={inTable}
      />
    );
  }
  if (props.kind === "select") {
    return (
      <PaperSelectInput
        part={props.layout}
        options={props.options}
        readOnly={props.readOnly}
        value={props.value}
        onChange={props.onChange}
        inTable={inTable}
      />
    );
  }
  return (
    <PaperLineInput
      part={props.layout}
      readOnly={props.readOnly}
      value={props.value}
      onChange={props.onChange}
      inTable={inTable}
    />
  );
}
