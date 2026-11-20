import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import test from 'node:test';
import { contributionStatsAreStale, filterUsers, findRankedUser, navigateToRankedUser, normalizeUsername, pageForUser, paginate, safeGitHubUrl, shareableRankUrl } from '../template/pagination.js';

const users = Array.from({ length: 101 }, (_, index) => ({
  username: `developer-${index + 1}`,
  rank: index + 1,
}));

test('pagination reports boundaries and keeps original global ranks', () => {
  const first = paginate(users, 1);
  const last = paginate(users, 3);
  assert.equal(first.pageCount, 3);
  assert.equal(first.currentPage, 1);
  assert.equal(first.items.length, 50);
  assert.equal(first.items[0].rank, 1);
  assert.equal(last.currentPage, 3);
  assert.equal(last.items.length, 1);
  assert.equal(last.items[0].rank, 101);
  assert.equal(paginate(users, 99).currentPage, 3);
});

test('username filtering searches the entire dataset and pagination uses filtered results', () => {
  const results = filterUsers(users, 'DEVELOPER-10');
  const page = paginate(results, 1);
  assert.deepEqual(results.map(({ username }) => username), [
    'developer-10', 'developer-100', 'developer-101',
  ]);
  assert.equal(page.total, 3);
  assert.equal(page.pageCount, 1);
  assert.equal(page.items[0].rank, 10);
});

test('empty searches have no current page and no result rows', () => {
  const results = filterUsers(users, 'missing-user');
  const page = paginate(results, 1);
  assert.equal(page.total, 0);
  assert.equal(page.pageCount, 0);
  assert.equal(page.currentPage, 0);
  assert.deepEqual(page.items, []);
});

test('Nigeria records use the same pagination and search behavior', () => {
  const nigeria = users.filter(({ rank }) => rank % 2 === 0);
  const second = paginate(nigeria, 2);
  assert.equal(second.items.length, 50);
  assert.equal(second.items.at(-1).rank, 100);
  assert.equal(filterUsers(nigeria, 'developer-100').length, 1);
});

test('Find My Rank normalizes @ usernames and requires an exact match', () => {
  assert.equal(normalizeUsername('  @Developer-10  '), 'developer-10');
  assert.equal(findRankedUser(users, '@DEVELOPER-10').rank, 10);
  assert.equal(findRankedUser([users[9]], 'developer-1'), null);
  assert.equal(normalizeUsername('@bad--name'), null);
  assert.equal(findRankedUser(users, 'not-listed'), null);
});

test('Find My Rank navigates to first and last user pages without changing ranks', () => {
  assert.equal(pageForUser(users, 'developer-1'), 1);
  assert.deepEqual(navigateToRankedUser(users, 'developer-101'), { user: users[100], page: 3 });
  assert.equal(navigateToRankedUser(users, 'unknown'), null);
  assert.equal(navigateToRankedUser(users, 'developer-101').user.rank, 101);
});

test('rank links are shareable and external profile URLs are restricted to expected HTTPS hosts', () => {
  assert.equal(shareableRankUrl('https://example.test/index.html', '@Developer-10'), 'https://example.test/index.html?user=developer-10');
  assert.equal(shareableRankUrl('https://example.test/index.html', 'bad--name'), null);
  assert.equal(safeGitHubUrl('https://github.com/developer-10', 'github.com'), 'https://github.com/developer-10');
  assert.equal(safeGitHubUrl('javascript:alert(1)', 'github.com'), null);
  assert.equal(safeGitHubUrl('https://evil.example/avatar.png', 'avatars.githubusercontent.com'), null);
});

test('contribution freshness is explicit after the seven-day reuse window', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  assert.equal(contributionStatsAreStale({ collectedAt: '2026-11-13T00:00:00Z' }, now), false);
  assert.equal(contributionStatsAreStale({ collectedAt: '2026-11-12T23:59:59Z' }, now), true);
  assert.equal(contributionStatsAreStale({ collectedAt: 'missing' }, now), true);
});

test('leaderboard rendering escapes profile content, script JSON and rejects unsafe profile URLs', async () => {
  const source = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '../template/_partial/user_table.ejs'), 'utf8');
  const hostile = { ...users[0], login: '<script>alert(1)</script>', html_url: 'javascript:alert(1)', avatar_url: 'data:text/html,x' };
  const html = ejs.render(source, {
    users: [hostile], usersType: 'global', type: 'global', membershipLabel: 'Global leaderboard',
    searchUrl: 'https://github.com/search', OTHER_USERS: [{ login: '</script><script>alert(2)</script>' }],
    CONTRIBUTION_STATS: {},
    RANKING_META: { globalRankByLogin: {}, nigeriaRankByLogin: {} },
  });
  assert.ok(html.includes('href="https://github.com/%3Cscript%3Ealert(1)%3C%2Fscript%3E"'));
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /src="data:text\/html/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /\\u003c\/script>/);
});
