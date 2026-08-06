import type {
  PageSurfaceTabBarSpec,
  SurfaceToolbarItem,
  SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ConsolidationOverview, StatementReportType } from "@workspace/finance/types";

export type ConsolidationWorkpaperView = "preparation" | "fxWorkpaper" | "nciWorkpaper" | "workpaper" | "report";

/**
 * 差异诊断 context-launch（Package 7）：实体/合并报表 tab 的类型化预填载荷。
 * 只携带选择字段；系统 targetFingerprint 由差异诊断 tab 经只读 target-preview
 * 解析为完整 StatementTargetRef（无导航/remount，客户端状态传递）。
 */
export type StatementComparisonLaunchContext =
  | {
      kind: "entity";
      companyCode: string;
      companyName: string;
      year: number;
      month: number;
      periodKind: "year" | "quarter" | "month";
      reportType: "balance" | "income" | "cashflow";
    }
  | {
      kind: "consolidated";
      parentCompanyId: number;
      parentName: string;
      batchId: number;
      batchLabel: string;
      reportType: "balance" | "income" | "cashflow";
    };

/** 实体/合并报表 tab 的差异诊断入口回调：切换顶层 tab 并预填类型化目标上下文。 */
export type LaunchStatementComparison = (context: StatementComparisonLaunchContext) => void;

export interface ConsolidationCapabilities {
  canCreate: boolean;
  canUpdate: boolean;
  canUpdateConsolidationScope: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canLock: boolean;
  canExport: boolean;
  /** finance.statements 显式 import 动作：仅报表对比证据上传；无此权限时隐藏/禁用上传。 */
  canImport: boolean;
}

export interface ConsolidationTabProps {
  capabilities: ConsolidationCapabilities;
  data: ConsolidationOverview | null;
  error: string | null;
  loading: boolean;
  sharedToolbarItems: SurfaceToolbarItems;
  reportType: StatementReportType;
  reportTypeToolbarItem: SurfaceToolbarItem;
  onRefresh: (freshBatch?: NonNullable<ConsolidationOverview["batch"]>) => void;
  onBatchDeleted: () => void;
  onStartWorkpaper: () => void;
  onWorkpaperConfirmed: () => void;
  navigation: PageSurfaceTabBarSpec;
  /** 差异诊断 context-launch（Package 7）；缺省则不展示入口。 */
  onLaunchComparison?: LaunchStatementComparison;
}
