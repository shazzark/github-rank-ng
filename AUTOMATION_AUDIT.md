# Refresh automation audit

## Confirmed from the repository

- Before this change, `refresh.yml` scheduled `0 0 */7 * *`, which ran at 00:00 UTC on matching days of each month, rather than once per day.
- `refresh.yml` called the reusable Pages workflow. The reusable workflow required `ACCESS_TOKEN`, ran tests, executed `npm run refresh`, validated ranking JSON and deployed only after those commands passed. It did not commit generated files to `main`.
- The complete refresh rediscovered global candidates and Nigeria candidates, enriched current profile data, and regenerated HTML. GitHub Search limits each query to 1,000 results; the pipeline also capped each scope at 1,000 unique profiles. Nigeria discovery uses the Nigeria and configured city-location searches.
- API requests already retried network errors, server errors, rate limits and incomplete search responses, honoring GitHub retry hints. Local `.cache` files checkpointed progress during a run.
- Profile enrichment previously wrote its partial ranking to `dist/` after each API response. A failed workflow did not reach Pages deployment, but its output directory could contain incomplete data. It now publishes each scope to `dist/` only when that scope has finished.
- At configured pacing, a conservative upper bound is about 56 minutes of intentional waits: up to 230 search calls with 6.1-second spacing and up to 2,000 profile calls with 1-second spacing. Ordinary responses add request time. Rate-limit waits can extend the run, so the job has a five-hour timeout and failures stop deployment while preserving the prior Pages site.
- The last successful public ranking snapshot is stored as an Actions cache entry only after Pages deployment succeeds. It contains public profile data only and is used to count newly discovered, retained and removed profiles on the next successful refresh.

## Workflow-history evidence

The connected GitHub tools available during this audit did not expose a workflow-run listing or job-log action for this repository. Attempts to fetch the Actions run endpoint through the available public-resource tool were rejected as unsupported. Therefore this audit cannot confirm whether prior scheduled runs started, completed or failed, and it does not attribute an observed outage to a specific run-time failure.

## Possible causes that require Actions logs to confirm

- The workflow may have been disabled, or scheduled events may have been delayed or skipped by GitHub Actions scheduling behavior.
- A missing or invalid `ACCESS_TOKEN` would stop deployment at the credential check.
- GitHub rate limits, API errors, incomplete search responses or a runner timeout could stop a refresh before the upload and deployment steps.
- Repository or Pages environment configuration could reject the deployment after data generation.

The updated workflow reports a failed run in its status and job summary. Review the exact failed step in Actions to distinguish these possibilities.
