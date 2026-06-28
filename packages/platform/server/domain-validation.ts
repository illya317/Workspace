import { isServiceResult, jsonErrorResponse, serviceResponse, type ServiceResult } from "./api";

export interface DomainValidationIssue {
  message: string;
  status?: number;
  field?: string;
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

export function failCommand(message: string, status = 400, field?: string): DomainValidationResult<never> {
  return { ok: false, issue: { message, status, field } };
}

export function mapValidationToServiceResult<T>(result: DomainValidationResult<T>): DomainServiceResult<T> {
  if (result.ok === true) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.issue.message,
    status: result.issue.status,
  };
}

export function domainIssueToResponse(issue: DomainValidationIssue) {
  return jsonErrorResponse(issue.message, issue.status ?? 400, issue.field ? { field: issue.field } : undefined);
}

export function toServiceErrorResponse(result: { error: string; status?: number }) {
  return serviceResponse({ ok: false, error: result.error, status: result.status });
}

export function isDomainServiceResult<T = unknown>(result: unknown): result is DomainServiceResult<T> {
  return isServiceResult(result);
}
