import type {
  PageSurfaceTabBarSpec,
  SurfaceToolbarItem,
  SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ConsolidationOverview, StatementReportType } from "@workspace/finance/types";

export type ConsolidationWorkpaperView = "preparation" | "fxWorkpaper" | "nciWorkpaper" | "workpaper" | "report";

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
}
