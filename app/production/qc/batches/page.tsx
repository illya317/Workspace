import { requireResourceAccess } from "@/server/auth/guard";
import QcModuleShell from "../components/QcModuleShell";

export default async function QcBatchesPage() {
  const user = await requireResourceAccess("production.qc.batches");

  return (
    <QcModuleShell
      user={user}
      title="批次检验"
      description="承接药品批次检验记录，先建立 Workspace 入口、权限边界和后续迁移落点。"
      activeResourceKey="production.qc.batches"
      panels={[
        {
          eyebrow: "批次",
          title: "批次台账",
          items: ["产品与批号", "检验阶段", "草稿与提交状态"],
        },
        {
          eyebrow: "记录",
          title: "检验记录",
          items: ["检验前确认", "检测项填写", "字段值保存"],
        },
        {
          eyebrow: "签核",
          title: "提交复核",
          items: ["检验者", "复核者", "操作审计"],
        },
      ]}
    />
  );
}
