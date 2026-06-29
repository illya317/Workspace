"use client";

import DataSurface from "./DataSurface";
import DocumentSurface, { type DocumentSurfaceProps } from "./DocumentSurface";
import FormSurface from "./FormSurface";
import BlockSurface, { type BlockSurfaceProps } from "./BlockSurface";
import NavigationRenderer, { type NavigationRendererProps } from "./NavigationRenderer";
import type { ReactNode } from "react";
import type { DataSurfaceProps, DataSurfaceLooseRow } from "./DataSurface.types";
import type { FormSurfaceProps, FormSurfaceLooseItem } from "./FormSurface.types";
import MetricsSurface, { type MetricsSurfaceProps } from "./MetricsSurface";
import RecordSurface, { type RecordSurfaceProps } from "./RecordSurface";
import SelectorSurface, { type SelectorSurfaceProps } from "./SelectorSurface";
import VisualizationSurface, { type VisualizationSurfaceProps } from "./VisualizationSurface";

export type BodySurfaceKind =
  | "data"
  | "document"
  | "form"
  | "metrics"
  | "navigation"
  | "record"
  | "selector"
  | "section"
  | "visualization";

export type BodySurfaceSectionProps = {
  kind: "section";
  surface?: BlockSurfaceProps;
  sections?: BodySurfaceNestedSectionSpec[];
  layout?: "stack" | "grid";
  sectioning?: BodySurfaceSectioningSpec;
};

export type BodySurfaceSectioningSpec =
  | { kind: "none" }
  | { kind: "tabs"; active: string; onChange?: (key: string) => void };

export interface BodySurfaceNestedSectionSpec {
  key: string;
  label?: ReactNode;
  header?: {
    title?: ReactNode;
    subtitle?: ReactNode;
    badges?: Array<{ key: string; label: ReactNode; tone?: "default" | "muted" | "info" | "success" | "warning" | "danger" }>;
    actions?: Array<{ key: string; label: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger"; type?: "button" | "submit"; size?: "sm" | "md" | "lg"; truncate?: boolean }>;
  };
  framed?: boolean;
  body: BodySurfaceProps;
}

export type BodySurfaceDataProps<T = DataSurfaceLooseRow> = {
  kind: "data";
  data: DataSurfaceProps<T>;
};

export type BodySurfaceDocumentProps = {
  kind: "document";
  document: DocumentSurfaceProps;
};

export type BodySurfaceFormProps<T = FormSurfaceLooseItem> = {
  kind: "form";
  form: FormSurfaceProps<T>;
};

export type BodySurfaceMetricsProps = {
  kind: "metrics";
  metrics: MetricsSurfaceProps;
};

export type BodySurfaceNavigationProps = {
  kind: "navigation";
  navigation: NavigationRendererProps;
};

export type BodySurfaceRecordProps = {
  kind: "record";
  record: RecordSurfaceProps;
};

export type BodySurfaceSelectorProps = {
  kind: "selector";
  selector: SelectorSurfaceProps;
};

export type BodySurfaceVisualizationProps = {
  kind: "visualization";
  visualization: VisualizationSurfaceProps;
};

export type BodySurfaceProps<TData = DataSurfaceLooseRow, TForm = FormSurfaceLooseItem> =
  | BodySurfaceDataProps<TData>
  | BodySurfaceDocumentProps
  | BodySurfaceFormProps<TForm>
  | BodySurfaceMetricsProps
  | BodySurfaceNavigationProps
  | BodySurfaceRecordProps
  | BodySurfaceSelectorProps
  | BodySurfaceSectionProps
  | BodySurfaceVisualizationProps;

export default function BodySurface(props: BodySurfaceProps) {
  if (props.kind === "data") return <DataSurface {...props.data} />;
  if (props.kind === "document") return <DocumentSurface {...props.document} />;
  if (props.kind === "form") return <FormSurface {...props.form} />;
  if (props.kind === "metrics") return <MetricsSurface {...props.metrics} />;
  if (props.kind === "navigation") return <NavigationRenderer {...props.navigation} />;
  if (props.kind === "record") return <RecordSurface {...props.record} />;
  if (props.kind === "selector") return <SelectorSurface {...props.selector} />;
  if (props.kind === "section") return props.surface ? <BlockSurface {...props.surface} /> : null;
  return <VisualizationSurface {...props.visualization} />;
}
