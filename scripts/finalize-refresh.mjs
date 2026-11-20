import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const baselineDir = path.join(root, '.baseline');
const distDir = path.join(root, 'dist');
const contributionBaselinePath = path.join(baselineDir, 'contributions.json');
const contributionProgressPath = path.join(baselineDir, 'contributions-progress.json');
const contributionCachePath = path.join(root, '.cache', 'contributions.json');
const scopes = ['users.json', 'users.nigeria.json'];
const previous = new Map();

for (const file of scopes) {
  try {
    previous.set(file, JSON.parse(await readFile(path.join(baselineDir, file), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const summary = {
  updatedAt: new Date().toISOString(),
  methodology: 'Profiles returned by public GitHub user search, refreshed using current public profile data, then sorted by follower count descending with username and GitHub ID tie-breakers.',
  scopes: {},
};

const rankings = Object.fromEntries(await Promise.all(scopes.map(async (file) => [
  file === 'users.json' ? 'global' : 'nigeria',
  JSON.parse(await readFile(path.join(distDir, file), 'utf8')),
])));
const globalRankByLogin = Object.fromEntries(rankings.global.map((user) => [user.login.toLowerCase(), user.rank]));
const nigeriaRankByLogin = Object.fromEntries(rankings.nigeria.map((user) => [user.login.toLowerCase(), user.rank]));

async function readContributionSnapshot(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    console.warn(`Ignoring unreadable optional contribution snapshot at ${path.basename(filePath)}.`);
    return {};
  }
}

function validContributionRecord(record, user) {
  return record && record.id === user.id && typeof record.login === 'string'
    && record.login.toLowerCase() === user.login.toLowerCase()
    && ['complete', 'partial', 'restricted', 'unavailable'].includes(record.availability)
    && Number.isFinite(Date.parse(record.collectedAt))
    && Number.isFinite(Date.parse(record.periodStartAt))
    && Number.isFinite(Date.parse(record.periodEndAt))
    && Number.isSafeInteger(record.publicRepositoryCount)
    && ['publicContributionActivity', 'pullRequestsOpened', 'pullRequestsMerged', 'issuesOpened', 'pullRequestsReviewed', 'externalPublicRepositories', 'verifiedExternalOpenSourceRepositories']
      .every((key) => record[key] === null || Number.isSafeInteger(record[key]) && record[key] >= 0);
}

const cachedContributions = await readContributionSnapshot(contributionCachePath);
const progressContributions = await readContributionSnapshot(contributionProgressPath);
const baselineContributions = await readContributionSnapshot(contributionBaselinePath);
const contributionStats = {};
for (const user of [...rankings.global, ...rankings.nigeria]) {
  const key = user.login.toLowerCase();
  const record = [cachedContributions[key], progressContributions[key], baselineContributions[key]]
    .filter((candidate) => validContributionRecord(candidate, user))
    .sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt))[0];
  if (record) {
    contributionStats[key] = { ...record, publicRepositoryCount: user.public_repos };
  }
}

for (const file of scopes) {
  const current = JSON.parse(await readFile(path.join(distDir, file), 'utf8'));
  const old = previous.get(file) || [];
  const oldIds = new Set(old.map((user) => String(user.id)));
  const currentIds = new Set(current.map((user) => String(user.id)));
  let newlyDiscovered = 0;
  let retained = 0;
  for (const id of currentIds) {
    if (oldIds.has(id)) retained += 1;
    else newlyDiscovered += 1;
  }
  let removed = 0;
  for (const id of oldIds) if (!currentIds.has(id)) removed += 1;
  summary.scopes[file] = { totalProfiles: current.length, newlyDiscovered, retained, removed };
}

await writeFile(path.join(distDir, 'ranking-metadata.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const [file, key, usersKey, otherKey] of [['users.json', 'global', 'USERS', 'nigeria'], ['users.nigeria.json', 'nigeria', 'USERS_NIGERIA', 'global']]) {
  const metadata = summary.scopes[file];
  const otherUsers = rankings[otherKey].map(({ login, id, avatar_url, html_url, followers, public_repos, rank }) => ({ login, id, avatar_url, html_url, followers, public_repos, rank, contributionStats: contributionStats[login.toLowerCase()] || null }));
  await writeFile(path.join(distDir, `template.${key}.json`), `${JSON.stringify({ [usersKey]: rankings[key], OTHER_USERS: otherUsers, CONTRIBUTION_STATS: contributionStats, RANKING_META: { ...summary, ...metadata, globalRankByLogin, nigeriaRankByLogin } })}\n`);
}
await mkdir(baselineDir, { recursive: true });
for (const file of scopes) await copyFile(path.join(distDir, file), path.join(baselineDir, file));
if (Object.keys(contributionStats).length > 0) {
  try {
    await writeFile(contributionBaselinePath, `${JSON.stringify(contributionStats, null, 2)}\n`);
  } catch {
    console.warn('Could not save the optional contribution snapshot; follower rankings remain ready to publish.');
  }
}
