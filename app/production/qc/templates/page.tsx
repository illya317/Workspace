import { requireResourceAccess } from "@/server/auth/guard";
import QcModuleShell from "../components/QcModuleShell";

export default async function QcTemplatesPage() {
  const user = await requireResourceAccess("production.qc.templates");

  return (
    <QcModuleShell
      user={user}
      title="检验模板"
      description="承接组件映射、方法字段和表格布局，先用于收集模板建议，后续扩展为自助搭建模板。"
      panels={[
        {
          eyebrow: "反馈",
          title: "组件映射建议",
          items: ["检测项组件", "页面预览", "人工建议记录"],
        },
        {
          eyebrow: "方法",
          title: "方法字段",
          items: ["字段定义", "公式规则", "测试草稿"],
        },
        {
          eyebrow: "布局",
          title: "表格模板",
          items: ["布局预览", "草稿保存", "正式发布审核"],
        },
      ]}
    />
  );
}
