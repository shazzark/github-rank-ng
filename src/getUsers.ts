import { fetchUserCandidates } from './pipeline.js';

fetchUserCandidates('global').catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unable to fetch global users.');
  process.exitCode = 1;
});
