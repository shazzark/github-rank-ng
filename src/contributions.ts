import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContributionStats } from './common/contributions.js';
import type { RankedUser } from './common/props.js';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const BATCH_SIZE = 10;
const PAGE_SIZE = 100;
const MAX_PULL_REQUEST_PAGES = 10;
const MAX_STAGE_DURATION_MS = 15 * 60 * 1000;
const RATE_LIMIT_RESERVE = 250;
const STATS_REUSE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRIES = 3;

export interface ContributionRuntime {
  rootDir?: string;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  monotonicNow?: () => number;
  maxStageDurationMs?: number;
  batchSize?: number;
  rateLimitReserve?: number;
  maxRetryDelayMs?: number;
}

interface GraphQLResult {
  data: Record<string, unknown>;
  rateLimit: { cost: number; remaining: number; resetAt: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const resetAt = Number(response.headers.get('x-ratelimit-reset'));
  if (response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(resetAt)) {
    return Math.max(1000, resetAt * 1000 - Date.now() + 1000);
  }
  return response.status === 403 || response.status === 429
    ? 60_000 * 2 ** attempt
    : 1000 * 2 ** attempt;
}

async function postGraphQL(
  query: string,
  variables: Record<string, unknown>,
  runtime: ContributionRuntime,
): Promise<GraphQLResult> {
  const fetcher = runtime.fetcher || fetch;
  const pause = runtime.wait || wait;
  let lastFailure = 'GitHub GraphQL request failed.';

  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
          ...(process.env.ACCESS_TOKEN ? { authorization: `Bearer ${process.env.ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      lastFailure = 'GitHub GraphQL network request failed.';
      if (attempt < RETRIES - 1) await pause(1000 * 2 ** attempt);
      continue;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.ok) throw new Error('GitHub GraphQL returned invalid JSON.');
      payload = null;
    }

    if (!response.ok) {
      lastFailure = `GitHub GraphQL request failed (${response.status}).`;
      if ([403, 429].includes(response.status) || response.status >= 500) {
        const delay = retryDelay(response, attempt);
        if (delay > (runtime.maxRetryDelayMs ?? 60_000)) throw new Error('GitHub GraphQL requested a rate-limit wait beyond the optional collection budget.');
        if (attempt < RETRIES - 1) await pause(delay);
        continue;
      }
      throw new Error(lastFailure);
    }

    if (!isRecord(payload)) throw new Error('GitHub GraphQL returned an invalid response.');
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      const message = payload.errors.map((error) => isRecord(error) && typeof error.message === 'string' ? error.message : '').join(' ');
      if (/rate limit|secondary rate/i.test(message)) {
        lastFailure = 'GitHub GraphQL rate limit reached.';
        const resetAt = Number(response.headers.get('x-ratelimit-reset'));
        const delay = response.headers.get('retry-after')
          ? Number(response.headers.get('retry-after')) * 1000
          : response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(resetAt)
            ? Math.max(1000, resetAt * 1000 - Date.now() + 1000)
            : 60_000 * 2 ** attempt;
        if (delay > (runtime.maxRetryDelayMs ?? 60_000)) throw new Error('GitHub GraphQL rate limit exceeded the optional collection retry budget.');
        if (attempt < RETRIES - 1) {
          await pause(delay);
          continue;
        }
      }
      throw new Error(lastFailure === 'GitHub GraphQL rate limit reached.' ? lastFailure : `GitHub GraphQL returned errors: ${message || 'unspecified error'}`);
    }

    const data = payload.data;
    const rateLimit = isRecord(data) ? data.rateLimit : undefined;
    if (!isRecord(data) || !isRecord(rateLimit)
      || integer(rateLimit.cost) === null || integer(rateLimit.remaining) === null
      || typeof rateLimit.resetAt !== 'string' || !Number.isFinite(Date.parse(rateLimit.resetAt))) {
      throw new Error('GitHub GraphQL returned missing or invalid rate-limit metadata.');
    }
    return { data, rateLimit: rateLimit as GraphQLResult['rateLimit'] };
  }

  throw new Error(lastFailure);
}

function buildBatchQuery(users: RankedUser[]): { query: string; variables: Record<string, unknown> } {
  const variableDefinitions = ['$from: DateTime!', '$to: DateTime!'];
  const fields = ['rateLimit { cost remaining resetAt }'];
  const variables: Record<string, unknown> = {};

  users.forEach((user, index) => {
    variableDefinitions.push(`$login${index}: String!`);
    variables[`login${index}`] = user.login;
    fields.push(`u${index}: user(login: $login${index}) {
      login
      contributionsCollection(from: $from, to: $to) {
        startedAt endedAt hasAnyRestrictedContributions
        contributionCalendar { totalContributions }
        totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions
        pullRequestContributions(first: ${PAGE_SIZE}) {
          totalCount pageInfo { hasNextPage endCursor }
          nodes {
            isRestricted occurredAt
            pullRequest { mergedAt repository { nameWithOwner isPrivate owner { login } licenseInfo { spdxId } } }
          }
        }
        commitContributionsByRepository(maxRepositories: ${PAGE_SIZE}) {
          repository { nameWithOwner isPrivate owner { login } licenseInfo { spdxId } }
        }
        issueContributionsByRepository(maxRepositories: ${PAGE_SIZE}) {
          repository { nameWithOwner isPrivate owner { login } licenseInfo { spdxId } }
        }
        pullRequestContributionsByRepository(maxRepositories: ${PAGE_SIZE}) {
          repository { nameWithOwner isPrivate owner { login } licenseInfo { spdxId } }
        }
        pullRequestReviewContributionsByRepository(maxRepositories: ${PAGE_SIZE}) {
          repository { nameWithOwner isPrivate owner { login } licenseInfo { spdxId } }
        }
      }
    }`);
  });

  return {
    query: `query(${variableDefinitions.join(', ')}) { ${fields.join('\n')} }`,
    variables,
  };
}

function buildPullRequestPageQuery(): string {
  return `query($login: String!, $from: DateTime!, $to: DateTime!, $after: String!) {
    rateLimit { cost remaining resetAt }
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        pullRequestContributions(first: ${PAGE_SIZE}, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            isRestricted occurredAt
            pullRequest { mergedAt repository { nameWithOwner isPrivate owner { login } licenseInfo { spdxId } } }
          }
        }
      }
    }
  }`;
}

function publicRepository(value: unknown): { name: string; owner: string; license: string | null } | null {
  if (!isRecord(value) || value.isPrivate !== false || !isRecord(value.owner)
    || typeof value.owner.login !== 'string' || typeof value.nameWithOwner !== 'string') return null;
  const licenseInfo = isRecord(value.licenseInfo) ? value.licenseInfo : null;
  return {
    name: value.nameWithOwner,
    owner: value.owner.login.toLowerCase(),
    license: licenseInfo && typeof licenseInfo.spdxId === 'string' ? licenseInfo.spdxId : null,
  };
}

function groupedRepositories(collection: Record<string, unknown>, field: string, login: string): { repositories: Map<string, { name: string; owner: string; license: string | null }>; capped: boolean } | null {
  const groups = collection[field];
  if (!Array.isArray(groups)) return null;
  const repositories = new Map<string, { name: string; owner: string; license: string | null }>();
  for (const group of groups) {
    if (!isRecord(group)) return null;
    const repository = publicRepository(group.repository);
    if (repository && repository.owner !== login.toLowerCase()) repositories.set(repository.name.toLowerCase(), repository);
  }
  return { repositories, capped: groups.length >= PAGE_SIZE };
}

function pullRequestNodes(connection: unknown, requireTotalCount = false): { nodes: Record<string, unknown>[]; hasNextPage: boolean; endCursor: string | null } | null {
  if (!isRecord(connection) || !Array.isArray(connection.nodes) || !isRecord(connection.pageInfo)
    || typeof connection.pageInfo.hasNextPage !== 'boolean'
    || (requireTotalCount && (!Number.isSafeInteger(connection.totalCount) || (connection.totalCount as number) < connection.nodes.length))) return null;
  const nodes = connection.nodes.filter(isRecord);
  if (nodes.length !== connection.nodes.length) return null;
  if (requireTotalCount && connection.totalCount !== nodes.length && connection.pageInfo.hasNextPage === false) return null;
  return {
    nodes,
    hasNextPage: connection.pageInfo.hasNextPage,
    endCursor: typeof connection.pageInfo.endCursor === 'string' ? connection.pageInfo.endCursor : null,
  };
}

function mergedPublicRepositories(nodes: Record<string, unknown>[], login: string): { mergedCount: number; externalMergedCount: number; codeRepos: Map<string, { name: string; owner: string; license: string | null }>; restricted: boolean } {
  let mergedCount = 0;
  let externalMergedCount = 0;
  const codeRepos = new Map<string, { name: string; owner: string; license: string | null }>();
  let restricted = false;
  for (const node of nodes) {
    if (node.isRestricted === true) {
      restricted = true;
      continue;
    }
    const pullRequest = node.pullRequest;
    if (!isRecord(pullRequest) || typeof pullRequest.mergedAt !== 'string') continue;
    const repository = publicRepository(pullRequest.repository);
    if (!repository) continue;
    mergedCount += 1;
    if (repository.owner === login.toLowerCase()) continue;
    externalMergedCount += 1;
    codeRepos.set(repository.name.toLowerCase(), repository);
  }
  return { mergedCount, externalMergedCount, codeRepos, restricted };
}

function makeBaseStats(user: RankedUser, from: string, to: string, now: string): ContributionStats {
  return {
    id: user.id,
    login: user.login,
    collectedAt: now,
    periodStartAt: from,
    periodEndAt: to,
    availability: 'unavailable',
    publicContributionActivity: null,
    pullRequestsOpened: null,
    pullRequestsMerged: null,
    issuesOpened: null,
    pullRequestsReviewed: null,
    externalPublicRepositories: null,
    verifiedExternalOpenSourceRepositories: null,
    publicRepositoryCount: user.public_repos,
  };
}

export function mapContributionStats(user: RankedUser, rawUser: unknown, from: string, to: string, collectedAt: string): ContributionStats {
  const stats = makeBaseStats(user, from, to, collectedAt);
  if (!isRecord(rawUser)) { stats.collectedAt = ''; return stats; }
  const collection = rawUser.contributionsCollection;
  if (!isRecord(collection)) { stats.collectedAt = ''; return stats; }
  if (typeof rawUser.login !== 'string' || rawUser.login.toLowerCase() !== user.login.toLowerCase()
    || typeof collection.startedAt !== 'string' || !Number.isFinite(Date.parse(collection.startedAt))
    || typeof collection.endedAt !== 'string' || !Number.isFinite(Date.parse(collection.endedAt))
    || Date.parse(collection.startedAt) !== Date.parse(from) || Date.parse(collection.endedAt) !== Date.parse(to)) {
    stats.collectedAt = '';
    return stats;
  }

  // GitHub can include restricted activity for tokens with read:user; suppress aggregates when flagged.
  if (collection.hasAnyRestrictedContributions !== false) {
    stats.availability = collection.hasAnyRestrictedContributions === true ? 'restricted' : 'unavailable';
    return stats;
  }

  let complete = collection.hasAnyRestrictedContributions === false;
  const calendar = isRecord(collection.contributionCalendar) ? collection.contributionCalendar : null;
  const activity = integer(calendar?.totalContributions);
  const opened = integer(collection.totalPullRequestContributions);
  const issues = integer(collection.totalIssueContributions);
  const reviews = integer(collection.totalPullRequestReviewContributions);
  stats.publicContributionActivity = activity;
  stats.pullRequestsOpened = opened;
  stats.issuesOpened = issues;
  stats.pullRequestsReviewed = reviews;
  if (activity === null || opened === null || issues === null || reviews === null || complete === false) complete = false;

  const prPage = pullRequestNodes(collection.pullRequestContributions, true);
  const commitRepos = groupedRepositories(collection, 'commitContributionsByRepository', user.login);
  const issueRepos = groupedRepositories(collection, 'issueContributionsByRepository', user.login);
  const openedPrRepos = groupedRepositories(collection, 'pullRequestContributionsByRepository', user.login);
  const reviewRepos = groupedRepositories(collection, 'pullRequestReviewContributionsByRepository', user.login);
  if (!prPage || !commitRepos || !issueRepos || !openedPrRepos || !reviewRepos) {
    stats.availability = 'partial';
    return stats;
  }

  const groups = [commitRepos, issueRepos, openedPrRepos, reviewRepos];
  const externalRepos = new Map<string, { name: string; owner: string; license: string | null }>();
  for (const group of groups) for (const [key, repository] of group.repositories) externalRepos.set(key, repository);
  stats.externalPublicRepositories = groups.some((group) => group.capped) ? null : externalRepos.size;

  const merged = mergedPublicRepositories(prPage.nodes, user.login);
  const mergedPagesComplete = !prPage.hasNextPage;
  stats.pullRequestsMerged = mergedPagesComplete && !merged.restricted ? merged.mergedCount : null;
  const allCodeRepos = new Map(commitRepos.repositories);
  for (const [key, repository] of merged.codeRepos) allCodeRepos.set(key, repository);
  stats.verifiedExternalOpenSourceRepositories = groups.some((group) => group.capped)
    || !mergedPagesComplete || merged.restricted
    ? null
    : [...allCodeRepos.values()].filter((repository) => repository.license !== null).length;

  if (stats.publicContributionActivity === null || stats.pullRequestsOpened === null
    || stats.issuesOpened === null || stats.pullRequestsReviewed === null
    || stats.pullRequestsMerged === null || stats.externalPublicRepositories === null
    || stats.verifiedExternalOpenSourceRepositories === null) complete = false;
  stats.availability = complete ? 'complete' : 'partial';
  return stats;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function validReusableStats(value: unknown, id: number, nowMs: number): value is ContributionStats {
  if (!isRecord(value) || value.id !== id || typeof value.login !== 'string'
    || !Number.isFinite(Date.parse(String(value.collectedAt)))
    || !Number.isFinite(Date.parse(String(value.periodStartAt)))
    || !Number.isFinite(Date.parse(String(value.periodEndAt)))
    || !['complete', 'partial', 'restricted', 'unavailable'].includes(String(value.availability))
    || !Number.isSafeInteger(value.publicRepositoryCount) || (value.publicRepositoryCount as number) < 0) return false;
  const metrics: (keyof ContributionStats)[] = [
    'publicContributionActivity', 'pullRequestsOpened', 'pullRequestsMerged', 'issuesOpened',
    'pullRequestsReviewed', 'externalPublicRepositories', 'verifiedExternalOpenSourceRepositories',
  ];
  if (metrics.some((key) => value[key] !== null && (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0))) return false;
  const age = nowMs - Date.parse(String(value.collectedAt));
  return age >= 0 && age < STATS_REUSE_MS;
}

export async function collectContributionStats(runtime: ContributionRuntime = {}): Promise<{ refreshed: number; reused: number }> {
  const rootDir = path.resolve(runtime.rootDir || process.cwd());
  const baselinePath = path.join(rootDir, '.baseline', 'contributions.json');
  const progressPath = path.join(rootDir, '.baseline', 'contributions-progress.json');
  const cachePath = path.join(rootDir, '.cache', 'contributions.json');
  const fromNow = runtime.now || (() => new Date());
  const pause = runtime.wait || wait;
  const nowDate = fromNow();
  const nowMs = nowDate.getTime();
  const now = nowDate.toISOString();
  const to = now;
  const from = new Date(nowMs - 365 * 24 * 60 * 60 * 1000).toISOString();
  const maxDuration = runtime.maxStageDurationMs ?? MAX_STAGE_DURATION_MS;
  const monotonicNow = runtime.monotonicNow || Date.now;
  const startedAt = monotonicNow();
  const baseline = await readJson<Record<string, unknown>>(baselinePath, {});
  const progress = await readJson<Record<string, unknown>>(progressPath, {});
  const users = await Promise.all(['users.json', 'users.nigeria.json'].map((file) => readJson<RankedUser[]>(path.join(rootDir, 'dist', file), [])));
  const unique = new Map<number, RankedUser>();
  for (const user of users.flat()) unique.set(user.id, user);

  const previousById = new Map<number, ContributionStats>();
  for (const stats of [...Object.values(baseline), ...Object.values(progress)]) {
    if (isRecord(stats) && Number.isSafeInteger(stats.id)) previousById.set(stats.id as number, stats as unknown as ContributionStats);
  }
  const merged = new Map<string, ContributionStats>();
  const due: RankedUser[] = [];
  let reused = 0;
  for (const user of unique.values()) {
    const prior = previousById.get(user.id);
    if (validReusableStats(prior, user.id, nowMs)) {
      merged.set(user.login.toLowerCase(), { ...prior, login: user.login, publicRepositoryCount: user.public_repos });
      reused += 1;
    } else {
      due.push(user);
    }
  }

  if (due.length === 0) {
    await writeJson(cachePath, Object.fromEntries(merged));
    await writeJson(progressPath, {});
    console.log(`Contribution snapshot reused for ${reused} profiles; no GraphQL requests were needed.`);
    return { refreshed: 0, reused };
  }
  if (!process.env.ACCESS_TOKEN) throw new Error('ACCESS_TOKEN is required for the optional public contribution snapshot.');

  let remaining: number | null = null;
  let estimatedCost = 1;
  let refreshed = 0;
  const batchSize = Math.min(10, Math.max(1, runtime.batchSize ?? BATCH_SIZE));
  for (let offset = 0; offset < due.length; offset += batchSize) {
    if (monotonicNow() - startedAt > maxDuration) throw new Error('Contribution collection exceeded its 15-minute optional-stage budget.');
    if (remaining !== null && remaining < estimatedCost + (runtime.rateLimitReserve ?? RATE_LIMIT_RESERVE)) {
      throw new Error('Contribution collection paused to preserve GitHub GraphQL rate-limit headroom.');
    }

    const batch = due.slice(offset, offset + batchSize);
    const built = buildBatchQuery(batch);
    built.variables.from = from;
    built.variables.to = to;
    const response = await postGraphQL(built.query, built.variables, runtime);
    remaining = response.rateLimit.remaining;
    estimatedCost = Math.max(estimatedCost, response.rateLimit.cost);

    const batchStats = batch.map((user, index) => mapContributionStats(user, response.data[`u${index}`], from, to, now));
    for (let index = 0; index < batch.length; index += 1) {
      const user = batch[index];
      const stats = batchStats[index];
      if (!user || !stats) throw new Error('Contribution response did not map to the requested profiles.');
      const profileData = response.data[`u${index}`];
      if (isRecord(profileData) && isRecord(profileData.contributionsCollection)) {
        const collection = profileData.contributionsCollection;
        let page = pullRequestNodes(collection.pullRequestContributions);
        let allNodes = page ? [...page.nodes] : [];
        let pageNumber = 1;
        while (page?.hasNextPage && page.endCursor && pageNumber < MAX_PULL_REQUEST_PAGES) {
          if (monotonicNow() - startedAt > maxDuration) throw new Error('Contribution collection exceeded its 15-minute optional-stage budget.');
          if (remaining !== null && remaining < estimatedCost + (runtime.rateLimitReserve ?? RATE_LIMIT_RESERVE)) {
            throw new Error('Contribution collection paused to preserve GitHub GraphQL rate-limit headroom.');
          }
          const nextPage = await postGraphQL(buildPullRequestPageQuery(), {
            login: user.login, from, to, after: page.endCursor,
          }, runtime);
          if (nextPage.rateLimit.remaining < nextPage.rateLimit.cost + (runtime.rateLimitReserve ?? RATE_LIMIT_RESERVE)) {
            throw new Error('Contribution collection paused to preserve GitHub GraphQL rate-limit headroom.');
          }
          remaining = nextPage.rateLimit.remaining;
          estimatedCost = Math.max(estimatedCost, nextPage.rateLimit.cost);
          const nextUser = isRecord(nextPage.data.user) ? nextPage.data.user : null;
          const nextCollection = nextUser && isRecord(nextUser.contributionsCollection) ? nextUser.contributionsCollection : null;
          const nextConnection = nextCollection ? pullRequestNodes(nextCollection.pullRequestContributions) : null;
          if (!nextConnection) {
            stats.pullRequestsMerged = null;
            stats.verifiedExternalOpenSourceRepositories = null;
            break;
          }
          allNodes = [...allNodes, ...nextConnection.nodes];
          page = nextConnection;
          pageNumber += 1;
        }
        if (page?.hasNextPage) {
          stats.pullRequestsMerged = null;
          stats.verifiedExternalOpenSourceRepositories = null;
          stats.availability = 'partial';
        } else if (page) {
          const mergedStats = mergedPublicRepositories(allNodes, user.login);
          stats.pullRequestsMerged = mergedStats.restricted ? null : mergedStats.mergedCount;
          const commitRepos = groupedRepositories(collection, 'commitContributionsByRepository', user.login);
          if (commitRepos && !commitRepos.capped && !mergedStats.restricted) {
            const codeRepos = new Map(commitRepos.repositories);
            for (const [key, repository] of mergedStats.codeRepos) codeRepos.set(key, repository);
            stats.verifiedExternalOpenSourceRepositories = [...codeRepos.values()].filter((repo) => repo.license !== null).length;
          }
        }
      }

      if (stats.pullRequestsMerged === null || stats.verifiedExternalOpenSourceRepositories === null) stats.availability = 'partial';
      stats.collectedAt = fromNow().toISOString();
      merged.set(user.login.toLowerCase(), stats);
      refreshed += 1;
    }
    for (const user of unique.values()) {
      const stats = merged.get(user.login.toLowerCase());
      if (stats) progress[user.login.toLowerCase()] = stats;
    }
    // Safe public metrics checkpoint lets later daily runs continue bounded enrichment.
    await writeJson(progressPath, progress);
    if (offset + batchSize < due.length) await pause(100);
  }

  const snapshot = Object.fromEntries([...unique.values()].map((user) => {
    const stats = merged.get(user.login.toLowerCase());
    return [user.login.toLowerCase(), stats || makeBaseStats(user, from, to, now)];
  }));
  await writeJson(cachePath, snapshot);
  await writeJson(progressPath, {});
  console.log(`Contribution collection completed for ${refreshed} profiles; reused ${reused}.`);
  return { refreshed, reused };
}
