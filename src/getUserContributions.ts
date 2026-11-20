import { collectContributionStats } from './contributions.js';

collectContributionStats().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Contribution collection was unavailable.';
  console.warn(`::warning::Contribution statistics were not refreshed; follower rankings can still deploy. ${message}`);
});
