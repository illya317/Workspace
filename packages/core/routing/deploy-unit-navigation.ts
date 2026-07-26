import { workspacePath } from "./api-path";

const DEPLOY_UNIT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface DeployUnitNavigationManifest {
  schemaVersion: 1;
  units: Array<{
    id: string;
    pagePrefixes: string[];
  }>;
}

export interface WorkspaceNavigationTarget {
  href: string;
  mode: "external" | "hard" | "soft";
  targetUnitId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNormalizedPagePrefix(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.includes("//")
    && (value === "/" || !value.endsWith("/"));
}

export function parseDeployUnitNavigationManifest(
  rawValue: string | undefined,
): DeployUnitNavigationManifest | null {
  if (!rawValue) return null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.units)) return null;
    const seenIds = new Set<string>();
    const units: DeployUnitNavigationManifest["units"] = [];
    for (const candidate of parsed.units) {
      if (!isRecord(candidate)
        || typeof candidate.id !== "string"
        || !DEPLOY_UNIT_ID_PATTERN.test(candidate.id)
        || seenIds.has(candidate.id)
        || !Array.isArray(candidate.pagePrefixes)
        || !candidate.pagePrefixes.every(isNormalizedPagePrefix)) {
        return null;
      }
      seenIds.add(candidate.id);
      units.push({ id: candidate.id, pagePrefixes: [...new Set(candidate.pagePrefixes)] });
    }
    return { schemaVersion: 1, units };
  } catch {
    return null;
  }
}

export function currentDeployUnitId(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_DEPLOY_UNIT_ID,
): string | null {
  return rawValue && DEPLOY_UNIT_ID_PATTERN.test(rawValue) ? rawValue : null;
}

function internalPathname(href: string): string | null {
  if (href.startsWith("#") || href.startsWith("?")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const pathname = href.split(/[?#]/, 1)[0] || "/";
  const publicPath = workspacePath(pathname);
  return publicPath || "/";
}

function prefixMatches(pathname: string, prefix: string) {
  const publicPrefix = workspacePath(prefix);
  return pathname === publicPrefix || (publicPrefix !== "/" && pathname.startsWith(`${publicPrefix}/`));
}

export function deployUnitIdForHref(
  href: string,
  manifest: DeployUnitNavigationManifest | null,
): string | null {
  const pathname = internalPathname(href);
  if (pathname === null || pathname === "" || !manifest) return null;
  let bestMatch: { id: string; length: number } | null = null;
  for (const unit of manifest.units) {
    for (const prefix of unit.pagePrefixes) {
      if (!prefixMatches(pathname, prefix)) continue;
      const length = workspacePath(prefix).length;
      if (!bestMatch || length > bestMatch.length) bestMatch = { id: unit.id, length };
    }
  }
  return bestMatch?.id ?? null;
}

export function resolveWorkspaceNavigationTarget(
  href: string,
  options: {
    currentUnitId?: string | null;
    manifest?: DeployUnitNavigationManifest | null;
  } = {},
): WorkspaceNavigationTarget {
  const pathname = internalPathname(href);
  if (pathname === null) return { href, mode: "external", targetUnitId: null };
  if (pathname === "") return { href, mode: "soft", targetUnitId: options.currentUnitId ?? currentDeployUnitId() };

  const currentUnit = options.currentUnitId === undefined
    ? currentDeployUnitId()
    : options.currentUnitId;
  if (!currentUnit) return { href, mode: "soft", targetUnitId: null };

  const manifest = options.manifest === undefined
    ? parseDeployUnitNavigationManifest(process.env.NEXT_PUBLIC_DEPLOY_UNIT_NAVIGATION)
    : options.manifest;
  const targetUnitId = deployUnitIdForHref(href, manifest);
  if (targetUnitId === currentUnit) return { href, mode: "soft", targetUnitId };

  // An independently deployed zone must fail safe through the gateway when the
  // manifest cannot classify a route. The monolith has no current unit id and
  // therefore retains client-side navigation during the migration window.
  return { href: workspacePath(href), mode: "hard", targetUnitId };
}
