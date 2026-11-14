import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { enrichUserCandidates, fetchUserCandidates, uniqueUsers } from '../lib/pipeline.js';
import { getUserData } from '../lib/utils/index.js';

function searchUser(login, id, type = 'User') {
  return { login, id, type, avatar_url: `https://avatars.example/${login}`, html_url: `https://github.com/${login}` };
}

function profile(login, id, followers) {
  return {
    ...searchUser(login, id), name: null, company: null, blog: '', location: 'Nigeria', email: null,
    bio: null, public_repos: 0, public_gists: 0, followers, following: 0,
    created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z',
  };
}

async function tempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'github-rank-ng-'));
}

test('search query preserves response metadata, threshold and quoted city qualifiers', async () => {
  let requested;
  const page = await getUserData(2, 'Port Harcourt', 75, {
    fetcher: async (url, init) => {
      requested = { url: new URL(url), init };
      return Response.json({ total_count: 1, incomplete_results: false, items: [searchUser('dev', 1)] });
    },
  });

  assert.equal(requested.url.searchParams.get('q'), 'followers:>=75 location:"Port Harcourt"');
  assert.equal(requested.url.searchParams.get('page'), '2');
  assert.equal(requested.url.searchParams.get('per_page'), '100');
  assert.equal(requested.init.headers.authorization, undefined);
  assert.equal(page.total_count, 1);
  assert.equal(page.incomplete_results, false);
  assert.equal(page.items[0].login, 'dev');
});

test('search retries incomplete results and rate limits using retry hints', async () => {
  const waits = [];
  let calls = 0;
  const page = await getUserData(1, 'Nigeria', 100, {
    wait: async (ms) => waits.push(ms),
    fetcher: async () => {
      calls += 1;
      if (calls === 1) return new Response('', { status: 429, headers: { 'retry-after': '2' } });
      return Response.json({ total_count: 0, incomplete_results: true, items: [] });
    },
    maxIncompleteAttempts: 2,
  }).catch(async (error) => {
    assert.match(error.message, /remained incomplete/);
    return null;
  });
  assert.equal(page, null);
  assert.deepEqual(waits, [2000, 1000]);
  assert.equal(calls, 3);
});

test('candidate pagination follows API totals despite filtered organization pages and deduplicates overlap', async () => {
  const rootDir = await tempProject();
  const calls = [];
  const users = Array.from({ length: 100 }, (_, i) => searchUser(`u${i}`, i + 1));
  try {
    const result = await fetchUserCandidates('nigeria', {
      rootDir, locations: ['Nigeria', 'Lagos'], minimumFollowers: 50, searchRequestDelayMs: 0,
      searchUsers: async (page, location, threshold) => {
        calls.push({ page, location, threshold });
        if (location === 'Nigeria' && page === 1) return { total_count: 205, incomplete_results: false, items: [...users, searchUser('org', 2000, 'Organization')] };
        if (location === 'Nigeria' && page === 2) return { total_count: 205, incomplete_results: false, items: Array.from({ length: 100 }, (_, i) => searchUser(`org${i}`, 3000 + i, 'Organization')) };
        if (location === 'Nigeria' && page === 3) return { total_count: 205, incomplete_results: false, items: [searchUser('tail', 500)] };
        return { total_count: 2, incomplete_results: false, items: [users[0], searchUser('lagos', 900)] };
      },
    });
    assert.deepEqual(calls.map(({ location, page }) => [location, page]), [['Nigeria', 1], ['Nigeria', 2], ['Nigeria', 3], ['Lagos', 1]]);
    assert.equal(calls.every((call) => call.threshold === 50), true);
    assert.equal(result.length, 102);
    assert.equal(result.some((user) => user.type === 'Organization'), false);
    assert.equal(result.filter((user) => user.id === 1).length, 1);
    const cached = JSON.parse(await readFile(path.join(rootDir, '.cache/users.nigeria.json'), 'utf8'));
    assert.equal(cached.length, 102);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('candidate search resumes from its last completed page after interruption', async () => {
  const rootDir = await tempProject();
  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, i) => searchUser(`r${i}`, i + 1));
  try {
    await assert.rejects(fetchUserCandidates('nigeria', {
      rootDir, locations: ['Nigeria'], minimumFollowers: 0, searchRequestDelayMs: 0,
      searchUsers: async (page) => {
        calls.push(page);
        if (page === 2) throw new Error('simulated search interruption');
        return { total_count: 150, incomplete_results: false, items: firstPage };
      },
    }), /simulated search interruption/);

    const result = await fetchUserCandidates('nigeria', {
      rootDir, locations: ['Nigeria'], minimumFollowers: 0, searchRequestDelayMs: 0,
      searchUsers: async (page) => {
        calls.push(page);
        return { total_count: 150, incomplete_results: false, items: page === 2 ? Array.from({ length: 50 }, (_, i) => searchUser(`tail${i}`, 101 + i)) : firstPage };
      },
    });
    assert.deepEqual(calls, [1, 2, 2]);
    assert.equal(result.length, 150);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('enrichment resumes after interruption and ranks deterministically with contiguous ranks', async () => {
  const rootDir = await tempProject();
  try {
    await fetchUserCandidates('nigeria', {
      rootDir, locations: ['Nigeria'], minimumFollowers: 0, searchRequestDelayMs: 0,
      searchUsers: async () => ({ total_count: 3, incomplete_results: false, items: [searchUser('zeta', 3), searchUser('beta', 2), searchUser('alpha', 1)] }),
    });

    let calls = 0;
    await assert.rejects(enrichUserCandidates('nigeria', [], {
      rootDir, profileRequestDelayMs: 0,
      getProfile: async (login) => {
        calls += 1;
        if (login === 'beta') throw new Error('simulated interruption');
        return profile(login, login === 'zeta' ? 3 : 1, login === 'zeta' ? 180 : 100);
      },
    }), /simulated interruption/);
    assert.equal(calls, 2);

    const resumed = await enrichUserCandidates('nigeria', [], {
      rootDir, profileRequestDelayMs: 0,
      getProfile: async (login) => profile(login, login === 'zeta' ? 3 : login === 'beta' ? 2 : 1, login === 'zeta' ? 180 : 100),
    });
    assert.deepEqual(resumed.map(({ login, rank }) => [login, rank]), [['zeta', 1], ['alpha', 2], ['beta', 3]]);
    const output = JSON.parse(await readFile(path.join(rootDir, 'dist/users.nigeria.json'), 'utf8'));
    assert.deepEqual(output.map(({ rank }) => rank), [1, 2, 3]);
    assert.equal(new Set(output.map(({ id }) => id)).size, output.length);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('identity deduplication uses stable IDs and normalized logins', () => {
  assert.deepEqual(uniqueUsers([searchUser('Ada', 1), searchUser('renamed', 1), searchUser('ada', 3)]).map(({ login }) => login), ['Ada']);
});
