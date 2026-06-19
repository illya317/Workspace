import {
  checkHRAccess,
  checkHRDelete,
  checkHRWrite,
} from "@workspace/platform/server/auth";
import {
  createCrudHandlers,
  type AccessChecker,
  type CrudFactoryConfig,
} from "@workspace/platform/server/crud-factory";

export type { AccessChecker, CrudFactoryConfig };
export type CrudConfig = Omit<CrudFactoryConfig, "accessCheck" | "writeCheck" | "deleteCheck">;

function wrap(config: CrudConfig) {
  return createCrudHandlers({
    ...config,
    accessCheck: checkHRAccess,
    writeCheck: checkHRWrite,
    deleteCheck: checkHRDelete,
  });
}

export function handleUpdateField(request: Request, params: Promise<{ id: string }>, config: CrudConfig) {
  return wrap(config).handleUpdateField(request, params);
}

export function handleDelete(request: Request, params: Promise<{ id: string }>, config: CrudConfig) {
  return wrap(config).handleDelete(request, params);
}

export function handleCreate(
  request: Request,
  config: CrudConfig,
  buildData?: (
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
) {
  return wrap(config).handleCreate(request, buildData);
}
