# Task tracking

| ID | Work item | Feature | Status | Evidence / blocker |
| --- | --- | --- | --- | --- |
| T01 | Inspect reference revision, data pipeline, templates, scripts, and workflows | F01-F06 | Complete | Source commit `c9f1896064b4e813d2f6c813efb675f7d85974a4`, branch `master`, initially clean |
| T02 | Create ProjectDNA baseline and plan | F01-F06 | Complete | Core documents and metadata inventories recorded; Python helper unavailable |
| T03 | Implement Nigeria candidate collection and shared enrichment | F01-F03 | Complete | Fixture success/failure recovery and live counts; see verification log |
| T04 | Implement global/Nigeria EJS pages | F01, F02, F04 | Complete | Both pages generated; Playwright desktop/mobile checks passed |
| T05 | Update package metadata, docs, license, and environment example | F05 | Complete | README, `.env.example`, preserved MIT license, private npm package |
| T06 | Restrict workflows to safe main CI and scheduled artifact refresh | F05 | Complete | Source audit passed; workflow runtime depends on GitHub Actions and repository secret |
| T07 | Install, compile, run fixture pipeline, try live fetch, generate and inspect HTML | F01â€“F05 | Complete | npm install/ci, build, fixture recovery, live API, EJS, browser checks passed; Actions runtime not run |
| T08 | Reproduce the old 14-profile query and inspect search metadata | F07 | Complete | Current exact old query: 14 complete results; old response metadata was not retained |
| T09 | Implement multi-location search, configurable thresholds, pagination, retry, and identity deduplication | F02, F03, F07 | Complete | Metadata pagination, retry and incomplete-result handling, per-page search checkpoints, ID/login dedupe, deterministic follower ranks |
| T10 | Add unit/integration tests and update workflow test gate | F03, F07 | Complete | `npm test`: 6 Node built-in fixture tests passed; CI invokes the same gate |
| T11 | Update location disclosure, documentation, live data, and responsive verification | F02, F04, F07 | Complete | Live output: 768 global and 700 Nigeria profiles; JSON integrity and 1440/390px Playwright checks passed |
| T12 | Review, inspect staged files, and create one local commit | All | Complete | Read-only review passed; focused local `main` commit created after all checks; no push/deploy |
