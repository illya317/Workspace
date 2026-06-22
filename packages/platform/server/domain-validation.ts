export interface DomainValidationIssue {
  message: string;
  status?: number;
  field?: string;
}

export type DomainValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; issue: DomainValidationIssue };

export type DomainServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export function okCommand<T>(data: T): DomainValidationResult<T> {
  return { ok: true, data };
}

export function failCommand(message: string, status = 400, field?: string): DomainValidationResult<never> {
  return { ok: false, issue: { message, status, field } };
}

export function mapValidationToServiceResult<T>(result: DomainValidationResult<T>): DomainServiceResult<T> {
  if (result.ok) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.issue.message,
    status: result.issue.status,
  };
}
