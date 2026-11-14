# Decisions

## 2026-11-14 — Independent Nigeria adaptation

- **Decision:** Replace the China-specific ranking with a Nigeria ranking while retaining the global user page and the TypeScript/Node.js/EJS stack.
- **Evidence:** User requested `MODE: Independent Reimplementation`, a Nigeria-focused site, global ranking where relevant, and the existing architecture.
- **Effect:** New Nigeria query, JSON names, template, navigation, metadata, and documentation. China-specific fetcher/template/script are removed from the target.

## 2026-11-14 — Focus on developer rankings

- **Decision:** Do not carry over repository, organization, or trending pages and scrapers.
- **Evidence:** The requested product is a Nigeria-focused GitHub developer ranking website; the global user ranking is explicitly retained.
- **Effect:** Smaller UI and dependency surface; those reference features are recorded as intentional scope differences in `FEATURE_INVENTORY.md`.

## 2026-11-14 — No automated publishing or repository writes

- **Decision:** CI only builds on `main`; the seven-day scheduled workflow refreshes data, generates pages, and uploads an artifact with read-only repository permission.
- **Evidence:** User explicitly disabled npm publishing, tagging, release creation, unrelated automated Git pushes, and requested no deployment.
- **Effect:** No package publish, branch push, tag/release, Pages deployment, or README mutation is included.

## 2026-11-14 — Separate refresh progress from prior rankings

- **Decision:** Track profiles completed during the current refresh in `.cache/users*.progress.json`; do not use last refresh's `dist` records as current profile data.
- **Evidence:** Scheduled refresh must update follower counts, while an interrupted run must resume without discarding successfully fetched details.
- **Effect:** A new successful search clears only its progress state. Each completed profile is persisted before its raw candidate is removed from the cache. Nigeria profiles reuse current global profiles when logins match.
- **Follow-up:** A `.cache/users*.status.json` marker distinguishes a completed cache from a fresh empty search, so rerunning only enrichment does not replace a valid ranking with an empty list.

## 2026-11-14 — Privacy and source inventory

- **Decision:** Exclude the existing `.env` from inventory, docs, generated assets, and commands that print environment values. Use a Node metadata inventory because no Python runtime is installed.
- **Effect:** Credential validity can only be checked by attempting an authenticated request; no token contents are recorded.

## 2026-11-14 — GitHub Rank NG branding and Pages publishing

- **Decision:** Use `GitHub Rank NG` and `https://github.com/shazzark/github-rank-ng` in public project metadata and remove upstream sponsorship/promotion from the README, generated site, and project-owned lock metadata. Preserve the original MIT `LICENSE` bytes and keep the real public ranking dataset unchanged.
- **Evidence:** User requested independent branding, unchanged ranking data, preservation of legal notices, and GitHub Pages publishing to `main`.
- **Effect:** Historical ProjectDNA provenance remains internal documentation. The original username may still occur as a real global ranking record. The seven-day refresh calls the same Pages deployment workflow to avoid a competing artifact-only build.
- **Supersedes:** The earlier no-deploy decision is superseded by the user's explicit authorization for a Pages deployment and push to `origin/main`; package publishing, releases/tags, and generated-data Git pushes remain disabled.
