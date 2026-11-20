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

## Data and output

- `.cache/users.json` and `.cache/users.nigeria.json` contain raw API search candidates and support resuming profile enrichment.
- `.cache/users.search.json` and `.cache/users.nigeria.search.json` checkpoint the current query, location and next page so interrupted discovery resumes without repeating completed pages.
- `.cache/users.progress.json` and `.cache/users.nigeria.progress.json` hold completed profiles for the current refresh so a failed run can resume without stale previous rankings.
- `.cache/users.status.json` and `.cache/users.nigeria.status.json` distinguish a new/unfinished refresh from an already completed empty cache, so rerunning enrichment alone preserves the current ranking.
- `dist/users.json` and `dist/users.nigeria.json` contain enriched profile data ordered by follower count, with sequential ranks.
- `web/index.html` and `web/users.nigeria.html` are the generated static pages.

Nigeria discovery searches `location:Nigeria` and a maintained set of Nigerian city names (including Lagos, Abuja, Enugu, Port Harcourt, Ibadan and Kano), with a default minimum of 100 followers. Set `MIN_FOLLOWERS` to change the Nigeria threshold; `GLOBAL_MIN_FOLLOWERS` controls the global threshold (default 1,000). GitHub user search exposes at most 1,000 results per query, so results are capped and may be incomplete. The pipeline merges overlapping searches by GitHub user ID and login, then ranks by followers descending with login and ID as stable tie-breakers.

GitHub profile location is self-reported and free text. City matches can include people who are not Nigerian, and Nigerian developers may omit a location or use an unsearched spelling. The ranking is discovery, not proof of nationality, residence, or a complete census. The result list contains only profiles returned by GitHub and successfully enriched from its public profile API. Each generated page reports the last successful collection time, profile total, ranking method, and new/retained/removed counts against the previous successful snapshot.

Open `web/index.html` locally after `npm run refresh`. Pushes to `main`, manual runs, and the daily 02:00 UTC scheduled refresh publish the generated `web/` directory through GitHub Pages. Configure the `ACCESS_TOKEN` Actions secret for live profile enrichment. The workflow validates both ranking JSON files before generating and uploading the site artifact; it never publishes `.env`, caches, or source files as website content. API search requests are paced, incomplete results and transient failures are retried, and rate-limit responses honor GitHub retry hints. An interrupted run fails visibly and leaves the last Pages deployment intact; public candidate/profile checkpoints remain available within the run workspace for recovery.

## License and attribution

This project is licensed under MIT. The original copyright and license notice is preserved in [LICENSE](LICENSE).
