export interface ContributionStats {
  id: number;
  login: string;
  collectedAt: string;
  periodStartAt: string;
  periodEndAt: string;
  availability: 'complete' | 'partial' | 'restricted' | 'unavailable';
  publicContributionActivity: number | null;
  pullRequestsOpened: number | null;
  pullRequestsMerged: number | null;
  issuesOpened: number | null;
  pullRequestsReviewed: number | null;
  externalPublicRepositories: number | null;
  verifiedExternalOpenSourceRepositories: number | null;
  publicRepositoryCount: number;
}
