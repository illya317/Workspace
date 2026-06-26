import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { CreateMeetingDraft, MeetingType } from "./meeting-types";

export function meetingCreateFields(
  createDraft: CreateMeetingDraft,
  types: MeetingType[],
  onChange: (draft: CreateMeetingDraft) => void,
): FormSurfaceFieldSpec[] {
  const start = splitDateTimeValue(createDraft.startAt);
  const end = splitDateTimeValue(createDraft.endAt);
  return [
    {
      key: "typeId",
      label: "会议类型",
      spec: { valueType: "string", editor: "select", options: { source: "static", items: types.map(type => ({ value: String(type.id), label: type.name })) } },
      value: createDraft.typeId,
      onChange: (typeId) => onChange({ ...createDraft, typeId: String(typeId ?? "") }),
    },
    {
      key: "title",
      label: "会议主题",
      required: true,
      spec: { valueType: "string", editor: "input" },
      value: createDraft.title,
      onChange: (title) => onChange({ ...createDraft, title: String(title ?? "") }),
    },
    {
      key: "location",
      label: "地点",
      spec: { valueType: "string", editor: "input" },
      value: createDraft.location,
      onChange: (location) => onChange({ ...createDraft, location: String(location ?? "") }),
    },
    {
      key: "startDate",
      label: "开始日期",
      spec: { valueType: "date", editor: "datePicker" },
      value: start.date,
      onChange: (date) => onChange({ ...createDraft, startAt: combineDateTimeValue(String(date ?? ""), start.time) }),
      placeholder: "选择日期",
    },
    {
      key: "startTime",
      label: "开始时间",
      spec: { valueType: "time", editor: "timePicker" },
      value: start.time,
      onChange: (time) => onChange({ ...createDraft, startAt: combineDateTimeValue(start.date, String(time ?? "")) }),
    },
    {
      key: "endDate",
      label: "结束日期",
      spec: { valueType: "date", editor: "datePicker" },
      value: end.date,
      onChange: (date) => onChange({ ...createDraft, endAt: combineDateTimeValue(String(date ?? ""), end.time) }),
      placeholder: "选择日期",
    },
    {
      key: "endTime",
      label: "结束时间",
      spec: { valueType: "time", editor: "timePicker" },
      value: end.time,
      onChange: (time) => onChange({ ...createDraft, endAt: combineDateTimeValue(end.date, String(time ?? "")) }),
    },
    {
      key: "visibility",
      label: "可见性",
      spec: { valueType: "string", editor: "select", options: { source: "static", items: [
        { value: "participants_only", label: "参会人可见" },
        { value: "public", label: "模块内公开" },
      ] } },
      value: createDraft.visibility,
      onChange: (visibility) => onChange({ ...createDraft, visibility: visibility as CreateMeetingDraft["visibility"] }),
    },
    {
      key: "participantUserIds",
      label: "参会用户 ID",
      spec: { valueType: "string", editor: "input" },
      value: createDraft.participantUserIds,
      onChange: (participantUserIds) => onChange({ ...createDraft, participantUserIds: String(participantUserIds ?? "") }),
    },
    {
      key: "description",
      label: "说明",
      span: "wide",
      spec: { valueType: "string", editor: "textarea" },
      value: createDraft.description,
      onChange: (description) => onChange({ ...createDraft, description: String(description ?? "") }),
    },
  ];
}

function splitDateTimeValue(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  return {
    date: match?.[1] ?? "",
    time: match?.[2] ?? "",
  };
}

function combineDateTimeValue(date: string | null, time: string | null) {
  if (!date) return "";
  return `${date}T${time || "09:00"}`;
}
