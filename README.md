# GitHub Rank NG

A static ranking of public GitHub developer profiles, focused on Nigeria, with a global leaderboard. The site uses GitHub Search results and public profile data; it does not create, estimate, or fill in ranking records.

This independent Nigeria-focused adaptation retains the TypeScript, Node.js and EJS approach of [jaywcjlove/github-rank](https://github.com/jaywcjlove/github-rank). The original project and its contributors are credited; see the retained [MIT license](LICENSE).

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

`npm run get` runs the two candidate searches followed by profile enrichment. `npm run refresh` builds, refreshes data, and generates both pages. The complete refresh can make hundreds of GitHub API requests and takes time.

## Data and output

- `.cache/users.json` and `.cache/users.nigeria.json` contain raw API search candidates and support resuming profile enrichment.
- `.cache/users.search.json` and `.cache/users.nigeria.search.json` checkpoint the current query, location and next page so interrupted discovery resumes without repeating completed pages.
- `.cache/users.progress.json` and `.cache/users.nigeria.progress.json` hold completed profiles for the current refresh so a failed run can resume without stale previous rankings.
- `.cache/users.status.json` and `.cache/users.nigeria.status.json` distinguish a new/unfinished refresh from an already completed empty cache, so rerunning enrichment alone preserves the current ranking.
- `dist/users.json` and `dist/users.nigeria.json` contain enriched profile data ordered by follower count, with sequential ranks.
- `web/index.html` and `web/users.nigeria.html` are the generated static pages.

Nigeria discovery searches `location:Nigeria` and a maintained set of Nigerian city names (including Lagos, Abuja, Enugu, Port Harcourt, Ibadan and Kano), with a default minimum of 100 followers. Set `MIN_FOLLOWERS` to change the Nigeria threshold; `GLOBAL_MIN_FOLLOWERS` controls the global threshold (default 1,000). GitHub user search exposes at most 1,000 results per query, so results are capped and may be incomplete. The pipeline merges overlapping searches by GitHub user ID and login, then ranks by followers descending with login and ID as stable tie-breakers.

GitHub profile location is self-reported and free text. City matches can include people who are not Nigerian, and Nigerian developers may omit a location or use an unsearched spelling. The ranking is discovery, not proof of nationality, residence, or a complete census. The result list contains only profiles returned by GitHub and successfully enriched from its public profile API.

Open `web/index.html` locally after `npm start`. The refresh workflow runs every seven days and uploads a build artifact. It does not deploy or push generated data. API search requests are paced, incomplete results are retried, and rate-limit responses honor GitHub retry hints; if a refresh is interrupted, cached candidates and completed profiles let it resume.

## License and attribution

This repository preserves the MIT license and attribution for the original project: [jaywcjlove/github-rank](https://github.com/jaywcjlove/github-rank). This adaptation is not an official upstream release.
