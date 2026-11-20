import 'dotenv/config';
import type { UserProfile, UserSearchResult } from '../common/props.js';

const API_ROOT = 'https://api.github.com';
export const USER_SEARCH_PAGE_SIZE = 100;
const MAX_HTTP_ATTEMPTS = 4;
const MAX_INCOMPLETE_ATTEMPTS = 3;

export interface UserSearchPage {
  total_count: number;
  incomplete_results: boolean;
  items: UserSearchResult[];
}

export interface ApiRuntime {
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
  maxHttpAttempts?: number;
  maxIncompleteAttempts?: number;
  requestTimeoutMs?: number;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

function getHeaders(authenticated: boolean): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (authenticated && process.env.ACCESS_TOKEN) {
    headers.authorization = `Bearer ${process.env.ACCESS_TOKEN}`;
  }
  return headers;
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, retryIndex: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(0, retryDate - Date.now());
  }

  if (response.headers.get('x-ratelimit-remaining') === '0') {
    const resetAt = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(resetAt)) return Math.max(1000, resetAt * 1000 - Date.now() + 1000);
  }

  if (response.status === 403 || response.status === 429) {
    // GitHub asks clients without a reset hint to wait at least a minute for secondary limits.
    return 60_000 * 2 ** retryIndex;
  }
  return 1000 * 2 ** retryIndex;
}

export async function requestJson<T>(
  url: URL,
  authenticated: boolean,
  runtime: ApiRuntime = {},
): Promise<T> {
  const fetcher = runtime.fetcher || fetch;
  const wait = runtime.wait || defaultWait;
  const attempts = runtime.maxHttpAttempts ?? MAX_HTTP_ATTEMPTS;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: getHeaders(authenticated),
        signal: AbortSignal.timeout(runtime.requestTimeoutMs ?? 30_000),
      });
    } catch {
      if (attempt === attempts - 1) {
        throw new GitHubApiError(`GitHub API network request failed for ${url.pathname}`);
      }
      await wait(1000 * 2 ** attempt);
      continue;
    }

    if (!response.ok) {
      lastStatus = response.status;
      const retryable = response.status === 403 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts - 1) {
        throw new GitHubApiError(`GitHub API request failed (${response.status}) for ${url.pathname}`, response.status);
      }
      await wait(retryDelay(response, attempt));
      continue;
    }

    try {
      return await response.json() as T;
    } catch {
      throw new GitHubApiError(`GitHub API returned invalid JSON for ${url.pathname}`, response.status);
    }
  }

  throw new GitHubApiError(`GitHub API request failed${lastStatus ? ` (${lastStatus})` : ''} for ${url.pathname}`, lastStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSearchResult(value: unknown): value is UserSearchResult {
  if (!isRecord(value)) return false;
  return typeof value.login === 'string'
    && Number.isSafeInteger(value.id)
    && (value.type === 'User' || value.type === 'Organization');
}

export async function getUserData(
  page: number,
  location: string | undefined,
  minimumFollowers: number,
  runtime: ApiRuntime = {},
): Promise<UserSearchPage> {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('GitHub search page must be a positive integer.');
  if (!Number.isInteger(minimumFollowers) || minimumFollowers < 0) throw new RangeError('Minimum followers must be a non-negative integer.');

  const url = new URL('/search/users', API_ROOT);
  const locationQualifier = location
    ? ` location:${/\s/.test(location) ? `"${location}"` : location}`
    : '';
  url.searchParams.set('q', `followers:>=${minimumFollowers}${locationQualifier}`);
  url.searchParams.set('sort', 'followers');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(USER_SEARCH_PAGE_SIZE));

  const maxAttempts = runtime.maxIncompleteAttempts ?? MAX_INCOMPLETE_ATTEMPTS;
  const wait = runtime.wait || defaultWait;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await requestJson<unknown>(url, false, runtime);
    if (!isRecord(result)
      || !Number.isInteger(result.total_count)
      || typeof result.incomplete_results !== 'boolean'
      || !Array.isArray(result.items)
      || !result.items.every(isSearchResult)) {
      throw new GitHubApiError(`GitHub returned an invalid user-search response for page ${page}.`);
    }

    const searchPage = result as unknown as UserSearchPage;
    if (!searchPage.incomplete_results) return searchPage;
    if (attempt < maxAttempts - 1) await wait(1000 * 2 ** attempt);
  }

  throw new GitHubApiError(`GitHub user search remained incomplete for page ${page}.`);
}

export async function getUserInfoData(username: string, runtime: ApiRuntime = {}): Promise<UserProfile> {
  const url = new URL(`/users/${encodeURIComponent(username)}`, API_ROOT);
  const profile = await requestJson<unknown>(url, true, runtime);
  if (!isRecord(profile)
    || typeof profile.login !== 'string'
    || !Number.isSafeInteger(profile.id)
    || profile.type !== 'User'
    || !Number.isInteger(profile.followers)
    || (profile.followers as number) < 0) {
    throw new GitHubApiError(`GitHub returned an invalid user profile for ${url.pathname}.`);
  }
  return profile as unknown as UserProfile;
}

export function sleep(milliseconds: number): Promise<void> {
  return defaultWait(milliseconds);
}
