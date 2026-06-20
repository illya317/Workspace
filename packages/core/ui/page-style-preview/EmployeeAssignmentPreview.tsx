import { ActionButton } from "../ActionControls";
import { PanelCard } from "../BaseCards";
import FormField from "../FormField";
import { getFieldInputClassName } from "../FormStyles";
import SearchInput from "../SearchInput";
import StatusBadge from "../StatusBadge";
import TextField from "../TextField";
import { assignmentFields } from "./hr-preview-schema";

function PercentField() {
  return (
    <div className="flex h-10 overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
      <input
        readOnly
        value="99.98"
        className={getFieldInputClassName("rounded-none border-0 shadow-none")}
      />
      <span className="grid w-10 place-items-center border-l border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">%</span>
    </div>
  );
}

export default function EmployeeAssignmentPreview() {
  return (
    <PanelCard
      title="岗位任职"
      actions={(
        <div className="flex items-center gap-2">
          <ActionButton>新增岗位记录</ActionButton>
          <ActionButton variant="primary">保存部门岗位</ActionButton>
        </div>
      )}
      bodyClassName="space-y-4 p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <strong className="text-slate-900">董事长</strong>
        <StatusBadge label="当前岗位" variant="green" />
        <StatusBadge label="主岗" variant="blue" />
        <span className="text-slate-500">轮执委员会 · 未设置开始 至 长期</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {assignmentFields.map((field) => (
          <FormField key={field.key} label={field.label} required={"required" in field && Boolean(field.required)} layout="inline">
            {field.type === "percent" ? (
              <PercentField />
            ) : field.type === "fk-search" ? (
              <SearchInput value="" onChange={() => {}} placeholder={field.placeholder} size="compact" />
            ) : (
              <TextField
                value={field.value}
                placeholder={"placeholder" in field ? field.placeholder : undefined}
                readOnly
              />
            )}
          </FormField>
        ))}
      </div>
    </PanelCard>
  );
}
