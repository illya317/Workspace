import { chromium, type Browser, type LaunchOptions } from "playwright";

type BrowserTask<T> = (browser: Browser) => Promise<T>;

/**
 * Lifecycle boundary for standalone Playwright scripts.
 * Prefer @playwright/test fixtures for repository E2E tests.
 */
export async function withPlaywrightBrowser<T>(
  task: BrowserTask<T>,
  options?: LaunchOptions,
): Promise<T> {
  let browser: Browser | undefined;
  let closePromise: Promise<void> | undefined;

  const closeBrowser = (): Promise<void> => {
    if (!browser) return Promise.resolve();
    closePromise ??= browser.close().catch(() => undefined);
    return closePromise;
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    void closeBrowser().finally(() => {
      process.exitCode = signal === "SIGINT" ? 130 : 143;
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    browser = await chromium.launch(options);
    return await task(browser);
  } finally {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    await closeBrowser();
  }
}
