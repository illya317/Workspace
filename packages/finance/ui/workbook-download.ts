async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return fallback;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return fallback;
  }
}

export async function downloadFinanceWorkbook(
  url: string,
  fallbackFilename: string,
  fallbackError = "Excel 下载失败",
) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await responseError(response, fallbackError));
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = responseFilename(response, fallbackFilename);
  link.click();
  URL.revokeObjectURL(objectUrl);
}
