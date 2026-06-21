export function UsageFiles({ files }: { files: string[] }) {
  if (files.length === 0) {
    return <span className="text-sm text-slate-400">未发现消费文件</span>;
  }

  const visibleFiles = files.slice(0, 6);
  const remaining = files.length - visibleFiles.length;

  return (
    <div className="space-y-1.5">
      {visibleFiles.map((file) => (
        <div key={file} className="truncate font-mono text-xs text-slate-600">
          {file}
        </div>
      ))}
      {remaining > 0 && (
        <div className="text-xs text-slate-400">另 {remaining} 个文件</div>
      )}
    </div>
  );
}
