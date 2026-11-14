# Implementation plan

## Scope and success criteria

Use the reference at `c9f1896064b4e813d2f6c813efb675f7d85974a4` as read-only evidence. Keep TypeScript, Node.js, EJS, global user ranking, and required attribution. Replace the China dataset/page with Nigeria; do not invent or ship ranking records. No push, deployment, npm publication, release, tag, or automated Git write.

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

The follow-up discovery phase is implemented and verified. The previous query reproduced 14 complete results on the current API; historical response metadata was unavailable, so the old run cannot be reconstructed exactly. The broadened pipeline uses configurable thresholds, Nigeria and city-location queries, metadata-based pagination, bounded retry/backoff, incomplete-result rejection, search checkpoints, ID/login deduplication, stable ranking, and profile enrichment. Six fixture tests pass. The live refresh generated 768 global and 700 Nigeria profiles; both EJS pages were generated and the Nigeria page was checked in desktop and mobile browsers. The local review and focused commit are the remaining delivery steps. No push or deployment is authorized.
