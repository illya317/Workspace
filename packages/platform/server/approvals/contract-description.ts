import { getActionContractMetadata } from "../../action-contract-registry";
import type { ApprovalRequestDescription } from "../../workflow-request-contract";

type ApprovalRequestDescriptionSource = {
  id: number | string;
  businessActionKey: string;
  subjectId: string | null;
  committedEntityId: string | null;
  latestPayload: unknown;
};

const DEFAULT_WORKFLOW_HREF = "/settings/account?tab=inbox";

export function describeApprovalRequestFromContract(
  request: ApprovalRequestDescriptionSource,
): ApprovalRequestDescription {
  const contract = getActionContractMetadata(request.businessActionKey);
  const values = descriptionTemplateValues(request);
  const titleTemplate = contract?.display.titleTemplate ?? contract?.label ?? request.businessActionKey;
  const title = renderDescriptionTemplate(titleTemplate, values) || request.businessActionKey;
  const summary = renderDescriptionTemplate(contract?.display.summaryTemplate ?? titleTemplate, values) || title;
  const href = renderDescriptionTemplate(contract?.display.hrefPattern ?? DEFAULT_WORKFLOW_HREF, values)
    || DEFAULT_WORKFLOW_HREF;
  return { title, summary, href };
}

export function renderDescriptionTemplate(
  template: string,
  values: Record<string, unknown>,
) {
  return template.replace(/\{([A-Za-z0-9_.]+)\}/g, (_match, path: string) => (
    descriptionValueAtPath(values, path)
  )).trim();
}

function descriptionTemplateValues(request: ApprovalRequestDescriptionSource) {
  const payload = objectValue(request.latestPayload);
  const data = objectValue(payload.data);
  const committedId = request.committedEntityId;
  const targetId = data.id ?? payload.departmentId ?? payload.targetId ?? request.subjectId ?? committedId;
  return {
    ...data,
    ...payload,
    requestId: request.id,
    targetId,
    id: data.id ?? payload.id ?? request.subjectId ?? committedId,
    result: { id: committedId },
  };
}

function descriptionValueAtPath(values: Record<string, unknown>, path: string) {
  let current: unknown = values;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return "";
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
