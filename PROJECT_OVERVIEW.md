# Project overview

`GitHub Rank NG` is a static GitHub developer discovery and ranking site focused on Nigeria, with a companion global users ranking. It uses a TypeScript, Node.js and EJS pipeline. Nigerian candidate discovery combines configurable follower thresholds with country and city-location searches while preserving the public profile JSON schema and global ranking. The source reference was inspected read-only; the target began as a non-Git directory with a pre-existing `.env`, which is excluded from documentation and output.

The source uses TypeScript CLI jobs, GitHub Search and user-profile API calls, resumable JSON caches, enriched JSON ranking files, and EJS templates compiled to static HTML. GitHub profile locations are self-reported; a city-name match may refer to another place and does not establish nationality or residence. Repository/trending/org pages and their fetchers are outside this focused adaptation. Records must come from GitHub API responses; fixtures are for verification only and are not published ranking data.

## Boundaries

- **Observed source:** Jay W. C. Liu's `jaywcjlove/github-rank`, MIT licensed.
- **Target constraints:** retain TypeScript, Node.js, EJS, the global users page, source attribution, and the reference's seven-day scheduled refresh cadence.
- **Safety:** do not modify the reference, publish packages, create releases/tags, push generated data, or perform unrelated automated repository writes. The authorized `main` workflow publishes only the generated `web/` artifact to GitHub Pages.
- **Current verification:** see `projectdna/VERIFICATION.md`; the 2026-11-14 live refresh completed with 768 global and 700 Nigeria profiles. The local access token was not printed or added to Git.
