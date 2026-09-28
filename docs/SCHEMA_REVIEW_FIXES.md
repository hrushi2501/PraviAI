# Schema review corrections

This document distinguishes implemented database controls from application integration and deferred production work. The schema is an owner-run installer for a fresh Supabase PostgreSQL database. It does not deploy the application or configure Clerk, storage, Vercel or live database credentials.

## Review context

The supplied review was written against a truncated file. Its missing RLS, explicit grants, work/evidence/invitation functions and transaction commit are addressed by the complete installer. All database execution during development is against a disposable local PostgreSQL-compatible runtime. Hosted Supabase behaviour is not proven by those checks.

## Core corrections

- Audit triggers supply explicit composite key arguments, including template versions and membership authority/department keys. Identity and authority changes are audited. History redacts contact information, free narratives, observation notes and private object locators; runtime cannot update/delete/truncate audit or evidence-access events.
- PUBLIC and Supabase API roles lose application-schema privileges. Runtime receives SELECT policies and a named API allowlist only, with no direct table mutations. Bootstrap, identity sync, recovery, receipts and internal governance helpers remain owner/worker-only as appropriate.
- Department and region creation run through independent governance proposals. Governance approval can be delegated separately from administration. Bootstrap requires two distinct verified administrator identities, and later proposals have bounded decision lifetimes.
- Actor context uses a private table keyed to backend/transaction, asserted once. An arbitrary `set_config` call cannot forge that context. This is not an HMAC implementation or protection against a fully compromised trusted backend.
- Date/boolean fields receive their correct validators; incomplete drafts remain possible. New assets default to the pinned template's first stage. Unchanged inactive regions do not block a hazard closure. Material edits of verified inventory resubmit it for independent verification.
- Signed identity-provider disablement/unverification removes access even for the last administrator and creates recovery flags. Disabled-account restoration is owner-only after independent verification of a newer provider event. Ordinary sync cannot silently resurrect a tombstoned identity.
- Evidence keys require tenant prefixes; internal/restricted evidence cannot use public Cloudinary. Unmatched complaints may hold evidence. `request_evidence_access` authorises and records delivery requests without exposing private locators through ordinary runtime metadata reads.
- Role retirement reports assignment/invitation blocker counts. Membership and invitation references enforce role/authority scope, including a real invitation-role foreign key. Schema-version metadata permits later versions. Request receipts retain hashes and minimal IDs/versions with owner-only pruning after a minimum thirty-day retry window.

## Added model and operations

| Review requirement | Database implementation | Operational meaning |
| --- | --- | --- |
| Explicit central department scope | `central_read_requests`, `central_read_grants`, `request_central_read`, `decide_central_read` | A non-admin central reader needs both an active authority role with `authority_read` and an independently approved grant. A department-specific grant covers that department; an explicitly approved NULL department covers the authority. Authority administrators retain authority-wide administrative visibility. Requests expire for decision after seven days. |
| Responsible officer and real measures | `assets.responsible_officer`, `measure_value`, `measure_unit`, `set_asset_management` | Responsible officers must have active verified department membership at assignment. Measures are positive and paired with explicit units. Changing these management inputs on a verified asset resubmits registration for independent review. Missing values remain NULL. Regional quantities must group by unit and asset classification; never sum kilometres with square metres or count child quantities twice. |
| Asset hierarchy | `assets.parent_asset_id` with same-department FK | `set_asset_management` rejects self-parenting and ancestor cycles. It serializes hierarchy edits within a department to prevent simultaneous edits creating a cycle. Relationships describe containment/association; they do not automatically merge quantities, costs or conditions. |
| Post-work reinspection | `work_orders.verification_inspection_id`, `link_work_verification` | Link only an accepted work order to an approved same-asset inspection created after acceptance and observed on/after completion. Its assessor and reviewer must differ from the executor. A superseded inspection cannot be linked as current. Acceptance alone never improves recorded condition. A later correction remains traceable through the inspection replacement chain. |
| Queryable component condition | `inspection_components`, `effective_inspection_components` | The normalized rows are projected transactionally from inspection JSON. Clients cannot edit the projection directly. The view includes approved observations with no approved replacement. It is historical: consumers must select the latest eligible observation and apply its review date before treating a component as current. |
| LGD-compatible region identifiers | `regions.lgd_code`, parent-level trigger, `region_descendants` | Optional numeric LGD identifiers are unique per authority and region level. Parent levels are checked. Parent/level identity is immutable, so rollups cannot acquire cycles through normal operations. Identifiers require external verification against the authoritative LGD source; entering a number does not certify a match. Independent roots are allowed for incomplete imported hierarchies. |
| Duplicate flagging | `duplicate_candidates`, `flag_duplicate`, `review_duplicate` | A user flags a same-department pair with a reason. A different verifier confirms or dismisses it. Confirming does not merge records or delete evidence. Automatic fuzzy detection remains a separate feature. |
| Approval evidence | `approval_evidence`, `link_approval_evidence` | The requester links live same-asset evidence while a decision is pending. Links cannot be edited directly by runtime and referenced evidence cannot be removed. Evidence requirements can depend on the target lifecycle stage. |
| Seven-language template labels | `department_templates.localized_labels`, `set_template_labels` | A bounded map holds labels for stable type/field/component/stage keys in `en`, `hi`, `gu`, `mr`, `bn`, `ta`, `te`. English or a stable key can be an application fallback. The schema supports labels; it does not supply every translation or translate recorded narratives. |
| Asset-specific evidence minima | `department_templates.evidence_policy`, `set_template_evidence_policy` | Field `required_at` lists additionally specify lifecycle stages where values become mandatory on submitted/verified assets. Draft versions can specify minima of 1–20 live evidence items by registration state, inspection state and lifecycle target. Example: `{"registration":{"submitted":2},"inspection":{"approved":2},"lifecycle":{"retired":2}}`. These add stricter requirements to the baseline workflow. Published/submitted definitions and labels are immutable; create a new version for a change. |
| Asset history indexes | B-tree history indexes for complaints/work, central authority/region/department index and parent/officer indexes | History queries include closed records rather than relying solely on partial open-queue indexes. These are workload choices, not a claim that the application has been benchmarked at national scale. |

Assignment validation occurs when an officer is assigned. Subsequent transfer or disablement can make an assignment stale; the application should show the inactive officer and request reassignment. A historical record should never silently change its custodian.

## Security boundary

Clerk authentication is verified by the server. Database role separation, private transaction context, RLS and an explicit mutation-function allowlist prevent ordinary runtime SQL from invoking owner-only bootstrap or worker identity operations. They cannot prove that a compromised trusted backend is asserting the correct Clerk subject. HMAC would require a separately managed signer and does not eliminate compromise of a backend that holds the signing capability. No claim of end-to-end resistance to a fully compromised backend is made.

Storage metadata constraints do not prove object ownership or protected delivery. The server must verify upload ownership, use tenant-prefixed keys, authorize downloads and protect internal/restricted objects. UI translations, notification delivery and webhook signature verification require application integration.

## Deferred recommendations

These are deliberately not claimed as implemented by the schema:

- Automatic multilingual fuzzy duplicate detection and semantic search relevance. The schema supplies `pg_trgm` GIN indexes and bounded literal substring search; Hindi, Gujarati and Tamil substring matching and tenant isolation passed local tests. Manual duplicate candidates are supported. Fuzzy similarity thresholds still need a labelled dataset and language-specific evaluation.
- Statutory technical, administrative and financial sanction tiers and role-specific spending limits. The prototype records independently reviewed estimates and permissions; it does not encode any government's delegation-of-financial-powers schedule.
- Acting-charge delegation, grant expiry on all memberships and periodic access recertification. Central scope proposals have a decision lifetime; that is not membership recertification.
- A fully maintained national-scale current-state materialized projection. Security-invoker reports should be measured first; add a transactional projection when measured latency and load justify its maintenance cost.
- PostGIS geometry and polygon-based region assignment. Current point coordinates and region references remain explicit user inputs. India-specific coordinate checks need handling for offshore assets and imported data rather than a universal guessed rectangle.
- Hash-chained audit records, external daily anchors, monthly partitions and report-result snapshots. Retained transactional audit and version checks are not tamper-proof external evidence.
- A legally approved data-retention/erasure programme and provider-confirmed download events. The database records authorised evidence-delivery requests; it does not prove actual downloads or legal compliance. Redacted audit, protected metadata and soft retention do not establish DPDP compliance. Reconcile retention, lawful access, incident evidence and erasure rules with the responsible authority before production use.
- Automatic scheduling of command-receipt pruning. The owner-only function enforces at least thirty days of retention; choose the retry contract before scheduling it.

Do not run `drizzle-kit push` against this manually installed schema. SQL functions, policies, grants and triggers are authoritative; an ORM read model must be introspected/reviewed without discarding these objects. Server mutations call the controlled functions through parameterized SQL in a transaction using the restricted runtime role.

## Local validation result

The complete installer passes 37 behavior/security groups in disposable PGlite PostgreSQL 18.3, including a second installation with `pg_trgm` already in another schema. Run `bun scripts/test-schema.mjs /private/tmp/pravi-schema-validation` in this workspace. The separate validator installation lives outside the repository; no runtime package was added to the app. This does not certify hosted Supabase, multi-session concurrency, authenticated routes, signed webhook delivery or private object delivery.

The `condition_observation_pairs` view exposes first/latest non-superseded, known-condition observations of the same asset and template version on different dates. It is a comparable sample for UI trend aggregation, not an as-of report snapshot. Consumers must show paired sample counts and date ranges.
