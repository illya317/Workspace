"use client";

interface Props {
  error: string | null;
  isStale?: boolean;
  hasFlaggedWithoutComment: boolean;
}

export default function ReviewAlerts({ error, isStale, hasFlaggedWithoutComment }: Props) {
  return (
    <>
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {isStale && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">⚠ 底稿已更新，当前校对为旧快照；请后续重新生成校对（下一批支持）。</div>}
      {hasFlaggedWithoutComment && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">⚠ 存在已标记(flagged)但未填写备注的行，请点击备注列填写标记原因。</div>
      )}
    </>
  );
}
