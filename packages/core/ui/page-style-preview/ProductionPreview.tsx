import { ActionButton } from "../ActionControls";
import { PanelCard } from "../BaseCards";
import SelectField from "../SelectField";
import StructuredTable from "../StructuredTable";
import TextareaField from "../TextareaField";
import TextField from "../TextField";
import PreviewToolbar from "./PreviewToolbar";

const stageOptions = [
  { value: "raw", label: "原料" },
  { value: "middle", label: "中间品" },
  { value: "final", label: "成品" },
];

const previewRows = [
  [{ content: "项目", header: true }, { content: "结果", header: true }, { content: "判定", header: true }],
  [{ content: "外观" }, { content: "符合" }, { content: "通过" }],
  [{ content: "含量" }, { content: "99.2%" }, { content: "通过" }],
];

export default function ProductionPreview() {
  return (
    <div className="space-y-3">
      <PreviewToolbar totalLabel="共 24 项" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
        <PanelCard
          title="填写区"
          bodyClassName="space-y-3 p-4"
        >
          <TextField placeholder="批号" />
          <SelectField options={stageOptions} value="middle" onChange={() => {}} ariaLabel="阶段" />
          <TextareaField placeholder="检验记录" rows={4} />
          <div className="flex justify-end gap-2">
            <ActionButton>暂存</ActionButton>
            <ActionButton variant="primary">提交</ActionButton>
          </div>
        </PanelCard>
        <PanelCard title="预览区" bodyClassName="p-4">
          <StructuredTable
            rows={previewRows}
            className="w-full table-fixed border-collapse overflow-hidden rounded-lg border border-slate-200 text-sm"
            cellClassName="border border-slate-200 px-3 py-2 text-slate-700"
            headerCellClassName="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500"
          />
        </PanelCard>
      </div>
    </div>
  );
}
