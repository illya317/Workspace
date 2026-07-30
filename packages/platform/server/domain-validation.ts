import {
  isPlatformServiceResult,
  serviceError,
  serviceOk,
  type ServiceResult,
} from "../service-result";

export interface DomainValidationIssue {
  message: string;
  status?: number;
  field?: string;
  details?: Record<string, unknown>;
}

export type DomainValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; issue: DomainValidationIssue };

export type DomainServiceResult<T> = ServiceResult<T>;

export type DomainCommandBuilder<TInput, TCommand> = (
  input: TInput,
) => DomainValidationResult<TCommand> | Promise<DomainValidationResult<TCommand>>;

export type DomainAction<TCommand, TResult, TContext = unknown> = (
  command: TCommand,
  context: TContext,
) => TResult | Promise<TResult>;

export function okCommand<T>(data: T): DomainValidationResult<T> {
  return { ok: true, data };
}

export function failCommand(
  message: string,
  status = 400,
  field?: string,
  details?: Record<string, unknown>,
): DomainValidationResult<never> {
  return {
    ok: false,
    issue: {
      message,
      status,
      field,
      ...(details === undefined ? {} : { details }),
    },
  };
}

export function mapValidationToServiceResult<T>(result: DomainValidationResult<T>): DomainServiceResult<T> {
  if (result.ok === true) return serviceOk(result.data);
  return serviceError(result.issue.message, result.issue.status, result.issue.details);
}

export function isDomainServiceResult<T = unknown>(result: unknown): result is DomainServiceResult<T> {
  return isPlatformServiceResult(result);
}
