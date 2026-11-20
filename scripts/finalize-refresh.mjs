import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const baselineDir = path.join(root, '.baseline');
const distDir = path.join(root, 'dist');
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
for (const [file, key, usersKey] of [['users.json', 'global', 'USERS'], ['users.nigeria.json', 'nigeria', 'USERS_NIGERIA']]) {
  const metadata = summary.scopes[file];
  await writeFile(path.join(distDir, `template.${key}.json`), `${JSON.stringify({ [usersKey]: JSON.parse(await readFile(path.join(distDir, file), 'utf8')), RANKING_META: { ...summary, ...metadata } })}\n`);
}
await mkdir(baselineDir, { recursive: true });
for (const file of scopes) await copyFile(path.join(distDir, file), path.join(baselineDir, file));
