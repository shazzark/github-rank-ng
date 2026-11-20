# GitHub Rank NG

A static ranking of public GitHub developer profiles, focused on Nigeria, with a global leaderboard. The site uses GitHub Search results and public profile data; it does not create, estimate, or fill in ranking records.

[Repository](https://github.com/shazzark/github-rank-ng) · [Global leaderboard](https://shazzark.github.io/github-rank-ng/) · [Nigeria leaderboard](https://shazzark.github.io/github-rank-ng/users.nigeria.html)

## Requirements

- Node.js 20 or newer
- npm
- A GitHub personal access token for a full refresh. Public unauthenticated requests are rate limited.

Copy `.env.example` to `.env` and set `ACCESS_TOKEN`. Keep the token private. The scheduled workflow reads the `ACCESS_TOKEN` repository Actions secret.

## Commands

```sh
npm ci
npm run build
npm test
npm run get:users
npm run get:users:nigeria
npm run get:users:info
npm start
```

`npm run get` runs fresh global and Nigeria candidate discovery followed by profile enrichment. `npm run refresh` builds, recollects and verifies both rankings, records snapshot freshness and change counts, then generates both pages.

Both leaderboards include **Find My Rank**, an exact username lookup across the complete generated global and Nigeria datasets, with links that reopen the result. Contribution details are optional public-data enrichment; they never gate a valid follower-ranking deployment. The detail panel shows when each profile's statistics were collected and reports incomplete or unavailable metrics explicitly.

## Data and output

- `.cache/users.json` and `.cache/users.nigeria.json` contain raw API search candidates and support resuming profile enrichment.
- `.cache/users.search.json` and `.cache/users.nigeria.search.json` checkpoint the current query, location and next page so interrupted discovery resumes without repeating completed pages.
- `.cache/users.progress.json` and `.cache/users.nigeria.progress.json` hold completed profiles for the current refresh so a failed run can resume without stale previous rankings.
- `.cache/users.status.json` and `.cache/users.nigeria.status.json` distinguish a new/unfinished refresh from an already completed empty cache, so rerunning enrichment alone preserves the current ranking.
- `dist/users.json` and `dist/users.nigeria.json` contain enriched profile data ordered by follower count, with sequential ranks.
- `web/index.html` and `web/users.nigeria.html` are the generated static pages.

Nigeria discovery searches `location:Nigeria` and a maintained set of Nigerian city names (including Lagos, Abuja, Enugu, Port Harcourt, Ibadan and Kano), with a default minimum of 100 followers. Set `MIN_FOLLOWERS` to change the Nigeria threshold; `GLOBAL_MIN_FOLLOWERS` controls the global threshold (default 1,000). GitHub user search exposes at most 1,000 results per query, so results are capped and may be incomplete. The pipeline merges overlapping searches by GitHub user ID and login, then ranks by followers descending with login and ID as stable tie-breakers.

GitHub profile location is self-reported and free text. City matches can include people who are not Nigerian, and Nigerian developers may omit a location or use an unsearched spelling. The ranking is discovery, not proof of nationality, residence, or a complete census. The result list contains only profiles returned by GitHub and successfully enriched from its public profile API. Each generated page reports the last successful collection time, profile total, ranking method, and new/retained/removed counts against the previous successful snapshot.

### Public contribution statistics

The optional enrichment uses GitHub GraphQL `User.contributionsCollection` for a rolling 365-day period. It requests the public contribution calendar total, pull requests opened, issues opened, and pull request review contributions, plus repository groups and pull-request contribution nodes to identify merged requests and external public repositories. Public repository count comes from the already-collected REST `GET /users/{login}` profile response. Statistics are collected at most once per profile per seven days; the date shown is per profile, not a claim of real-time data.

GraphQL calls are sequential batches of up to five users, retried for transient failures, limited to 15 minutes for this optional stage, and stopped when fewer than 250 rate-limit points remain beyond the highest observed request cost. A batch that keeps returning HTTP 502, 503 or 504 is split into smaller requests; an individually failing profile remains unavailable while later profiles continue. The smaller batch bounds the size of each multi-profile query. GitHub's response-reported `rateLimit.cost` is authoritative because query cost varies with each profile's contribution connections; authenticated user queries ordinarily have a 5,000-point hourly budget. The collector uses the observed cost and remaining budget to decide whether to continue, rather than assuming a fixed point cost per profile. At the current maximum of 1,000 users per board, the deduplicated full initial set is at most 2,000 profiles: approximately 400 base GraphQL requests at five users per batch, plus extra pages for profiles with more than 100 pull-request contributions. At an illustrative 0.5–2 second response time plus the 100ms inter-batch pacing, that is roughly 4–14 minutes of base request time before retries and extra pages; adaptive splitting can increase request count, and the 15-minute optional-stage cap bounds its impact. Seven-day reuse avoids repeat calls for profiles with a recent successful collection. These are estimates, not measured production runtimes.

If the optional stage times out or hits a rate limit, completed public per-profile checkpoints can be reused by later daily runs. Incomplete metrics remain `Unavailable` and visibly `partial`; older results retain their individual collection dates and are marked stale after seven days. The primary follower ranking still validates and deploys. The token is sent only in the GraphQL authorization header using the Actions `ACCESS_TOKEN` secret and is never written to a snapshot.

Metric definitions and limitations:

- **Public contribution activity** is GitHub's contribution-calendar total for the stated period. If GitHub reports restricted contributions, the activity aggregates are withheld rather than mixing in private activity.
- **Pull requests opened** counts contribution records opened in the period. **Pull requests merged** counts those period PR records whose current `mergedAt` is set; it does not mean every PR opened in the period was merged during that period.
- **Pull request review contributions** uses GitHub's `totalPullRequestReviewContributions` field; GitHub describes the connection as returning the most recent review per PR, so this is not a count of every individual review submission.
- **External public repositories with activity** deduplicates public repository groups across commit, issue, pull request and review contributions, excluding repositories owned by the profile. The count is unavailable when GitHub's 100-repository group cap is reached.
- **Licensed external repositories with commits or merged PRs** counts external public repositories with a GitHub SPDX license and visible commit or merged-PR activity. A license identifier verifies repository licensing metadata; this is a conservative activity signal, not a review of code quality or proof that all work is open source. Stars and ownership do not count.
- Missing API fields, restricted records, capped groups and truncated pull-request pages are not treated as zero. Partial results identify unavailable fields individually.

Open `web/index.html` locally after `npm run refresh`. Pushes to `main`, manual runs, and the daily 02:00 UTC scheduled refresh publish the generated `web/` directory through GitHub Pages. Configure the `ACCESS_TOKEN` Actions secret for live profile enrichment. The workflow validates both ranking JSON files before generating and uploading the site artifact; it never publishes `.env`, caches, or source files as website content. API search requests are paced, incomplete results and transient failures are retried, and rate-limit responses honor GitHub retry hints. An interrupted run fails visibly and leaves the last Pages deployment intact; public candidate/profile checkpoints remain available within the run workspace for recovery.

## License and attribution

This project is licensed under MIT. The original copyright and license notice is preserved in [LICENSE](LICENSE).
