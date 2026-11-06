import { APP_VERSION, GITHUB_LATEST_RELEASE_API, GITHUB_RELEASES_URL } from '../version';

export interface UpdateCheckResult {
  status: 'idle' | 'checking' | 'latest' | 'update_available' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
  publishedAt?: string;
  lastChecked?: number;
  error?: string;
}

/**
 * Compares two semantic version strings (e.g. 'v0.1.0' vs 'v0.1.1').
 * Returns:
 *   1 if target > current (target is newer / update available)
 *  -1 if target < current (current is newer)
 *   0 if equal
 */
export function compareSemver(current: string, target: string): number {
  const parse = (v: string): number[] => {
    const clean = v.trim().replace(/^v/i, '');
    const [nums] = clean.split('-');
    const parts = (nums || '').split('.').map((n) => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
  };

  const [cMaj, cMin, cPatch] = parse(current);
  const [tMaj, tMin, tPatch] = parse(target);

  if (tMaj !== cMaj) return tMaj > cMaj ? 1 : -1;
  if (tMin !== cMin) return tMin > cMin ? 1 : -1;
  if (tPatch !== cPatch) return tPatch > cPatch ? 1 : -1;
  return 0;
}

const STORAGE_KEY = 'ordercraft_update_check';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache to avoid GitHub unauthenticated rate limits

export async function checkGitHubUpdate(
  currentVer: string = APP_VERSION,
  force = false
): Promise<UpdateCheckResult> {
  // 1. Check local cache if not forced
  if (!force) {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as UpdateCheckResult;
        if (parsed.lastChecked && Date.now() - parsed.lastChecked < CACHE_TTL_MS) {
          const isNewer = parsed.latestVersion
            ? compareSemver(currentVer, parsed.latestVersion) > 0
            : false;
          return {
            ...parsed,
            currentVersion: currentVer,
            status: isNewer ? 'update_available' : 'latest',
          };
        }
      }
    } catch {}
  }

  // 2. Fetch latest release from GitHub API
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}`);
    }

    const data = await res.json();
    const latestTag = (data.tag_name || data.name || '').trim();
    const releaseUrl = data.html_url || `${GITHUB_RELEASES_URL}/latest`;

    const isNewer = latestTag ? compareSemver(currentVer, latestTag) > 0 : false;
    const result: UpdateCheckResult = {
      status: isNewer ? 'update_available' : 'latest',
      currentVersion: currentVer,
      latestVersion: latestTag,
      releaseUrl,
      releaseName: data.name || latestTag,
      publishedAt: data.published_at,
      lastChecked: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {}

    return result;
  } catch (err: any) {
    const errorResult: UpdateCheckResult = {
      status: 'error',
      currentVersion: currentVer,
      error: err?.message || 'Failed to check for updates',
      lastChecked: Date.now(),
    };
    return errorResult;
  }
}
