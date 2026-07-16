import type { Page, Request, Response, TestInfo } from "@playwright/test";

interface ReadinessTransitionOptions<T> {
  page: Page;
  testInfo: TestInfo;
  name: string;
  trigger: () => Promise<T>;
  waitUntilReady: () => Promise<void>;
  slowBudgetMs?: number;
  requiredUrlPaths?: string[];
}

export function parseReadinessBudget(
  value: string | undefined,
  { fallbackMs = 15_000, maximumMs = 30_000 } = {},
) {
  if (value === undefined || value === "") return fallbackMs;
  const budgetMs = Number(value);
  if (!Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > maximumMs) {
    throw new Error(`E2E_READY_SLOW_BUDGET_MS must be an integer between 1 and ${maximumMs}`);
  }
  return budgetMs;
}

export function readinessBudgetError(name: string, durationMs: number, slowBudgetMs?: number) {
  if (slowBudgetMs === undefined || durationMs <= slowBudgetMs) return null;
  return new Error(
    `${name} became ready in ${durationMs}ms, exceeding the ${slowBudgetMs}ms slow budget`,
  );
}

export function requiredRequestFailureError(
  name: string,
  requiredUrlPaths: string[] | undefined,
  failedRequests: Array<{ error: string; method: string; url: string }>,
  serverErrors: Array<{ method: string; status: number; url: string }>,
) {
  const required = new Set(requiredUrlPaths ?? []);
  if (required.size === 0) return null;
  const isRequired = (value: string) => {
    try {
      return required.has(new URL(value, "http://readiness.invalid").pathname);
    } catch {
      return false;
    }
  };
  const criticalFailures = failedRequests.filter((item) => isRequired(item.url));
  const criticalErrors = serverErrors.filter((item) => isRequired(item.url));
  if (criticalFailures.length === 0 && criticalErrors.length === 0) return null;
  return new Error(
    `${name} required request failed: ${JSON.stringify({
      failedRequests: criticalFailures,
      serverErrors: criticalErrors,
    })}`,
  );
}

function diagnosticUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?", 1)[0].slice(0, 240);
  }
}

function errorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}

async function browserPerformance(page: Page) {
  try {
    const entries = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const resources = performance.getEntriesByType("resource")
        .map((entry) => ({
          durationMs: Math.round(entry.duration),
          name: entry.name,
          startTimeMs: Math.round(entry.startTime),
        }))
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 10);
      return {
        navigation: navigation
          ? {
            domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
            durationMs: Math.round(navigation.duration),
            loadEventMs: Math.round(navigation.loadEventEnd),
            responseEndMs: Math.round(navigation.responseEnd),
            responseStartMs: Math.round(navigation.responseStart),
            transferSizeBytes: navigation.transferSize,
          }
          : null,
        resources,
      };
    });
    return {
      ...entries,
      resources: entries.resources.map((resource) => ({
        ...resource,
        name: diagnosticUrl(resource.name),
      })),
    };
  } catch (error) {
    return { unavailable: errorDetails(error) };
  }
}

export async function recordReadyTransition<T>({
  page,
  testInfo,
  name,
  trigger,
  waitUntilReady,
  slowBudgetMs,
  requiredUrlPaths,
}: ReadinessTransitionOptions<T>) {
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const failedRequests: Array<{ error: string; method: string; url: string }> = [];
  const serverErrors: Array<{ method: string; status: number; url: string }> = [];
  const onRequestFailed = (request: Request) => {
    failedRequests.push({
      error: request.failure()?.errorText ?? "unknown request failure",
      method: request.method(),
      url: diagnosticUrl(request.url()),
    });
  };
  const onResponse = (response: Response) => {
    if (response.status() < 500) return;
    serverErrors.push({
      method: response.request().method(),
      status: response.status(),
      url: diagnosticUrl(response.url()),
    });
  };
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  let result: T | undefined;
  let transitionError: unknown;
  let readyDurationMs: number | null = null;
  let slowBudgetExceeded = false;
  try {
    result = await trigger();
    await waitUntilReady();
    readyDurationMs = Date.now() - startedAtMs;
    transitionError = readinessBudgetError(name, readyDurationMs, slowBudgetMs);
    slowBudgetExceeded = Boolean(transitionError);
    transitionError ??= requiredRequestFailureError(
      name,
      requiredUrlPaths,
      failedRequests,
      serverErrors,
    );
  } catch (error) {
    readyDurationMs = Date.now() - startedAtMs;
    transitionError = error;
  } finally {
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
    const diagnostic = {
      browser: await browserPerformance(page),
      durationMs: readyDurationMs ?? Date.now() - startedAtMs,
      error: transitionError ? errorDetails(transitionError) : null,
      failedRequests: failedRequests.slice(0, 20),
      name,
      outcome: slowBudgetExceeded ? "slow" : transitionError ? "failed" : "ready",
      serverErrors: serverErrors.slice(0, 20),
      slowBudgetMs: slowBudgetMs ?? null,
      slowBudgetExceeded,
      startedAt: startedAt.toISOString(),
    };
    try {
      await testInfo.attach(`readiness-${name}.json`, {
        body: Buffer.from(`${JSON.stringify(diagnostic, null, 2)}\n`),
        contentType: "application/json",
      });
    } catch (attachmentError) {
      if (!transitionError) transitionError = attachmentError;
    }
  }

  if (transitionError) throw transitionError;
  return result as T;
}
