import { fetchUserCandidates } from './pipeline.js';

fetchUserCandidates('nigeria').catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unable to fetch Nigeria users.');
  process.exitCode = 1;
});
