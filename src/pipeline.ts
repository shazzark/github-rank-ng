import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RankedUser, UserProfile, UserSearchResult } from './common/props.js';
import {
  getUserData,
  getUserInfoData,
  GitHubApiError,
  sleep,
  USER_SEARCH_PAGE_SIZE,
  type UserSearchPage,
} from './utils/index.js';

export const NIGERIA_SEARCH_LOCATIONS = [
  'Nigeria',
  'Lagos',
  'Abuja',
  'Enugu',
  'Port Harcourt',
  'Ibadan',
  'Kano',
  'Kaduna',
  'Jos',
  'Benin City',
  'Ilorin',
  'Uyo',
  'Calabar',
  'Owerri',
  'Abeokuta',
  'Maiduguri',
  'Akure',
  'Bauchi',
  'Asaba',
  'Ado-Ekiti',
  'Minna',
  'Sokoto',
] as const;

const MAX_SEARCH_PAGES = 10;
const MAX_RANKING_CANDIDATES = 1000;
const SEARCH_REQUEST_DELAY_MS = 6100;
const PROFILE_REQUEST_DELAY_MS = 1000;
const DEFAULT_NIGERIA_MIN_FOLLOWERS = 100;
const DEFAULT_GLOBAL_MIN_FOLLOWERS = 1000;

export type RankingScope = 'global' | 'nigeria';

export interface PipelineRuntime {
  rootDir?: string;
  locations?: readonly string[];
  minimumFollowers?: number;
  candidateLimit?: number;
  maxSearchPages?: number;
  searchRequestDelayMs?: number;
  profileRequestDelayMs?: number;
  searchUsers?: (page: number, location: string | undefined, minimumFollowers: number) => Promise<UserSearchPage>;
  getProfile?: (login: string) => Promise<UserProfile>;
  wait?: (milliseconds: number) => Promise<void>;
}

function identityKeys(user: UserSearchResult): string[] {
  return [
    `id:${user.id}`,
    `login:${user.login.trim().toLowerCase()}`,
  ];
}

export function uniqueUsers<T extends UserSearchResult>(users: T[]): T[] {
  const seen = new Set<string>();
  return users.filter((user) => {
    const keys = identityKeys(user);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

function readThreshold(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const threshold = Number(raw);
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return threshold;
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
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function addProfile(profiles: Map<string, UserProfile>, profile: UserProfile): void {
  for (const key of identityKeys(profile)) profiles.set(key, profile);
}

function findProfile(profiles: Map<string, UserProfile>, user: UserSearchResult): UserProfile | undefined {
  for (const key of identityKeys(user)) {
    const profile = profiles.get(key);
    if (profile) return profile;
  }
  return undefined;
}

function rankProfiles(profiles: UserProfile[]): RankedUser[] {
  return uniqueUsers(profiles)
    .sort((left, right) => {
      const followerDifference = right.followers - left.followers;
      if (followerDifference !== 0) return followerDifference;
      const leftLogin = left.login.toLowerCase();
      const rightLogin = right.login.toLowerCase();
      if (leftLogin < rightLogin) return -1;
      if (leftLogin > rightLogin) return 1;
      return left.id - right.id;
    })
    .slice(0, MAX_RANKING_CANDIDATES)
    .map((profile, index) => ({ ...profile, rank: index + 1 }));
}

export async function fetchUserCandidates(
  scope: RankingScope,
  runtime: PipelineRuntime = {},
): Promise<UserSearchResult[]> {
  const rootDir = path.resolve(runtime.rootDir || process.cwd());
  const suffix = scope === 'nigeria' ? '.nigeria' : '';
  const cachePath = path.join(rootDir, '.cache', `users${suffix}.json`);
  const searchStatePath = path.join(rootDir, '.cache', `users${suffix}.search.json`);
  const progressPath = path.join(rootDir, '.cache', `users${suffix}.progress.json`);
  const statusPath = path.join(rootDir, '.cache', `users${suffix}.status.json`);
  const minimumFollowers = runtime.minimumFollowers ?? readThreshold(
    scope === 'nigeria' ? 'MIN_FOLLOWERS' : 'GLOBAL_MIN_FOLLOWERS',
    scope === 'nigeria' ? DEFAULT_NIGERIA_MIN_FOLLOWERS : DEFAULT_GLOBAL_MIN_FOLLOWERS,
  );
  const locations: readonly (string | undefined)[] = scope === 'nigeria'
    ? runtime.locations || NIGERIA_SEARCH_LOCATIONS
    : [undefined];
  const candidateLimit = runtime.candidateLimit ?? MAX_RANKING_CANDIDATES;
  const maxPages = Math.max(1, Math.min(runtime.maxSearchPages ?? MAX_SEARCH_PAGES, MAX_SEARCH_PAGES));
  const searchDelay = runtime.searchRequestDelayMs ?? SEARCH_REQUEST_DELAY_MS;
  const wait = runtime.wait || sleep;
  const search = runtime.searchUsers || getUserData;
  const previousStatus = await readJson<{ pending: boolean }>(statusPath, { pending: false });
  const previousSearch = await readJson<{
    minimumFollowers: number;
    locations: (string | undefined)[];
    locationIndex: number;
    nextPage: number;
    complete: boolean;
    candidates: UserSearchResult[];
  } | null>(searchStatePath, null);
  const canResume = previousStatus.pending
    && previousSearch !== null
    && previousSearch.minimumFollowers === minimumFollowers
    && JSON.stringify(previousSearch.locations) === JSON.stringify(locations)
    && previousSearch.candidates.length <= candidateLimit;
  let candidates: UserSearchResult[] = canResume ? previousSearch.candidates : [];
  let locationIndex = canResume ? previousSearch.locationIndex : 0;
  let resumePage = canResume ? previousSearch.nextPage : 1;
  let hasSentSearch = false;
  let truncated = false;

  if (canResume && previousSearch?.complete) {
    console.log(`Resuming completed ${scope} search with ${candidates.length} cached candidates.`);
    return candidates;
  }

  if (!canResume) {
    await writeJson(cachePath, []);
    await writeJson(statusPath, { pending: true });
    await writeJson(progressPath, []);
    await writeJson(searchStatePath, {
      minimumFollowers, locations, locationIndex: 0, nextPage: 1, complete: false, candidates,
    });
  }

  for (; locationIndex < locations.length; locationIndex += 1) {
    const location = locations[locationIndex];
    if (candidates.length >= candidateLimit) {
      truncated = true;
      break;
    }

    const requestPage = async (page: number): Promise<UserSearchPage> => {
      if (hasSentSearch) await wait(searchDelay);
      const result = await search(page, location, minimumFollowers);
      hasSentSearch = true;
      if (result.incomplete_results) {
        throw new Error(`GitHub returned incomplete results for location search page ${page}.`);
      }
      return result;
    };

    const firstPageNumber = locationIndex === (canResume ? previousSearch?.locationIndex : -1) ? resumePage : 1;
    const firstPage = await requestPage(firstPageNumber);

    const resultLimit = Math.min(firstPage.total_count, maxPages * USER_SEARCH_PAGE_SIZE);
    const pageCount = Math.max(1, Math.ceil(resultLimit / USER_SEARCH_PAGE_SIZE));
    if (firstPage.total_count > maxPages * USER_SEARCH_PAGE_SIZE) truncated = true;

    for (let page = firstPageNumber; page <= pageCount && candidates.length < candidateLimit; page += 1) {
      const searchPage = page === firstPageNumber ? firstPage : await requestPage(page);
      const usersOnPage = searchPage.items.filter((user) => user.type === 'User');
      candidates = uniqueUsers([...candidates, ...usersOnPage]).slice(0, candidateLimit);
      await writeJson(cachePath, candidates);
      await writeJson(statusPath, { pending: true });
      await writeJson(searchStatePath, {
        minimumFollowers, locations, locationIndex, nextPage: page + 1, complete: false, candidates,
      });
      console.log(`Search ${location || 'global'} page ${page}/${pageCount}: ${usersOnPage.length} users; ${candidates.length} unique candidates collected.`);
    }

    resumePage = 1;
    await writeJson(searchStatePath, {
      minimumFollowers, locations, locationIndex: locationIndex + 1, nextPage: 1, complete: false, candidates,
    });

    if (candidates.length >= candidateLimit) {
      truncated = true;
      break;
    }
  }

  const result = uniqueUsers(candidates);
  await writeJson(cachePath, result);
  await writeJson(statusPath, { pending: true });
  await writeJson(searchStatePath, {
    minimumFollowers, locations, locationIndex: locations.length, nextPage: 1, complete: true, candidates: result,
  });
  console.log(`Cached ${result.length} ${scope} user candidates with MIN_FOLLOWERS=${minimumFollowers}${truncated ? ' (search/candidate limit reached)' : ''}.`);
  return result;
}

async function readProfiles(filePath: string): Promise<UserProfile[]> {
  return readJson<UserProfile[]>(filePath, []);
}

export async function enrichUserCandidates(
  scope: RankingScope,
  globalUsers: UserProfile[] = [],
  runtime: PipelineRuntime = {},
): Promise<RankedUser[]> {
  const suffix = scope === 'nigeria' ? '.nigeria' : '';
  const rootDir = path.resolve(runtime.rootDir || process.cwd());
  const cachePath = path.join(rootDir, '.cache', `users${suffix}.json`);
  const progressPath = path.join(rootDir, '.cache', `users${suffix}.progress.json`);
  const statusPath = path.join(rootDir, '.cache', `users${suffix}.status.json`);
  const outputPath = path.join(rootDir, 'dist', `users${suffix}.json`);
  const candidates = uniqueUsers(await readJson<UserSearchResult[]>(cachePath, []));
  const refreshStatus = await readJson<{ pending: boolean }>(statusPath, { pending: candidates.length > 0 });

  if (!refreshStatus.pending && candidates.length === 0) {
    const currentProfiles = await readProfiles(outputPath);
    if (currentProfiles.length > 0) return rankProfiles(currentProfiles);
  }

  const profiles = new Map<string, UserProfile>();
  for (const profile of uniqueUsers(await readProfiles(progressPath))) addProfile(profiles, profile);
  if (scope === 'nigeria') {
    const candidateKeys = new Set(candidates.flatMap(identityKeys));
    for (const profile of uniqueUsers(globalUsers)) {
      if (identityKeys(profile).some((key) => candidateKeys.has(key)) && !findProfile(profiles, profile)) {
        addProfile(profiles, profile);
      }
    }
  }
  await writeJson(progressPath, uniqueUsers([...profiles.values()]));

  const getProfile = runtime.getProfile || getUserInfoData;
  const wait = runtime.wait || sleep;
  const profileDelay = runtime.profileRequestDelayMs ?? PROFILE_REQUEST_DELAY_MS;
  let missingProfiles = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate || candidate.type !== 'User') continue;

    let profile = findProfile(profiles, candidate);
    if (!profile) {
      try {
        profile = await getProfile(candidate.login);
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
          missingProfiles += 1;
          await writeJson(cachePath, candidates.slice(index + 1));
          continue;
        }
        // Keep completed profiles and the failed candidate resumable without logging credential data.
        await writeJson(progressPath, uniqueUsers([...profiles.values()]));
        await writeJson(outputPath, rankProfiles([...profiles.values()]));
        await writeJson(cachePath, candidates.slice(index));
        throw error;
      }
      addProfile(profiles, profile);
      await writeJson(progressPath, uniqueUsers([...profiles.values()]));
      await writeJson(outputPath, rankProfiles([...profiles.values()]));
      if (index < candidates.length - 1) await wait(profileDelay);
    }

    await writeJson(cachePath, candidates.slice(index + 1));
  }

  const ranked = rankProfiles([...profiles.values()]);
  await writeJson(outputPath, ranked);
  await writeJson(cachePath, []);
  await writeJson(progressPath, []);
  await writeJson(statusPath, { pending: false });
  console.log(`Wrote ${ranked.length} ranked ${scope} profiles${missingProfiles ? `; skipped ${missingProfiles} profiles no longer available` : ''}.`);
  return ranked;
}

export async function updateRankings(): Promise<void> {
  const globalUsers = await enrichUserCandidates('global');
  await enrichUserCandidates('nigeria', globalUsers);
}
