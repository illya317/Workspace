import { checkPermission } from "@workspace/platform/server/auth";
import {
  createCrudHandlers,
  type AccessChecker,
  type CrudFactoryConfig,
} from "@workspace/platform/server/crud-factory";

export type { AccessChecker, CrudFactoryConfig };
export type CrudConfig = Omit<CrudFactoryConfig, "accessCheck" | "writeCheck" | "deleteCheck">;

async function checkWorkAccess(userId: number, roleKey: "access" | "write" | "delete" = "access") {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (await checkPermission(userId, "work.plan", roleKey)) return true;
  return checkPermission(userId, "work", roleKey);
}

function wrap(config: CrudConfig) {
  return createCrudHandlers({
    ...config,
    accessCheck: (userId) => checkWorkAccess(userId, "access"),
    writeCheck: (userId) => checkWorkAccess(userId, "write"),
    deleteCheck: (userId) => checkWorkAccess(userId, "delete"),
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
