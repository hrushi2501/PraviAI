# Opt-in persisted browser journey

`tests/e2e/persisted-journey.spec.ts` is authored, not a claim of a completed browser run. It skips unless explicit disposable configuration exists. Existing signed-out smoke checks remain available separately.

Required configuration:

- `PRAVI_E2E_DISPOSABLE=1` and a dedicated `DATABASE_RUNTIME_URL` pointing to localhost with database name `pravi_test_*`; the harness rejects remote/production-like targets.
- `PRAVI_E2E_OFFICER_STATE` and `PRAVI_E2E_REVIEWER_STATE`: private Playwright storage-state files created by signing in through real Clerk with two distinct real test accounts. Never forge sessions or commit these files. State expiry requires real sign-in again.
- `PRAVI_E2E_DEPARTMENT`: real department UUID authorized for both accounts with different intended officer/reviewer capabilities. The officer needs asset/inspection/work write, the reviewer asset verification. The registration fixture definition must be published, have no mandatory dynamic attributes, and the authority must have an active canonical region.
- `PRAVI_E2E_VERIFIED_ASSET`: an active verified fixture asset in the same department, pinned to a published component checklist.

Start or configure a fresh local app against that same dedicated database on localhost:3000. Do not reuse an arbitrary running app backed by production. Tests use real UI/server actions; they do not inject fixture tokens or execute provider writes. Any provider identity reconciliation must correspond to the real signed-in test subject and isolated local application data.

Run `bun run test:e2e --grep 'Real persisted officer/reviewer journey'` only after these prerequisites. The two implemented checks cover persisted sourced registration → officer submission → separate reviewer verification → refresh persistence, and actual component inspection draft/restoration proposal → refresh persistence. The complaint → evidence-required approved inspection → accepted completion → approved reinspection case is explicitly marked incomplete, rather than bypassing missing functionality with direct SQL or pretend media.

The test database may retain synthetic records after a run. It is disposable by design; delete the isolated instance under the test fixture policy, never reset an application database to make the harness run. Browser state and reports may contain session/private metadata; exclude them from commits/source ZIPs.
