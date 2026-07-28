import type {
  DataSurfaceCellSpec,
  FormSurfaceActionSpec,
  FormSurfaceItemSpec,
} from "@workspace/core/ui";
import {
  employmentAgreementFieldRequired,
  type EmploymentAgreementCommandKind,
} from "@workspace/hr/employment-agreement-field-contract";
import type { ContractRow } from "@workspace/hr/types";
import {
  agreementRevisionReadonlyItems,
  agreementTermCancelItems,
  agreementTermEndItems,
  agreementTermReadonlyItems,
  agreementTermRecordItems,
} from "./EmployeeProfileContractForm";
import {
  agreementTermMissingFields,
  agreementTermRowCommandKind,
  agreementTermRowReady,
  type AgreementDraft,
  type AgreementHistoryRow,
} from "./EmployeeProfileContractModel";

export type AgreementTermOperation = "edit" | "end" | "cancel";

export function useAgreementHistoryExpandedRow(input: {
  agreement: ContractRow | null;
  term: ContractRow["terms"][number] | null;
  revision: ContractRow["revisions"][number] | null;
  draft: AgreementDraft;
  operation: AgreementTermOperation;
  canEdit: boolean;
  saving: boolean;
  setField: (key: string, value: unknown) => void;
  startOperation: (operation: AgreementTermOperation) => void;
  submit: (kind: EmploymentAgreementCommandKind) => void;
}) {
  const agreement = input.agreement;
  if (!agreement) return () => null;
  return (history: AgreementHistoryRow): DataSurfaceCellSpec | null => {
    if (history.recordType === "revision") {
      return input.revision
        ? recordDetailCell(agreementRevisionReadonlyItems(input.revision))
        : null;
    }
    const term = input.term;
    if (!term) return null;
    const editable = input.canEdit && (term.recordState === "confirmed" || term.recordState === "unknown");
    if (!editable) return recordDetailCell(agreementTermReadonlyItems(term));
    if (input.operation === "end") return endDetail(input, agreement, term);
    if (input.operation === "cancel") return cancelDetail(input, agreement, term);

    const saveKind = agreementTermRowCommandKind(agreement, term, input.draft);
    const actions: FormSurfaceActionSpec[] = [{
      key: "save-term-record",
      action: "save",
      label: input.saving ? "保存中..." : "保存期限",
      disabled: input.saving || !agreementTermRowReady(agreement, term, input.draft),
      onClick: () => input.submit(saveKind),
    }];
    if (term.recordState === "confirmed" && term.temporalState === "current") {
      actions.push({
        key: "end-term",
        action: "edit",
        label: "登记终止",
        disabled: input.saving,
        onClick: () => input.startOperation("end"),
      });
    }
    if (term.recordState === "confirmed" && term.temporalState === "upcoming") {
      actions.push({
        key: "cancel-term",
        action: "cancel",
        label: "取消待生效",
        disabled: input.saving,
        onClick: () => input.startOperation("cancel"),
      });
    }
    return recordDetailCell(
      agreementTermRecordItems({ draft: input.draft, term, setField: input.setField }),
      actions,
    );
  };
}

export function agreementTermSupplementPatch(agreement: ContractRow, draft: AgreementDraft) {
  const term = agreement.terms.find((item) => item.termUid === draft.termUid) ?? null;
  if (!term) return {};
  const missingFields = agreementTermMissingFields(agreement, term);
  const patch: { effectiveFrom?: string; effectiveThrough?: string } = {};
  if (missingFields.has("effectiveFrom") && draft.effectiveFrom) patch.effectiveFrom = draft.effectiveFrom;
  if (missingFields.has("effectiveThrough") && draft.effectiveThrough) patch.effectiveThrough = draft.effectiveThrough;
  return patch;
}

export function agreementTermCommandReady(agreement: ContractRow, draft: AgreementDraft) {
  if (employmentAgreementFieldRequired(draft.kind, "reason") && !draft.reason?.trim()) return false;
  if (draft.kind === "renew") {
    return Boolean(draft.effectiveFrom && (draft.durationKind === "indefinite" || draft.effectiveThrough));
  }
  if (draft.kind === "supplement-term") {
    return Boolean(draft.termUid && Object.keys(agreementTermSupplementPatch(agreement, draft)).length > 0);
  }
  if (draft.kind === "correct") {
    return Boolean(draft.termUid && draft.effectiveFrom && (draft.durationKind === "indefinite" || draft.effectiveThrough));
  }
  if (draft.kind === "end") return Boolean(draft.termUid && draft.effectiveThrough);
  if (draft.kind === "cancel-future") return Boolean(draft.termUid);
  return false;
}

function endDetail(
  input: Parameters<typeof useAgreementHistoryExpandedRow>[0],
  agreement: ContractRow,
  term: ContractRow["terms"][number],
) {
  return recordDetailCell(
    agreementTermEndItems({ draft: input.draft, term, setField: input.setField }),
    [
      backAction(input),
      {
        key: "save-term-end",
        action: "save",
        label: input.saving ? "保存中..." : "确认终止",
        disabled: input.saving || !agreementTermCommandReady(agreement, input.draft),
        onClick: () => input.submit("end"),
      },
    ],
  );
}

function cancelDetail(
  input: Parameters<typeof useAgreementHistoryExpandedRow>[0],
  agreement: ContractRow,
  term: ContractRow["terms"][number],
) {
  return recordDetailCell(
    agreementTermCancelItems({ draft: input.draft, term, setField: input.setField }),
    [
      backAction(input),
      {
        key: "save-term-cancel",
        action: "save",
        label: input.saving ? "保存中..." : "确认取消",
        disabled: input.saving || !agreementTermCommandReady(agreement, input.draft),
        onClick: () => input.submit("cancel-future"),
      },
    ],
  );
}

function backAction(
  input: Parameters<typeof useAgreementHistoryExpandedRow>[0],
): FormSurfaceActionSpec {
  return {
    key: "back-to-term",
    action: "cancel",
    label: "返回",
    disabled: input.saving,
    onClick: () => input.startOperation("edit"),
  };
}

function recordDetailCell(
  items: FormSurfaceItemSpec[],
  actions: FormSurfaceActionSpec[] = [],
): DataSurfaceCellSpec {
  return {
    kind: "form",
    form: {
      kind: "fields",
      content: { items, layout: { columns: 2 } },
      actions,
    },
  };
}
