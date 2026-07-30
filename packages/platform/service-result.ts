export type ServiceErrorDetails = Record<string, unknown>;

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; details?: ServiceErrorDetails };

const SERVICE_RESULT_BRAND = Symbol.for("@workspace/platform/service-result");

type BrandedServiceResult<T> = ServiceResult<T> & { [SERVICE_RESULT_BRAND]: true };

function brandServiceResult<T>(result: ServiceResult<T>): BrandedServiceResult<T> {
  Object.defineProperty(result, SERVICE_RESULT_BRAND, {
    value: true,
    enumerable: false,
  });
  return result as BrandedServiceResult<T>;
}

export function serviceOk<T>(data: T): ServiceResult<T> {
  return brandServiceResult({ ok: true, data });
}

export function serviceError(
  error: string,
  status = 400,
  details?: ServiceErrorDetails,
): ServiceResult<never> {
  return brandServiceResult({ ok: false, error, status, ...(details ? { details } : {}) });
}

export function isServiceResult<T = unknown>(value: unknown): value is ServiceResult<T> {
  if (!value || typeof value !== "object" || !("ok" in value)) return false;
  const result = value as Record<string, unknown>;
  if (result.ok === true) return "data" in result;
  if (result.ok === false) return typeof result.error === "string";
  return false;
}

export function isPlatformServiceResult<T = unknown>(value: unknown): value is ServiceResult<T> {
  return Boolean(value && typeof value === "object" && (value as Record<PropertyKey, unknown>)[SERVICE_RESULT_BRAND] === true);
}
