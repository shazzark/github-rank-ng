import { updateRankings } from './pipeline.js';

updateRankings().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unable to update user rankings.');
  process.exitCode = 1;
});
