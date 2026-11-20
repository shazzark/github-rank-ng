import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectContributionStats, mapContributionStats } from '../lib/contributions.js';

const user = {
  id: 41, login: 'sample-dev', avatar_url: 'https://avatars.githubusercontent.com/u/41', html_url: 'https://github.com/sample-dev',
  type: 'User', name: null, company: null, blog: '', location: 'Nigeria', email: null, bio: null,
  public_repos: 8, public_gists: 0, followers: 90, following: 10, created_at: '2020-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z', rank: 1,
};

function collection(overrides = {}) {
  return {
    startedAt: '2025-11-20T00:00:00Z', endedAt: '2026-11-20T00:00:00Z', hasAnyRestrictedContributions: false,
    contributionCalendar: { totalContributions: 35 }, totalPullRequestContributions: 8,
    totalIssueContributions: 6, totalPullRequestReviewContributions: 4,
    pullRequestContributions: { totalCount: 2, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
      { isRestricted: false, occurredAt: '2026-06-01T00:00:00Z', pullRequest: { mergedAt: '2026-06-02T00:00:00Z', repository: { nameWithOwner: 'sample-dev/own', isPrivate: false, owner: { login: 'sample-dev' }, licenseInfo: { spdxId: 'MIT' } } } },
      { isRestricted: false, occurredAt: '2026-05-01T00:00:00Z', pullRequest: { mergedAt: null, repository: { nameWithOwner: 'org/community', isPrivate: false, owner: { login: 'org' }, licenseInfo: { spdxId: 'Apache-2.0' } } } },
    ] },
    commitContributionsByRepository: [{ repository: { nameWithOwner: 'org/commits', isPrivate: false, owner: { login: 'org' }, licenseInfo: { spdxId: 'MIT' } } }],
    issueContributionsByRepository: [], pullRequestContributionsByRepository: [], pullRequestReviewContributionsByRepository: [],
    ...overrides,
  };
}

test('contribution mapping separates opened and merged PRs and identifies external licensed code repositories', () => {
  const stats = mapContributionStats(user, { login: user.login, contributionsCollection: collection() }, '2025-11-20T00:00:00Z', '2026-11-20T00:00:00Z', '2026-11-20T00:00:00Z');
  assert.equal(stats.publicContributionActivity, 35);
  assert.equal(stats.pullRequestsOpened, 8);
  assert.equal(stats.pullRequestsMerged, 1);
  assert.equal(stats.issuesOpened, 6);
  assert.equal(stats.pullRequestsReviewed, 4);
  assert.equal(stats.externalPublicRepositories, 1);
  assert.equal(stats.verifiedExternalOpenSourceRepositories, 1);
  assert.equal(stats.publicRepositoryCount, 8);
  assert.equal(stats.availability, 'complete');
});

test('restricted activity and missing API fields are unavailable rather than reported as zero', () => {
  const from = '2025-11-20T00:00:00Z';
  const to = '2026-11-20T00:00:00Z';
  const restricted = mapContributionStats(user, { login: user.login, contributionsCollection: collection({ hasAnyRestrictedContributions: true }) }, from, to, to);
  assert.equal(restricted.availability, 'restricted');
  assert.equal(restricted.publicContributionActivity, null);
  const missing = mapContributionStats(user, { login: user.login, contributionsCollection: collection({ totalIssueContributions: undefined }) }, from, to, to);
  assert.equal(missing.issuesOpened, null);
  assert.equal(missing.availability, 'partial');
  const malformed = mapContributionStats(user, { login: user.login, contributionsCollection: collection({ pullRequestContributions: { totalCount: 3, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }) }, from, to, to);
  assert.equal(malformed.pullRequestsMerged, null);
  assert.equal(malformed.availability, 'partial');
  assert.equal(mapContributionStats(user, { login: 'different-user', contributionsCollection: collection() }, from, to, to).availability, 'unavailable');
});

async function setupProject(root) {
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', 'users.json'), JSON.stringify([user]));
  await writeFile(path.join(root, 'dist', 'users.nigeria.json'), JSON.stringify([user]));
}

test('contribution snapshot reuse avoids API calls while fresh and detects stale data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rank-contrib-'));
  const previousToken = process.env.ACCESS_TOKEN;
  process.env.ACCESS_TOKEN = 'test-token';
  try {
    await setupProject(root);
    await mkdir(path.join(root, '.baseline'), { recursive: true });
    const fresh = mapContributionStats(user, { login: user.login, contributionsCollection: collection() }, '2025-11-20T00:00:00Z', '2026-11-20T00:00:00Z', '2026-11-20T00:00:00Z');
    await writeFile(path.join(root, '.baseline', 'contributions.json'), JSON.stringify({ [user.login]: fresh }));
    let calls = 0;
    const result = await collectContributionStats({ rootDir: root, now: () => new Date('2026-11-20T00:00:00Z'), fetcher: async () => { calls += 1; throw new Error('unexpected request'); } });
    assert.deepEqual(result, { refreshed: 0, reused: 1 });
    assert.equal(calls, 0);
    const cache = JSON.parse(await readFile(path.join(root, '.cache', 'contributions.json'), 'utf8'));
    assert.equal(cache[user.login]['publicContributionActivity'], 35);
    const stale = { ...fresh, collectedAt: '2026-11-12T00:00:00Z' };
    await writeFile(path.join(root, '.baseline', 'contributions.json'), JSON.stringify({ [user.login]: stale }));
    const refreshed = await collectContributionStats({
      rootDir: root, now: () => new Date('2026-11-20T00:00:00Z'), wait: async () => {},
      fetcher: async () => Response.json({ data: {
        rateLimit: { cost: 1, remaining: 5000, resetAt: '2026-11-20T01:00:00Z' },
        u0: { login: user.login, contributionsCollection: collection() },
      } }),
    });
    assert.deepEqual(refreshed, { refreshed: 1, reused: 0 });
  } finally {
    if (previousToken === undefined) delete process.env.ACCESS_TOKEN;
    else process.env.ACCESS_TOKEN = previousToken;
    await rm(root, { recursive: true, force: true });
  }
});

test('GraphQL retries transient failures and fails closed on exhausted rate limits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rank-contrib-'));
  const previousToken = process.env.ACCESS_TOKEN;
  process.env.ACCESS_TOKEN = 'test-token';
  try {
    await setupProject(root);
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      if (calls === 1) return new Response('temporary', { status: 500 });
      return Response.json({ data: {
        rateLimit: { cost: 1, remaining: 5000, resetAt: '2026-11-20T01:00:00Z' },
        u0: { login: user.login, contributionsCollection: collection() },
      } });
    };
    await collectContributionStats({ rootDir: root, now: () => new Date('2026-11-20T00:00:00Z'), fetcher, wait: async () => {} });
    assert.equal(calls, 2);
    await rm(path.join(root, '.cache'), { recursive: true, force: true });
    await assert.rejects(collectContributionStats({
      rootDir: root, now: () => new Date('2026-11-20T00:00:00Z'), maxRetryDelayMs: 0, wait: async () => {},
      fetcher: async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '60' } }),
    }), /rate-limit wait/);
    await assert.rejects(readFile(path.join(root, '.cache', 'contributions.json')));
  } finally {
    if (previousToken === undefined) delete process.env.ACCESS_TOKEN;
    else process.env.ACCESS_TOKEN = previousToken;
    await rm(root, { recursive: true, force: true });
  }
});

test('a missing restricted-activity flag withholds every contribution metric', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rank-contrib-'));
  const previousToken = process.env.ACCESS_TOKEN;
  process.env.ACCESS_TOKEN = 'test-token';
  try {
    await setupProject(root);
    await collectContributionStats({
      rootDir: root, now: () => new Date('2026-11-20T00:00:00Z'), wait: async () => {},
      fetcher: async () => Response.json({ data: {
        rateLimit: { cost: 1, remaining: 5000, resetAt: '2026-11-20T01:00:00Z' },
        u0: { login: user.login, contributionsCollection: collection({ hasAnyRestrictedContributions: undefined }) },
      } }),
    });
    const snapshot = JSON.parse(await readFile(path.join(root, '.cache', 'contributions.json'), 'utf8'));
    const stats = snapshot[user.login];
    assert.equal(stats.availability, 'unavailable');
    assert.equal(stats.pullRequestsMerged, null);
    assert.equal(stats.verifiedExternalOpenSourceRepositories, null);
    for (const field of ['publicContributionActivity', 'pullRequestsOpened', 'issuesOpened', 'pullRequestsReviewed', 'externalPublicRepositories']) {
      assert.equal(stats[field], null);
    }
  } finally {
    if (previousToken === undefined) delete process.env.ACCESS_TOKEN;
    else process.env.ACCESS_TOKEN = previousToken;
    await rm(root, { recursive: true, force: true });
  }
});

test('a bounded run persists completed profile checkpoints without creating a publishable complete snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rank-contrib-'));
  const previousToken = process.env.ACCESS_TOKEN;
  process.env.ACCESS_TOKEN = 'test-token';
  const secondUser = { ...user, id: 42, login: 'second-dev' };
  let clock = 0;
  try {
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(path.join(root, 'dist', 'users.json'), JSON.stringify([user, secondUser]));
    await writeFile(path.join(root, 'dist', 'users.nigeria.json'), JSON.stringify([]));
    await assert.rejects(collectContributionStats({
      rootDir: root, batchSize: 1, maxStageDurationMs: 1, monotonicNow: () => clock,
      now: () => new Date('2026-11-20T00:00:00Z'), wait: async () => {},
      fetcher: async (_url, init) => {
        const variables = JSON.parse(init.body).variables;
        clock += 2;
        return Response.json({ data: {
          rateLimit: { cost: 1, remaining: 5000, resetAt: '2026-11-20T01:00:00Z' },
          u0: { login: variables.login0, contributionsCollection: collection() },
        } });
      },
    }), /15-minute optional-stage budget/);
    const progress = JSON.parse(await readFile(path.join(root, '.baseline', 'contributions-progress.json'), 'utf8'));
    assert.deepEqual(Object.keys(progress), ['sample-dev']);
    assert.equal(progress['sample-dev'].availability, 'complete');
    await assert.rejects(readFile(path.join(root, '.cache', 'contributions.json')));
  } finally {
    if (previousToken === undefined) delete process.env.ACCESS_TOKEN;
    else process.env.ACCESS_TOKEN = previousToken;
    await rm(root, { recursive: true, force: true });
  }
});
