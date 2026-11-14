# Implementation plan

## Scope and success criteria

Use the reference at `c9f1896064b4e813d2f6c813efb675f7d85974a4` as read-only evidence. Keep TypeScript, Node.js, EJS, global user ranking, and required MIT notices. Replace the China dataset/page with Nigeria; do not invent or ship ranking records. The owner has authorized a verified push to `main` and GitHub Pages deployment; npm publication, release/tag creation, and generated-data Git writes remain disabled.

## Phases and gates

1. **Discover and document** — inspect source pipeline, templates, package/TypeScript configuration and workflows; record target baseline and source revision. Gate: architecture/data-flow and feature inventory have evidence-backed mappings.
2. **Implement data pipeline** — add global/Nigeria candidate fetchers, resumable enrichment, rank ordering, and JSON output. Gate: TypeScript compilation succeeds; fixture run proves candidates flow through cache, enrichment, and final JSON without fabricated production data.
3. **Implement static pages** — add EJS mappings and Nigeria/global navigation, labels, and metadata. Gate: EJS emits both pages and browser checks pass at desktop and mobile viewports.
4. **Operations and handover** — update npm scripts, secure main-branch workflows, README, `.env.example`, and MIT license. Gate: npm install and all requested checks are recorded; remaining live/API blockers are explicit.

## Risks and constraints

- GitHub search only indexes profiles whose location matches its query. Profiles with unstructured locations may not appear in `location:Nigeria` results.
- GitHub Search returns at most 1,000 users per query; the implementation reads at most ten 100-result pages per query and caps the merged dataset at 1,000 candidates.
- Profile enrichment requires many API requests. `ACCESS_TOKEN` improves rate-limit headroom; failed records must remain cached for resumption.
- The workspace includes a pre-existing `.env`; it is excluded from inventories, commits, logs, and documentation.
- The provided Python inventory helper cannot run because Python is not installed. A metadata-only Node inventory will be recorded instead.

## Discovery expansion delivery

The discovery phase is implemented and verified. The prior query reproduces 14 complete results on the current API, while historical response metadata is unavailable. The live data run generated 768 global and 700 Nigeria profiles. The current follow-up removes public upstream promotion and deploys only `web/` through GitHub Pages; the seven-day refresh calls the same serialized workflow.
