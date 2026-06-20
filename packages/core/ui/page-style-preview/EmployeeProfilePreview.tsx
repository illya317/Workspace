import { ActionButton } from "../ActionControls";
import { PanelCard } from "../BaseCards";
import FormField from "../FormField";
import TextField from "../TextField";
import { profileFields } from "./hr-preview-schema";

function AliasField() {
  const aliases = profileFields.find((field) => field.type === "tags")?.value ?? [];
  return (
    <FormField label="别名">
      <div className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-xs shadow-sm">
        {Array.isArray(aliases) && aliases.map((tag) => (
          <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600">
            {tag} <span className="ml-1 text-slate-400">×</span>
          </span>
        ))}
      </div>
    </FormField>
  );
}

export default function EmployeeProfilePreview() {
  const textFields = profileFields.filter((field) => field.type !== "tags");

  return (
    <PanelCard
      title="基本信息"
      actions={<ActionButton variant="primary">保存基本信息</ActionButton>}
      bodyClassName="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {textFields.slice(0, 2).map((field) => (
        <FormField key={field.key} label={field.label} required={"required" in field && Boolean(field.required)}>
          <TextField value={field.value} readOnly />
        </FormField>
      ))}
      <AliasField />
      {textFields.slice(2).map((field) => (
        <FormField key={field.key} label={field.label} required={"required" in field && Boolean(field.required)}>
          <TextField value={field.value} readOnly />
        </FormField>
      ))}
    </PanelCard>
  );
}
