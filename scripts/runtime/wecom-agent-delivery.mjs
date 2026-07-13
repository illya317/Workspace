export function isFileArtifact(value, basePath = "/workspace") {
  return value
    && typeof value === "object"
    && value.kind === "file"
    && (value.source === "library-export" || value.source === "library-version")
    && typeof value.artifactId === "string"
    && typeof value.fileName === "string"
    && Number.isSafeInteger(value.fileSizeBytes)
    && value.fileSizeBytes > 0
    && Number.isSafeInteger(value.itemCount)
    && value.itemCount > 0
    && typeof value.workerPath === "string"
    && value.workerPath.startsWith(`${basePath}/api/integrations/wecom/agent/artifacts/`)
    && typeof value.downloadPath === "string"
    && value.downloadPath.startsWith(`${basePath}/api/integrations/wecom/download/`);
}

export function fileArtifactsFromResult(result, basePath = "/workspace") {
  if (!Array.isArray(result?.artifacts)) return [];
  return result.artifacts.filter((artifact) => isFileArtifact(artifact, basePath));
}

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function publicDownloadUrl(downloadPath, publicOrigin) {
  if (!publicOrigin) return null;
  try {
    return new URL(downloadPath, publicOrigin).toString();
  } catch {
    return null;
  }
}

export function controlledFileFallback(entries, publicOrigin, sentCount = 0) {
  const prefix = sentCount > 0 ? `已直接发送 ${sentCount} 份文件。\n\n` : "";
  const lines = entries.map(({ artifact, reason }) => {
    const url = publicDownloadUrl(artifact.downloadPath, publicOrigin);
    const detail = `${artifact.fileName}（${formatFileSize(artifact.fileSizeBytes)}）${reason}`;
    return url ? `- ${detail}：[安全下载](${url})` : `- ${detail}：请到 Workspace 资料库下载`;
  });
  return `${prefix}以下文件未能直接发送：\n${lines.join("\n")}\n\n受控下载链接仅限你的账号使用，30 分钟内有效。`;
}

export function normalizeWecomReplyLinks(content, publicOrigin, basePath = "/workspace") {
  return String(content).replace(/\[([^\]]+)]\(([^)]+)\)/g, (match, label, href) => {
    const normalizedBase = basePath === "/" ? "" : `/${basePath.replace(/^\/+|\/+$/g, "")}`;
    let path = href;
    if (!href.startsWith("/")) {
      try {
        const parsed = new URL(href);
        const internalPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        const withoutBase = normalizedBase && internalPath.startsWith(`${normalizedBase}/`)
          ? internalPath.slice(normalizedBase.length)
          : internalPath;
        if (!/^\/(?:library\/basic-info|api\/modules\/library\/basic-info)(?:\/|$)/.test(withoutBase)) return match;
        path = withoutBase;
      } catch {
        return match;
      }
    }
    if (!publicOrigin) return label;
    path = normalizedBase && !path.startsWith(`${normalizedBase}/`) ? `${normalizedBase}${path}` : path;
    try {
      return `[${label}](${new URL(path, publicOrigin).toString()})`;
    } catch {
      return label;
    }
  });
}
