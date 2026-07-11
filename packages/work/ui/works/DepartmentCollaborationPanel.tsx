"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMessageSection,
  createPageBody,
  type BodySurfaceProps,
  type BodySurfaceSelectorProps,
  type FormSurfaceActionSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { postJson, putJson, requestJson } from "@workspace/platform/ui/api-client";
import {
  collaborationDraftCanSubmit,
  departmentCollaborationFormBody,
  departmentCollaborationFormItems,
  emptyCollaborationDraft,
  type CollaborationDraft,
  type CollaborationType,
  type DepartmentOption,
  type PositionOption,
} from "./DepartmentCollaborationForm";
import type { WorkTaskSpace } from "./types";

type CollaborationResponseStatus = "pending" | "accepted" | "rejected";
type CollaborationRoleFilter = "responsible" | "enabling";

type DepartmentCollaboration = {
  id: number;
  title: string;
  description: string;
  collaborationType: CollaborationType;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
  role: "responsible" | "enabling";
  currentResponseStatus: CollaborationResponseStatus | null;
  responsibleDepartment: DepartmentOption;
  enablingDepartments: Array<{
    id: number;
    departmentId: number;
    departmentCode: string;
    departmentName: string;
    responseStatus: CollaborationResponseStatus;
    responseNote: string;
    respondedAt: string | null;
  }>;
  responsiblePositions: PositionOption[];
  executorPositions: PositionOption[];
  workPlans: Array<{ id: number }>;
  workItems: Array<{ id: number }>;
  updatedAt: string;
};

type DepartmentCollaborationResponse = {
  collaborations: DepartmentCollaboration[];
  departmentOptions: DepartmentOption[];
  positionOptions: PositionOption[];
};

type SubmitCollaborationResponse = {
  request?: { committedEntityId?: string | null; status?: string };
};

export interface DepartmentCollaborationController {
  leftNavigationBody: BodySurfaceSelectorProps;
  rightBody: BodySurfaceProps;
  toolbarItems: SurfaceToolbarItems;
}

export function useDepartmentCollaborationController(input: {
  enabled: boolean;
  space: WorkTaskSpace | null;
  canSubmit: boolean;
  canRespond: boolean;
  onToast: (message: string, type: "success" | "error") => void;
}): DepartmentCollaborationController {
  const { enabled, space, canSubmit, canRespond, onToast } = input;
  const [data, setData] = useState<DepartmentCollaborationResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<CollaborationRoleFilter>("responsible");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CollaborationDraft>(() => emptyCollaborationDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || space?.targetType !== "department") return null;
    setLoading(true);
    try {
      const response = await requestJson<DepartmentCollaborationResponse>(
        `/api/modules/work/tasks/collaborations?departmentId=${space.targetId}`,
        { fallbackMessage: "加载部门协作失败" },
      );
      setData(response);
      return response;
    } catch (error) {
      onToast(error instanceof Error ? error.message : "加载部门协作失败", "error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, onToast, space]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setDraft(emptyCollaborationDraft());
    setRoleFilter("responsible");
    setCreating(false);
    setSelectedId(null);
  }, [space?.targetId]);

  const filteredCollaborations = useMemo(
    () => (data?.collaborations ?? []).filter((collaboration) => collaboration.role === roleFilter),
    [data?.collaborations, roleFilter],
  );
  useEffect(() => {
    setSelectedId((current) => filteredCollaborations.some((item) => item.id === current)
      ? current
      : filteredCollaborations[0]?.id ?? null);
  }, [filteredCollaborations]);
  const selected = filteredCollaborations.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!creating && selected) setDraft(collaborationDraftFrom(selected));
  }, [creating, selected]);

  const submit = useCallback(async () => {
    if (!space || space.targetType !== "department" || saving) throw new Error("当前空间不可提交部门协作");
    setSaving(true);
    try {
      const result = await postJson<SubmitCollaborationResponse>(
        "/api/modules/work/tasks/collaborations",
        collaborationPayload(draft, space.targetId),
        "提交部门协作失败",
      );
      const response = await load();
      const committedId = Number(result.request?.committedEntityId);
      setRoleFilter("responsible");
      if (Number.isInteger(committedId) && committedId > 0 && response?.collaborations.some((item) => item.id === committedId)) {
        setSelectedId(committedId);
      }
      setDraft(emptyCollaborationDraft());
      setCreating(false);
      return {
        outcome: "submitted" as const,
        message: result.request?.status === "submitted" ? "部门协作已提交，等待流程处理" : "部门协作已提交",
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error("提交部门协作失败");
    } finally {
      setSaving(false);
    }
  }, [draft, load, saving, space]);

  const save = useCallback(async () => {
    if (!selected || selected.role !== "responsible" || saving) return;
    setSaving(true);
    try {
      const result = await putJson<SubmitCollaborationResponse>(
        `/api/modules/work/tasks/collaborations/${selected.id}`,
        collaborationPayload(draft, selected.responsibleDepartment.id),
        "保存部门协作失败",
      );
      await load();
      onToast(result.request?.status === "submitted" ? "协作修改已提交，等待流程处理" : "协作修改已保存", "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "保存部门协作失败", "error");
    } finally {
      setSaving(false);
    }
  }, [draft, load, onToast, saving, selected]);

  const respond = useCallback(async (collaboration: DepartmentCollaboration, action: "accept" | "reject") => {
    if (!space || space.targetType !== "department" || saving) return;
    setSaving(true);
    try {
      await postJson(`/api/modules/work/tasks/collaborations/${collaboration.id}/respond`, {
        departmentId: space.targetId,
        action,
      }, action === "accept" ? "接受协作失败" : "拒绝协作失败");
      await load();
      onToast(action === "accept" ? "已接受部门协作" : "已拒绝部门协作", "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "反馈部门协作失败", "error");
    } finally {
      setSaving(false);
    }
  }, [load, onToast, saving, space]);

  const startCreate = () => {
    setDraft(emptyCollaborationDraft());
    setCreating(true);
  };
  const cancelCreate = () => {
    setDraft(emptyCollaborationDraft());
    setCreating(false);
  };
  const resetSelectedDraft = () => {
    if (selected) setDraft(collaborationDraftFrom(selected));
  };
  const leftNavigationBody = collaborationNavigationBody({
    collaborations: filteredCollaborations,
    roleFilter,
    selectedId,
    loading,
    onSelect: (collaboration) => {
      setSelectedId(collaboration.id);
      setCreating(false);
    },
  });
  const createFormInput = {
      mode: "create",
      title: "新建协作事项",
      draft,
      setDraft,
      departments: data?.departmentOptions ?? [],
      positions: data?.positionOptions ?? [],
      responsibleDepartmentId: space?.targetId ?? 0,
      responsibleDepartmentName: space?.name || "当前部门",
      disabled: !canSubmit || saving,
      saving,
      onSubmit: submit,
      onCancel: cancelCreate,
    } as const;
  const selectedBody = selected
      ? departmentCollaborationFormBody({
        mode: selected.role === "responsible" && canSubmit ? "edit" : "readonly",
        title: selected.title,
        draft,
        setDraft,
        departments: data?.departmentOptions ?? [],
        positions: data?.positionOptions ?? [],
        responsibleDepartmentId: selected.responsibleDepartment.id,
        responsibleDepartmentName: selected.responsibleDepartment.name,
        disabled: selected.role !== "responsible" || !canSubmit || saving,
        saving,
        actions: collaborationResponseActions(selected, canRespond && !saving, respond),
        onSubmit: selected.role === "responsible" && canSubmit ? save : undefined,
        onCancel: selected.role === "responsible" && canSubmit ? resetSelectedDraft : undefined,
      })
      : createPageBody([createMessageSection("department-collaboration-empty", {
        content: loading ? "加载协作详情中..." : "请选择左侧协作事项",
        tone: "muted",
      })]);
  const rightBody = createPageBody([
    {
      key: "department-collaboration-create",
      chrome: "plain",
      body: {
        kind: "create",
        create: {
          id: "department-collaboration-create",
          trigger: "surface",
          presentation: "block",
          title: "新建协作事项",
          open: creating,
          canCreate: canSubmit,
          disabled: saving,
          content: { kind: "form", form: { items: departmentCollaborationFormItems(createFormInput), layout: { columns: 1, density: "compact" } } },
          submission: { action: "submit", disabled: saving || !collaborationDraftCanSubmit(draft), execute: submit },
          onOpenChange: (open) => { if (open) startCreate(); else cancelCreate(); },
        },
      },
    },
    ...(creating ? [] : [{ key: "department-collaboration-detail", body: selectedBody, chrome: "plain" as const }]),
  ]);

  return {
    leftNavigationBody,
    rightBody,
    toolbarItems: enabled ? [{
      kind: "option-group" as const,
      key: "department-collaboration-role-filter",
      value: roleFilter,
      options: [{ value: "responsible", label: "我方负责" }, { value: "enabling", label: "我方赋能" }],
      onChange: (value: string) => setRoleFilter(value === "enabling" ? "enabling" : "responsible"),
      ariaLabel: "协作角色",
      presentation: "segmented" as const,
    }] : [],
  };
}

function collaborationDraftFrom(collaboration: DepartmentCollaboration): CollaborationDraft {
  return {
    title: collaboration.title,
    description: collaboration.description,
    collaborationType: collaboration.collaborationType,
    effectiveFrom: collaboration.effectiveFrom ?? "",
    effectiveTo: collaboration.effectiveTo ?? "",
    enablingDepartmentIds: collaboration.enablingDepartments.map((department) => department.departmentId),
    responsiblePositionIds: collaboration.responsiblePositions.map((position) => position.id),
    executorPositionIds: collaboration.executorPositions.map((position) => position.id),
  };
}

function collaborationPayload(draft: CollaborationDraft, responsibleDepartmentId: number) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    collaborationType: draft.collaborationType,
    effectiveFrom: draft.effectiveFrom || null,
    effectiveTo: draft.effectiveTo || null,
    responsibleDepartmentId,
    enablingDepartmentIds: draft.enablingDepartmentIds,
    responsiblePositionIds: draft.responsiblePositionIds,
    executorPositionIds: draft.executorPositionIds,
  };
}

function collaborationResponseActions(
  collaboration: DepartmentCollaboration,
  canRespond: boolean,
  onRespond: (collaboration: DepartmentCollaboration, action: "accept" | "reject") => void,
): FormSurfaceActionSpec[] {
  if (collaboration.role !== "enabling" || collaboration.currentResponseStatus !== "pending") return [];
  return [{
    key: "accept-collaboration",
    action: "approve",
    label: "接受",
    disabled: !canRespond,
    onClick: () => onRespond(collaboration, "accept"),
  }, {
    key: "reject-collaboration",
    action: "reject",
    label: "拒绝",
    disabled: !canRespond,
    onClick: () => onRespond(collaboration, "reject"),
  }];
}

function collaborationNavigationBody(input: {
  collaborations: DepartmentCollaboration[];
  roleFilter: CollaborationRoleFilter;
  selectedId: number | null;
  loading: boolean;
  onSelect: (collaboration: DepartmentCollaboration) => void;
}): BodySurfaceSelectorProps {
  return {
    kind: "selector",
    selector: {
      kind: "list",
      title: input.roleFilter === "responsible" ? "我方负责" : "我方赋能",
      loading: input.loading,
      loadingText: "加载协作事项中...",
      emptyText: input.roleFilter === "responsible" ? "暂无我方负责的协作事项" : "暂无我方赋能的协作事项",
      items: input.collaborations.map((item) => {
        const status = collaborationNavigationStatus(item);
        return {
          key: item.id,
          value: item,
          card: {
            title: item.title,
            subtitle: item.role === "responsible"
              ? `执行岗位：${item.executorPositions.map((position) => position.name).join("、") || "未设置"}`
              : `负责：${item.responsibleDepartment.name}`,
            code: status.label,
            codeTone: status.tone,
            meta: [`计划 ${item.workPlans.length}`, `任务 ${item.workItems.length}`],
            active: item.id === input.selectedId,
            size: "sm" as const,
          },
        };
      }),
      selectedId: input.selectedId,
      onSelect: input.onSelect,
      size: "sm",
    },
  };
}

function collaborationNavigationStatus(collaboration: DepartmentCollaboration): { label: string; tone: "success" | "warning" | "muted" | "default" } {
  if (collaboration.role === "enabling") {
    return { label: responseLabel(collaboration.currentResponseStatus), tone: collaboration.currentResponseStatus === "accepted" ? "success" : collaboration.currentResponseStatus === "pending" ? "warning" : "muted" };
  }
  const statuses = collaboration.enablingDepartments.map((entry) => entry.responseStatus);
  if (statuses.some((status) => status === "pending")) return { label: "待反馈", tone: "warning" };
  if (statuses.some((status) => status === "rejected")) return { label: "有拒绝", tone: "muted" };
  return { label: "已接受", tone: "success" };
}

function responseLabel(status: CollaborationResponseStatus | null) {
  if (status === "accepted") return "已接受";
  if (status === "rejected") return "已拒绝";
  return "待反馈";
}
