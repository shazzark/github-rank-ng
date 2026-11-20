# Verification log

## Find My Rank and contribution statistics implementation (2026-11-20)

- Added exact, normalized username lookup across the global and Nigeria generated datasets, cross-board ranks, table-page navigation and shareable `?user=` links. Unknown usernames receive a clear explanation that absence is not evidence about developer status or nationality.
- Added static profile detail content and optional 365-day public contribution metrics from GitHub GraphQL. REST `GET /users/{login}` profile enrichment remains the source for follower and public repository counts.
- Contribution enrichment uses sequential batches of ten, bounded to 15 minutes, observes GitHub's response-reported GraphQL point cost and 250-point reserve, retries transient errors, reuses per-user records for seven days, and checkpoints validated public results in `.baseline/contributions-progress.json`. Failure does not block valid follower ranking deployment.
- API/runtime impact estimate: up to 2,000 deduplicated leaderboard profiles at the current 1,000-per-board cap means about 200 base GraphQL calls per full initial pass, plus paginated PR contribution connections. GitHub ordinarily gives authenticated user GraphQL requests 5,000 points/hour, and the collector stops with a 250-point reserve using response-reported query costs. Assuming 0.5–2 seconds per response, the base request latency estimate is roughly 2–7 minutes; extra pages/retries are bounded by a 15-minute optional-stage budget. The optional stage can add at most that bounded runtime to the existing full refresh; daily checkpoints and seven-day reuse avoid repeating the entire pass each day. This is a planning estimate; no complete production GraphQL pass has been measured.
- `npm test`: passed 21 tests, including username matching, pagination navigation, share links and URL allowlists; GraphQL metric mapping, restricted/missing fields, freshness, checkpointing, transient retry and rate-limit failure; EJS escaping; and existing ranking pipeline checks. `npm run build` is included in this command and passed.
- Generated fixture-page Playwright checks at 390px and 1440px verified responsive fit, the full-dataset search, direct `?user=` navigation to global rank 105/page 3 and Nigeria rank 55/page 2, highlight, fresh metric period and timestamp, unknown-user explanation, and empty search state. These used synthetic local fixture data, not public rankings.
- One low-volume live GraphQL request was attempted but the local runtime could not reach the network (`GitHub GraphQL network request failed`). Official GitHub schema documentation confirms the requested `contributionsCollection`, restricted-activity flag, contribution totals and repository groups; live Actions execution is still required to verify the actual authenticated API response.
- Remote commit, deployment and Pages verification have not yet been completed for this feature.

## Baseline

- Date: 2026-11-14 (environment local time, Africa/Lagos).
- Reference: `C:/Users/chido/Developer/cloned-project/github-rank-reference`, branch `master`, commit `c9f1896064b4e813d2f6c813efb675f7d85974a4`; `git status --porcelain` was empty. The reference was not modified.
- Target: `C:/Users/chido/Developer/github-rank-ng`; no Git repository was present. A pre-existing `.env` was observed but its values were not read, displayed, or inventoried. Only the key name `ACCESS_TOKEN` was checked; the configured token authenticated successfully to GitHub.
- Toolchain: Node.js `v22.13.0`, npm `11.1.0`.
- ProjectDNA helper: Python was unavailable (`No installed Python found!`). Metadata-only inventories were generated with Node instead: `projectdna/inventory.json` and `projectdna/reference-inventory.json`. They exclude environment files, generated output/dependency folders, and private credential paths.

## Checks performed

| Check | Command / conditions | Result |
| --- | --- | --- |
| Dependency install | `npm install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000` | Passed; 68 packages installed. Initial sandbox request was denied; managed network retry succeeded. npm reported a transitive `glob@11.1.0` deprecation warning. |
| CI-style locked install | `npm ci --offline --no-audit --no-fund` | Passed; 68 packages installed from the local npm cache and lockfile. |
| TypeScript compilation | `npm run build` (run after the final pipeline change) | Passed. |
| Fixture data pipeline | In-memory mock GitHub API responses; run in an isolated temporary working directory | Passed: candidate JSON, duplicate removal, enriched JSON, follower sort/ranks, Nigeria reuse of global profiles, simulated 503, cache retention/resume, completed-cache preservation, and fresh-empty-search behavior. Temporary fixture data was removed. |
| Live GitHub access | Authenticated `GET /search/users?q=followers:>1000+location:Nigeria&per_page=1` using the existing local token; only status/rate-limit metadata was printed | Passed: HTTP 200. |
| Live candidate collection/enrichment | `npm run get` | Passed: 73 global users and 14 Nigeria users. Profile enrichment completed for both datasets; no live data was fabricated. |
| Ranking JSON integrity | Node assertions on `dist/users.json`, `dist/users.nigeria.json`, and both candidate caches | Passed: 73/14 records, unique logins, contiguous ranks, descending follower counts, no fixture residue, and empty completed caches. |
| Completed-cache rerun | `npm run get:users:info` after the final live refresh | Passed: kept the current 73 global and 14 Nigeria profiles when there were no new candidates to process. |
| EJS static generation | `npm start` after live refresh | Passed: generated `web/index.html` and `web/users.nigeria.html`. |
| Desktop browser | Playwright at 1440x1000 on the generated Nigeria page | Passed: 14 table rows, table fits its 1122px panel, no page-level horizontal overflow, Nigeria nav marked current. Screenshot: `.playwright-mcp/page-2026-11-14T14-43-56-610Z.png`. |
| Mobile browser | Playwright at 390x844 on the generated Nigeria page | Passed: heading/navigation fit; follower column remains visible; nonessential columns are hidden; table fits its 344px container without page overflow, Nigeria nav marked current. Screenshot: `.playwright-mcp/page-2026-11-14T14-43-51-375Z.png`. |
| Reference-specific code/workflow audit | Search target source, templates, package scripts, and workflows for China pages, publishing, tags/releases, pushes, and deployment steps | Passed: removed China fetch/template functionality; workflows contain no npm publish, release/tag creation, Git push, README mutation, or deployment. |
| GitHub Actions runtime | Not available from this local workspace; target has no Git metadata or connected Actions run | Not run. Workflow source was reviewed; the repository must configure an `ACCESS_TOKEN` Actions secret for scheduled profile enrichment. |

## Live data notes

The ranking files are current GitHub API output from the local authenticated run. GitHub search's `location:Nigeria` matches indexed profile text; it may miss developers whose profile location is absent or formatted differently. The global and Nigeria searches each use the reference's `followers:>1000` threshold and a maximum of eight 100-result pages. The final target contains live JSON in ignored `dist/` and static HTML in ignored `web/`; `.cache/` candidate files are empty after completion.

## Limits

Fixture checks prove the pipeline's behavior against controlled responses, not the behavior of GitHub Actions. The API and browser checks were live/local on this workstation. Actions execution and any hosted deployment were intentionally not performed; deployment was outside scope.

## Expanded discovery verification

- `npm ci` passed on 2026-11-14 and installed 68 packages from the lockfile. npm emitted an upstream `glob@11.1.0` deprecation/security advisory; this task did not change dependencies.
- `npm run build` passed. `npm test` passed all six Node built-in tests covering threshold/query encoding, rate-limit/incomplete retries, pagination despite filtered organization pages, ID/login dedupe, deterministic descending follower ranking, and interrupted search/enrichment recovery.
- The old `followers:>1000 location:Nigeria` query was replayed against GitHub: `total_count=14`, `incomplete_results=false`, 14 user results. The old run did not persist API metadata, so this confirms the same query is narrow now but cannot establish the exact historical API response. The old pipeline also had an independent pagination defect: it decided whether to fetch another page after filtering organizations, which can stop early when fewer than 100 users remain on a page. That defect did not explain the reproduced 14-result query because its API total was 14.
- `npm run refresh` completed using the configured local token for profile requests and GitHub's public search API. It produced **768 global** and **700 Nigeria** real profiles. The Nigeria sweep searched the country plus configured Nigerian cities at `MIN_FOLLOWERS=100`; the global threshold was `GLOBAL_MIN_FOLLOWERS=1000`. No fixture data was written to ranking output.
- JSON checks passed for both output files: no duplicate GitHub IDs or normalized logins, contiguous ranks, descending followers, and valid User profile fields. The EJS CLI generated both `web/index.html` and `web/users.nigeria.html`; the Nigeria page displayed 700 rows and its self-reported-location disclosure.
- Playwright checks passed on the generated Nigeria page at 1440x1000 and 390x844. The heading and navigation fit; the page itself had no horizontal overflow; the table remained inside its horizontal scroll container; the follower column stayed visible on mobile. Screenshots are in ignored `.playwright-mcp/nigeria-desktop.png` and `.playwright-mcp/nigeria-mobile.png`.
- Secret handling: `.env` was never displayed or staged; only whether `ACCESS_TOKEN` existed was observed. API errors and test output did not contain the token. `.env` and generated output are excluded by `.gitignore`.

### Remaining API limits

GitHub Search only returns profiles whose free-text, self-reported location matches one of the query terms. A city match can refer to another place and does not prove nationality or residence; developers who omit location or use another spelling can be missed. Each search query has a maximum of 1,000 results, and the merged ranking is capped at 1,000 candidates. Search and profile values can change during collection. GitHub Actions itself was not run from this local workspace; the workflow source was reviewed, and scheduled enrichment still requires the repository's `ACCESS_TOKEN` secret.

## Branding and GitHub Pages preparation

- Replaced project-owned public metadata and site links with GitHub Rank NG and `shazzark/github-rank-ng`; removed upstream sponsorship links from the shared footer and the project-owned funding metadata in the lockfile. The original `LICENSE` is unchanged.
- Kept historical attribution in `PROJECT_OVERVIEW.md`, the reference inventory, and this verification log as source-provenance evidence. The global ranking JSON/HTML also contains `@jaywcjlove` as a genuine API-derived user record; ranking data was intentionally not edited. `@wcj/ejs-cli` remains the existing functional EJS build dependency.
- `npm ci`, `npm test` (build plus all seven tests), `npm run verify:rankings`, and `npm run start` passed. The validator accepted 768 global and 700 Nigeria records, with unique GitHub IDs/logins, contiguous ranks, and descending follower counts.
- Browser checks under `/github-rank-ng/` passed on desktop (1440px) and mobile (390px): both pages render, navigation stays under the repository prefix, the Nigeria table renders 700 rows, canonical URLs use the Pages subpath, and there is no horizontal page overflow or browser console error.
- Added `deploy-pages.yml` to refresh verified API-backed JSON, generate HTML and upload only `web/`; the existing seven-day schedule calls that same workflow. The workflow rejects missing `ACCESS_TOKEN` and invalid/empty ranking files before deployment. Generated data, `.env`, source files, and caches are not uploaded.
- GitHub connector confirmed `shazzark/github-rank-ng` is public and has no application files; read-only `git ls-remote` found no existing branch refs. `gh` CLI is unavailable locally. Local workflow validation is complete, but GitHub Pages configuration, Actions execution, and hosted-site verification remain pending until after the authorized push. The repository must have an Actions secret named `ACCESS_TOKEN` for live refresh.
- Review note: the review-agent workflow is read-only; since the same agent authored these changes, this checkpoint is a self-review and not an independent review.
