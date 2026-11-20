import assert from 'node:assert/strict';
import test from 'node:test';
import { filterUsers, paginate } from '../template/pagination.js';

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
