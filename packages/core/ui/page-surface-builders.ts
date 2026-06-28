import type { DataSurfaceProps, DataSurfaceTableProps } from "./DataSurface.types";
import type { FormSurfaceFieldModeProps, FormSurfaceLooseItem, FormSurfaceProps } from "./FormSurface.types";
import type {
  PageSurfaceBlockSpec,
  PageSurfaceActionBlockSpec,
  PageSurfaceCommandSpec,
  PageSurfaceHeaderSpec,
  PageSurfaceKind,
  PageSurfaceModalSpec,
  PageSurfaceProps,
} from "./PageSurface.types";

export type PageSurfaceBodyBlockSpec = Exclude<PageSurfaceBlockSpec, { kind: "modal" }>;

export interface PageSurfaceShellPropsOptions {
  kind?: Exclude<PageSurfaceKind, "split">;
  title?: PageSurfaceHeaderSpec["title"];
  backHref?: string;
  backLabel?: PageSurfaceHeaderSpec["backLabel"];
  header?: PageSurfaceHeaderSpec;
  blocks?: PageSurfaceBlockSpec[];
  body?: PageSurfaceProps["body"];
  toolbar?: PageSurfaceProps["toolbar"];
  navigation?: PageSurfaceProps["navigation"];
  footer?: PageSurfaceProps["footer"];
  actions?: PageSurfaceCommandSpec[];
  embedded?: boolean;
  className?: string;
  contentClassName?: string;
}

export function createPageCommand(command: PageSurfaceCommandSpec): PageSurfaceCommandSpec {
  return command;
}

export function createPageActionsBlock(
  key: string,
  actions: PageSurfaceCommandSpec[],
  options: Omit<PageSurfaceActionBlockSpec, "kind" | "key" | "actions"> = {},
): PageSurfaceActionBlockSpec {
  return { kind: "actions", key, actions, ...options };
}

export function createPageDataBlock<T>(
  key: string,
  surface: DataSurfaceProps<T>,
): Extract<PageSurfaceBlockSpec, { kind: "data" }> {
  return { kind: "data", key, surface };
}

export function createPageTableBlock<T>(
  key: string,
  table: Omit<DataSurfaceTableProps<T>, "kind">,
): Extract<PageSurfaceBlockSpec, { kind: "data" }> {
  return createPageDataBlock<T>(key, { kind: "table", ...table });
}

export function createPageFormBlock<T = FormSurfaceLooseItem>(
  key: string,
  surface: FormSurfaceProps<T>,
): Extract<PageSurfaceBlockSpec, { kind: "form" }> {
  return { kind: "form", key, surface };
}

export function createPageFieldsBlock<T = FormSurfaceLooseItem>(
  key: string,
  fields: FormSurfaceFieldModeProps<T>["fields"],
  options: Omit<FormSurfaceFieldModeProps<T>, "kind" | "fields"> & { kind?: "fields" | "detail" } = {},
): Extract<PageSurfaceBlockSpec, { kind: "form" }> {
  const { kind = "fields", ...rest } = options;
  return createPageFormBlock<T>(key, { kind, fields, ...rest });
}

export function createPageInlineFieldsBlock<T = FormSurfaceLooseItem>(
  key: string,
  fields: FormSurfaceFieldModeProps<T>["fields"],
  options: Omit<FormSurfaceFieldModeProps<T>, "kind" | "fields"> & { kind?: "inline" | "filters" } = {},
): Extract<PageSurfaceBlockSpec, { kind: "form" }> {
  const { kind = "inline", ...rest } = options;
  return createPageFormBlock<T>(key, { kind, fields, ...rest });
}

export function createPageModalBlock(
  key: string,
  modal: Omit<PageSurfaceModalSpec, "key">,
): Extract<PageSurfaceBlockSpec, { kind: "modal" }> {
  return { kind: "modal", key, ...modal };
}

export function createPageFormModalBlock<T = FormSurfaceLooseItem>(
  key: string,
  modal: Omit<PageSurfaceModalSpec, "key" | "blocks">,
  surface: Omit<FormSurfaceFieldModeProps<T>, "kind"> & { kind?: "fields" | "detail" },
): Extract<PageSurfaceBlockSpec, { kind: "modal" }> {
  const { kind = "fields", ...rest } = surface;
  return createPageModalBlock(key, {
    ...modal,
    blocks: [createPageFormBlock<T>(`${key}-form`, { kind, ...rest })],
  });
}

export function createPageSurfaceProps(options: PageSurfaceShellPropsOptions): PageSurfaceProps {
  const {
    kind = "list",
    title,
    backHref,
    backLabel,
    header,
    blocks,
    body,
    ...rest
  } = options;
  return {
    kind,
    header: header ?? (title || backHref ? { title, backHref, backLabel } : undefined),
    body: body ?? (blocks ? { blocks } : undefined),
    ...rest,
  } as PageSurfaceProps;
}
