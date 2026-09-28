# MVP scope and delivery status

Current source state after the 28 September audit and integration changes. Database-backed means wired to actor-scoped reads/actions; it does not mean independently verified against hosted production accounts.

| Capability | Current implementation | Remaining work |
| --- | --- | --- |
| Login and shared light workspace | Root routes through Clerk to dashboard; default light UI; actual authorized departments and pending-access state | Signed-in hosted browser acceptance and provider settings verification |
| Department/central scope | Actor-scoped SQL reads, actual department selector, current permission checks | Complete independently granted central-scope acceptance and denied-access E2E |
| Published definitions | Department-specific published versions read from SQL | Durable draft editor/submission/independent publication and governance UI |
| Asset registration/inventory | Actual published-definition dynamic form, source reference, canonical region options, persisted draft action; scoped server pagination and table controls | Hosted create/refresh/retry/invalid-field tests; stable client idempotency keys |
| Asset detail/history | Actual asset, condition/freshness, linked inspections/works/complaints, metadata-only evidence, latest 50 authorized audit entries | Protected media upload/delivery and broader history pagination |
| Registration correction/review | Draft/returned name/source/attribute correction, submit/verify/return with reason and expected version; SQL capability checks and independent review | Complete typed correction experience and hosted independent-user journey |
| Inspection/work queues | Actual paginated SQL records and capability-aware review decisions; verified asset detail saves actual checklist inspection drafts and restoration proposals with stable retry keys | Secure evidence for submission, completion evidence/data, supersession and hosted evidence acceptance; estimate review and accepted-work reinspection linkage implemented |
| Complaint handling | Actual linked complaints displayed; backend operations exist | Durable intake/unlinked matching/triage/assignment/reopen user journey |
| Lifecycle/availability/archive | SQL independent sensitive-request contract | Application request/review screens and server action wiring |
| Account/settings | Actual authenticated profile and scope | Role/department/member/invitation/access governance workflows |
| Dashboard | Scoped persisted aggregates; current/stale/unknown separated; actual first/latest compatible approved pairs (up to 20), exact reviewed paise backlog with priced/unpriced and status/category/region breakdown | Full timeframe/filter drill-down and export; current server-derived save/history snapshots implemented, hosted reporting/migration acceptance pending |
| Seven-language experience | Legacy preview navigation dictionaries remain in source | Complete production UI dictionaries and parity/human review; do not claim released multilingual coverage |
| External evidence/invitations | Unsafe signatures/delivery are disabled with explicit unavailable responses | Authorized upload/metadata/private delivery and real authenticated Clerk dispatcher |
| AI | Type-only advisory interface | Deferred |

The `/app` product routes do not use preview personas or fixture inventory. Legacy preview components are not evidence that the production workflow is implemented. No public landing page is required.

The complete local SQL harness passes 40 groups, including invitation acceptance/reactivation; application unit tests and final build/check results are documented separately. These do not prove hosted RLS, vendor delivery, private media, concurrent sessions or the complete complaint-to-restoration-to-reassessment journey.

Before submission: seed reviewed persisted synthetic data and real distinct demo identities/grants; test tenant isolation, revocation, independent approvals and refresh persistence through the actual application; complete required language coverage; verify the deployed release; record the walkthrough and package architecture/source/assumptions honestly. Provider and database secrets must never appear in README or ZIP.

AI predictions/RAG/voice, elaborate GIS/offline/public grievance integrations, general workflow design, tendering/payments/procurement and national-scale claims remain outside this critical path.
