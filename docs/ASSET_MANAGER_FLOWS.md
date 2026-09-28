# Government infrastructure asset manager — operational flows

Design contract for the hackathon, 28 September 2026. These are target behaviours, not a claim that the application already implements them. Use `schema.sql` as the database contract; screens and handlers must enforce the same rules. The SQL is intended for manual owner review and execution, not automatic execution against Supabase.

## 1. Boundary and common transaction contract

Fixed public infrastructure belongs to departments: roads, bridges, buildings, culverts, drains, water tanks, pipelines, public parks, government land and utility structures. Roads, bridges and buildings are starters, not the only supported categories. Departments are tenants within a governing authority. A central administrator manages that authority; an explicitly granted central viewer reads its portfolio. Central visibility alone never confers engineering approval or department write privileges.

Clerk owns credentials, verified email, sessions, password recovery, and authentication. PostgreSQL stores the Clerk subject and authoritative application grants. There are no application passwords or Supabase Auth users. A Clerk organisation, if adopted later, is an integration identifier rather than an automatic grant of domain access.

For every operation:

1. Verify the Clerk session on the server and derive the actor from it, never the request payload.
2. Resolve current application membership, authority/department status, and permission. A department selector narrows authorised scope; it does not grant access.
3. Validate the category/version, typed fields, references, dates, quantities, units, and allowed state transition.
4. Open one database transaction with a restricted runtime role and transaction-local actor context. Do not query using the owner/service role in normal application flows.
5. Check the expected record version; lock workflow records when necessary. Update the record, its immutable domain history, and any reliable-delivery work together. Roll back all on failure.
6. Commit, then invalidate only the affected authorised views. Show success only after commit.

Retries use an idempotency key for operations that create durable records. The same key and payload produce the prior result; the same key with a different payload is a conflict. Client retries must not create duplicate invitations, inspections, works, or events. Concurrent stale edits return a conflict with an opportunity to reload/reconcile, rather than silently overwrite.

Database RLS supplements application guards. The trusted backend establishes actor context; this is not an end-user SQL API. Backend credentials must never reach the browser. Pooled connections use transaction-local context so a subsequent request cannot inherit the prior user.

External services and the database cannot share a PostgreSQL transaction. Use a durable integration/outbox record where the implemented schema supplies one, or an explicit retry/reconciliation procedure. Do not advertise exactly-once Clerk/email/file operations.

## 2. Governed role definitions and initial setup

| Role | Scope | Domain capability |
| --- | --- | --- |
| Authority administrator | One authority | Propose department creation and role/authority-access changes for independent governance approval; perform permitted deactivation/invitation administration. No implicit asset/engineering mutation role. |
| Central viewer/planner | Explicit authority or department grant | Read eligible records and aggregate reports; no mutation or approval. |
| Department manager | Active assigned department | Register/manage records; draft department-specific asset types/lifecycles; independently verify registrations/inspections where granted; manage subordinate assignments. Cannot publish templates, approve sensitive lifecycle actions, or self-promote. |
| Department senior approval capability | Explicit active department grant, assigned through approved authority governance | Independently publish department template versions; approve lifecycle, availability and archival requests; approve restoration and independently accept completion within policy. |
| Department officer | Active assigned department | Create/edit drafts, submit registration/inspection/work evidence, log/triage assigned complaints and execute approved work. |
| Pending/unassigned user | Identity only | Own account/profile and access-request state; no department inventory. |

The labels above describe starter capability bundles, not fixed role-name comparisons. `role_definitions` has authority, code, editable name, immutable scope (`authority` or `department`), version and active state. `role_permissions` selects known operations from a fixed permission catalog. Unknown operations, scope-incompatible operations and self-escalation fail. Rename a role without changing the memberships bound to its ID; never authorise by displayed title. “Senior” means the appropriate approval capability, not a compulsory job title. Configured asset transitions reference role/permission IDs rather than a title string.

A person may hold multiple explicit grants. Selecting central mode does not assume a departmental role. An independently acting reviewer cannot review their own submission, even when they hold manager privileges. Qualified-engineer review requirements are recorded departmental procedures, not inferred from the role label.

Initial owner setup is manual: execute the reviewed schema, sync two distinct real verified Clerk identities, then call the four-argument owner bootstrap to bind both initial administrators. Self-approval is forbidden. Do not identify administrators by an email suffix, allow first-user self-promotion, or seed a known password. Normal governance changes protect final effective administration and approval capabilities. Verified identity-provider security events always revoke access, even for the last administrator, and flag owner recovery rather than retaining a compromised identity. See `SCHEMA_INSTALLATION.md`.

## 3. Account and access flows

### 3.1 New user registration and login credentials

**Prerequisite:** Clerk sign-up is enabled under the chosen instance settings.

1. User opens sign-up and creates credentials through Clerk's supported flow.
2. Clerk verifies email/identity as configured. The application neither receives nor stores the password.
3. A verified webhook or authenticated first-use reconciliation upserts the application identity by Clerk subject. Replayed/out-of-order events must not duplicate or resurrect a deleted/disabled identity.
4. New identity starts without application grants and sees “Access pending” with sign-out/account-management options.
5. Administrator grants access or the user accepts a valid invitation. Refresh the access page after the grant; no re-registration is needed.

**Failure paths:** failed verification stays in Clerk; webhook delivery failure is retried and reconciled. Authenticated first-use sync does not grant privileges. Merely creating an account never exposes asset data.

### 3.2 Sign-in, session expiry, and sign-out

1. Clerk authenticates the user. The server verifies the session and current application identity/grants.
2. Select an authorised active department, or scoped central portfolio. If none exists, route to pending access.
3. Every read/write rechecks permissions; a revoked grant cannot remain effective through a cached client role.
4. Session expiry requests sign-in again. Preserve a draft locally only under an explicit policy; never resubmit automatically under another identity.
5. Sign-out clears application-sensitive query state. A subsequent user must not see cached private records.

**Failure paths:** disabled identity, inactive department, expired session, or missing grant returns a denial with useful next steps. Do not reveal whether a guessed asset ID exists in another tenant.

### 3.3 Password reset, account change, and recovery

Clerk handles password reset/verification using its configured recovery flow. The application stores no reset tokens or temporary passwords. Successful recovery does not change roles. Email changes update identity metadata after verified synchronisation; ownership/history remains tied to stable Clerk subject. Administrative identity deletion disables application access and preserves attributable history under retention policy.

### 3.4 Invitation and acceptance

1. Authority administrator selects an active authority/department and an allowed role. A department manager may invite only subordinate departmental roles where policy explicitly allows it.
2. Persist a pending invite with intended verified email, department, role, expiry and inviter. The schema binds acceptance to the real Clerk invitation identifier and verified recipient email; it does not mint an application invitation token.
3. Deliver an invitation through the configured authenticated service. Delivery failure leaves a retryable pending invite, not an active grant. If Clerk invitations are used, reconcile their identifiers/status rather than assuming delivery committed with SQL.
4. Recipient signs in/signs up through Clerk, then accepts while authenticated with the matching verified email.
5. Transactionally recheck expiry, inviter authority, scope activity, role eligibility, and recipient status; consume the invite and create the scoped grant once.
6. Show the newly available department. Record inviter, accepting identity, and acceptance time.

**Failure paths:** wrong verified email, expired/revoked/consumed invite, deactivated scope, or inviter no longer authorised fails closed. Retry after successful acceptance returns the existing grant. Reissuing revokes/replaces the old invitation explicitly. No password is emailed or placed in this file.

### 3.5 Governed role and authority-access administration

1. A permitted central administrator proposes `governance_requests` for `role_create`, `role_edit`, `role_retire`, or `authority_member`, with desired bounded permissions/scope, reason and expected target version.
2. Submission has no effect on definitions, permissions or memberships. A different active holder of authority `governance_approve` reviews the proposal.
3. Approval locks affected records and checks authority scope, both parties' current permissions, expected versions, catalog/scope compatibility and last effective administrator/approver protections. It applies the definition/permission/membership change and decision/history together, or rolls back all.
4. Scope of an existing role cannot change. Make a new role and explicitly reassign people when changing scope or retiring a role.
5. Role retirement previews active memberships, inactive memberships and pending invitations. Any active or inactive membership reference, or pending invitation, blocks retirement. If 10 people use a role, explicitly move all 10 through authorised membership operations, and reconcile invitations before proposing/approving retirement. Deactivating the 10 people does not make the role unused.
6. Version conflicts require reload and a new/reconciled proposal. Revoked requester/approver rights, self-approval and scope mismatch fail without side effects. Two simultaneous approvals cannot defeat final-holder protections.

Ordinary permitted department assignments are bounded by delegated permissions and cannot create authority privileges or arbitrary capabilities. Historical events preserve role identity/name context; removing access never deletes observations/assets authored by the user. Current access reflects approved definitions on every server operation, not a cached role title.

## 4. Authority, department, and region flows

### 4.1 Department creation

A central administrator proposes `department_create` in `governance_requests`, supplying authority, unique code/name and required metadata. Submission creates no department or grants. A different authorised authority `governance_approve` holder validates current rights, authority and uniqueness, then creates the department and records the approved decision/history atomically. Optional initial assignments must follow permitted governed grant operations rather than self-promotion. External Clerk organisation provisioning, if used, happens after commit through reconciliation; it is not part of SQL atomicity.

### 4.2 Department deactivation and deletion

Show assets, outstanding work, members, and the effect of deactivation before confirmation. Require a reason. Deactivation blocks new departmental work/normal departmental access while preserving records for authorised central oversight. It does not retire physical assets, resolve complaints, or complete restoration. Reactivation is explicit and audited. Physical deletion is limited to genuinely empty accidental departments if the schema permits it; dependent public records prevent deletion.

### 4.3 Canonical regions

Maintain authority-scoped administrative regions with a validated parent hierarchy, type/code, name, and active status. Reject cycles and cross-authority parents. Asset officers select existing regions rather than repeatedly spelling district names. Used regions are deactivated/corrected, not cascade-deleted. Region changes preserve the old attribution in asset history.

Roads crossing reporting regions require explicit segmentation/attribution before length-based comparison. A point coordinate does not mean the entire road belongs to that point's region. Full GIS intersections are outside the sprint; do not multiply a road's whole length across regions.

## 5. Department-specific configuration, registration and verification

### 5.0 Asset type and lifecycle configuration

1. Department manager or explicitly designated expert clones a global starter or creates a new fixed-asset type under the department. Other departments have separate configurations even for the same category name.
2. Save `department_templates` draft identified by department, code and version: typed attributes/units, inspection checklist/evidence requirements, lifecycle state IDs, initial state, allowed transitions, allowed requesting roles, and reviewer/senior-approval rules. The bounded editor supports structured forms or validated specification input; no drag-and-drop designer is required.
3. Validate stable keys, known role-definition IDs and fixed permission-catalog codes, required fields, state/transition references and initial state. Reject malformed specifications and impossible transitions. Configuration cannot remove server/SQL minimum senior-approval or independent-review protections.
4. Manager/expert submits the version. A different active holder of the configured department senior approval capability reviews and publishes or returns with a reason. Publication freezes the version/specification and records its author, publisher and decision.
5. Registration uses only a published department version. Existing assets/inspections remain pinned to their versions; a new publication affects new selection, not old records. Migration is explicit and not automatically performed during this sprint.

**Failure paths:** self-publication, same code/version collision, another department's template, missing senior grant, invalid specifications, stale draft or unpublished template selection fails. Published specifications cannot be edited in place. Template creation does not create users, grants, executable code or SQL expressions.


### 5.1 Template selection and draft

1. Officer selects active department and one of its published asset-type versions, including custom types. Road/bridge/building starter definitions can be cloned into that department.
2. Enter asset code, name, owner/custodian, canonical region, location, lifecycle stage, availability, known dates with precision/source, and typed category attributes.
3. Road: identifiable segment/chainage, length/unit, surface and endpoints. Bridge: type, spans/dimensions/material where documented. Building: use, storeys, area/unit and address.
4. Attach documentary references/evidence where required. Unknown historic age/cost stays unknown; never use zero or today's date as a replacement.
5. Save a draft with row version. Department code uniqueness rejects duplicates; suspected matches are review suggestions, not automatic merges.

Drafts may be incomplete, but typed values supplied must be valid. Changing category/version after observations exist requires an explicit migration/correction process; never reinterpret old inspection payloads.

### 5.2 Submission and independent verification

1. Submit performs stage-specific required-field and evidence validation and freezes the reviewed snapshot.
2. Manager/reviewer sees provenance, suspected duplicates, missing information, and supporting documents.
3. A different authorised person verifies or returns for correction with a reason. Corrected drafts resubmit a new version.
4. Verification records reviewer/time and an immutable event. Registration verification certifies record review within the prototype, not structural safety.

**Failure paths:** self-review, duplicate code, incompatible template, missing evidence, invalid dates/region, inactive tenant, stale version, or inadequate permission rolls back. The user sees field-level errors or a conflict. Draft/submitted records are not silently treated as verified inventory.

### 5.3 Corrections and ordinary CRUD

Officers edit their authorised unsubmitted drafts; authorised verifiers control verified master-record corrections. Material verified edits return registration to submitted for independent review and temporarily leave verified inventory metrics. Record a reason and redacted audit metadata. Approved inspection findings are corrected by superseding observations. The schema supplies no runtime hard-delete operation, including for drafts; retain or use permitted archival. Separate lifecycle retirement from administrative archival.

## 6. Inspection and condition assessment

1. Select verified asset and its versioned inspection definition. Display last approved assessment, observation date, freshness, unresolved complaints and restoration history.
2. Assessor records actual observation date, component observations, overall condition, limitations, next-review recommendation, and evidence. Use unknown/not inspected when a component cannot be assessed.
3. Save draft and submit. Validate date consistency, schema, required components/evidence and department linkage.
4. An independent authorised reviewer approves or returns it with reasons and the recorded next-review policy/date.
5. Only approved, non-superseded observations enter trusted condition reporting. A late-entered older inspection must not replace a more recent observation merely because it was inserted last.
6. An approved critical finding opens urgent engineer review; poor condition creates a restoration-assessment reason. The system does not select engineering treatment or certify safe use.

**Corrections:** preserve the original, create a replacement linked to it with a reason, and review the replacement independently. History remains inspectable. Submitted/rejected drafts never replace the approved condition. Age is contextual; a complaint or completed work cannot itself alter condition.

**Freshness:** absent approved inspection = unknown; past review date = stale/overdue. A stale good finding must not appear current good. Date-only inspection deadlines follow one documented reporting date/timezone policy.

## 7. Complaint intake, linking, triage, and resolution

1. Officer logs source/channel, actual reported date, original narrative, reported severity, location/reference, and optional contact data only if justified. Public anonymous intake/integration is future work.
2. Search by official asset code/name/category/region. Link only a confirmed departmental asset; leave ambiguous cases unlinked with an explicit matching task.
3. Triage assigns an officer and due date, documents severity and immediate response, and links inspection/restoration actions where applicable.
4. Severe unresolved reported hazards appear in urgent investigation even without an approved assessment, clearly labelled reported rather than verified.
5. Investigation records findings; resolution requires an explanation. Critical reported cases additionally require the schema's approved inspection, accepted work or independent senior closure path. Reopen when new evidence warrants it; preserve previous decisions. Ambiguous complaints can carry evidence before an asset is identified.

**Failure paths:** asset from another tenant, ambiguous match, unsupported closure reason, or duplicate external reference is rejected/flagged. Complaint resolution does not delete the complaint or mark the asset good. An unmatched complaint remains visible in the department queue, not fabricated into a new asset.

## 8. Restoration planning and execution

1. Officer/manager proposes intervention for one asset, linking approved inspection and/or complaint where available; records scope, justification, assignee, target date, and estimate status.
2. Estimate uses exact INR values, basis/source, estimator, date, and review state. Null means unpriced; zero requires an explicit legitimate basis. Scope/estimate revisions preserve prior versions.
3. Independent department senior approver accepts or returns proposal, documenting decision. Approval is an internal prototype work authorisation, not a tender, statutory sanction, or payment approval.
4. Assigned officer starts approved work and records milestones/evidence. Material scope/cost changes return for approval rather than silently mutating approved work.
5. Submit completion with actual dates, evidence, recorded outcome and actual cost where known. Completion alone leaves condition unchanged.
6. Independent authorised senior reviewer accepts completion or returns it for correction. A new independently approved inspection establishes any condition improvement and produces paired trend evidence. Link accepted work to an approved post-acceptance same-asset reinspection through `link_work_verification`; its assessor and reviewer must differ from the work executor.
7. Resolve linked complaints only with explicit justified resolution. Missing costing/reinspection remains visible in queues.

Cancellation requires reason; accepted work remains historical. Overdue work displays target date and accountable officer. Estimate revisions for the same work do not double-count in reports. Never sum indicative estimates, sanctioned budgets, and actual expenditure as one metric.

## 9. Evidence upload, read, and removal

1. Verify session, tenant, parent record and edit permission before issuing an upload authorisation.
2. Enforce allowed file types/size and safe metadata. Validate provider/storage ownership at completion; a supplied URL is not proof of an authorised upload.
3. Persist metadata: department, parent, provider/storage identifier, original name, MIME/size, uploader/time, caption/source reference, and access classification. Do not place secrets or unnecessary personal data in events.
4. Each download/preview calls `request_evidence_access` with a purpose, checks current classification access, and uses protected server delivery. The database logs an authorised delivery request, not proof of a completed download. Runtime metadata queries cannot select `object_key` or use `SELECT *`. Cloudinary is limited to synthetic public evidence; internal/restricted evidence requires protected storage delivery.
5. Draft evidence can be removed under policy with a history event. Evidence relied upon by approved records is retained or explicitly superseded, not silently detached.

Object-store upload and SQL cannot commit atomically. Failed metadata saves leave quarantined/orphan objects for a bounded cleanup/reconciliation process; failed file deletion must not erase the database's retention record. Until protected delivery is actually verified, demo media must be non-sensitive synthetic content and the limitation disclosed.

## 10. Lifecycle, transfer, retirement, and archive

Published department-specific templates define their own state IDs and permitted asset-specific transitions. Planning, construction, commissioning, resurfacing, rehabilitation, renovation and retirement are illustrative starter concepts, not a universal hard-coded lifecycle. Historical milestones record actual event date, precision, source and present insertion time. Lifecycle, registration, availability, assessed condition and restoration state remain separate.

**Sensitive action request and approval:** officer/manager submits an `approval_requests` record for lifecycle transition, availability change (including restriction, closure or reopening), or archival. Capture requested target, reason/evidence, actor and expected asset version. Submission does not mutate the asset or its reporting state. A different active holder of the configured department senior approval capability rechecks department scope, current grants, template transition permission, expected version and evidence, then approves and applies the change with its history event in one transaction. A stale asset, revoked permission or self-review rejects the action; no partial approved request may exist without its asset change. Rejection/cancellation preserves the request history. Approved requests cannot replay against a newer asset.

**Restrictions/closure:** closure does not retire the asset. Reopening requires the same independent senior request/approval path and applicable inspection evidence; completion of works cannot implicitly reopen it.

**Department transfer:** not an ordinary update of `department_id`. A future controlled operation needs source/target approvals, matching authority, eligible target, stable asset identity, coherent dependent records, and preserved former-custodian history. Disable transfer in the seven-hour UI unless the SQL supplies an explicitly tested atomic transfer function; never split parent/child tenancy through generic CRUD.

**Retirement:** manager/officer proposes the template-defined retirement transition with reason/evidence and mandatory independent senior approval; retain identity, inspections, complaints, works and events. Address outstanding work/cases explicitly; retirement does not auto-resolve them. Physical demolition/disposal/legal ownership change requires external departmental authority.

**Archive/retention:** archive removes a record from default operational lists but retains oversight access. No automatic purge is supplied; retention periods require the governing authority's decision. Audits are append-only to the application runtime, not tamper-proof against database owners.

## 11. Central search, regional planning, and trends

A non-admin central reader needs an active authority read role and an independently approved authority/department scope grant. Authority administrators retain authority-wide administrative visibility without implicit department mutation permissions. Server-filter and paginate all lists and exports; evidence and aggregates obey scope and classification. Deactivated records are visibly labelled and excluded/included consistently under the selected reporting filter.

For one category, region and reporting timestamp:

- Show verified versus unverified registered inventory separately; default condition metrics use an explicitly documented inventory denominator.
- Inspection coverage = currently approved assessed assets / in-scope inventory. Show denominator and stale/never-assessed counts.
- Poor/critical share = poor/critical assets / currently assessed assets. Zero assessed assets means “No current assessment”, not 0% poor.
- Preserve historical condition with stale labels; do not present it as current.
- Trends use first/latest comparable approved observation for the same assets and rubric in the observation period. Display paired sample size, exclusions and insufficient-history state.
- Restoration totals show reviewed outstanding estimate values, number unpriced, proposed/approved distinctions, and source actions. Exclude superseded estimates and avoid duplicate counting.
- Road lengths, bridge counts, and building counts/areas remain distinct. Regional development need cannot be inferred from condition alone; population, service coverage and demand remain future inputs.

Each headline opens its contributing records with matching scope, filters and reporting timestamp. Changing inventory/inspection coverage is not labelled deterioration. Reports are evidence for professional planning rather than automatically sanctioned budgets.

## 12. Multilingual and accessible flows

Application language targets: English, Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu (`en`, `hi`, `gu`, `mr`, `bn`, `ta`, `te`). Translate navigation, field labels, errors, statuses, confirmations and metric definitions through stable typed keys. Check released key parity; disclose vendor authentication locales that fall back to English.

Store enums/field IDs in canonical form. Preserve original official names, identifiers, descriptions and evidence; never translate persisted source records automatically. Format numbers, INR and dates for the selected Indian locale with a consistent Asia/Kolkata display convention. UTC timestamps remain canonical in storage.

Language switching preserves active scope, filters and unsaved input, and updates document language. Use native language names, Unicode input, readable Indic fonts, labelled controls, keyboard focus and text in addition to colours. Show explicit loading, empty, unauthorized, invalid-input, conflict and retry states in all core flows.

## 13. CRUD and approval matrix

All permissions below require an active identity, explicit scope and active department unless central historical read is specified. The SQL may intentionally expose stricter operation-specific functions; generic CRUD cannot bypass workflow transitions.

| Resource/operation | Officer | Department manager/expert | Senior approver | Authority administrator / central viewer |
| --- | --- | --- | --- | --- |
| Own identity/preferences | Allowed own metadata | Same | Same | Same |
| Department/grants | Read own scope | Allowed subordinate grants only | No self-promotion; domain grant is explicit | Admin proposes governed department/authority-grant changes; independent approver applies; viewer read only |
| Department template draft | Read published | Create/edit/submit own department definitions | Read/review | No implicit department write; scoped read |
| Template publication | No | No | Publish independent submission; immutable version | Requires separate senior department grant |
| Asset drafts/registration | Create/edit/submit authorised drafts | Manage; independently verify where granted | Within explicitly granted department capability | No implicit write; scoped read |
| Sensitive lifecycle/availability/archive | Request permitted action | Request permitted action | Independently approve/reject and atomically apply | Requires separate senior department grant |
| Inspection | Create/draft/submit | Independently review where granted | Independently review where granted | No implicit approval; scoped read |
| Complaint | Log/triage assigned cases | Manage/resolve/reopen scoped cases | Within explicit domain capability | Scoped read respecting personal-data permissions |
| Restoration | Propose/execute/submit assigned work | Manage/propose; cannot bypass senior approval | Independently approve proposal/accept completion | No implicit domain write; scoped read |
| Evidence | Editable-parent attachment/authorised read | Same | Same | Parent read and classification checks |
| History | Scoped read; no edit/delete | Same | Same | Scoped read; no normal edit/delete |
| Reports/export | Own department | Own department | Own department | Explicit authority/department read grants |
| Approved record deletion | No; supersede/archive procedure | Same | Same | No normal destructive access |

Configuration-defined role permissions may narrow operations. They never override enforced tenancy, minimum senior approvals, independent-review checks or grant assignment authority.

## 14. Index and search design

Use PostgreSQL B-tree indexes for department + asset code, tenant-filtered list/sort fields, parent IDs and observation dates. Partial B-tree indexes support open complaint/work/approval queues with predicates matching the actual queries. Index tenant-qualified foreign keys and frequently filtered membership/role associations.

Use a language-agnostic `tsvector` built with PostgreSQL `simple` configuration for source names/identifiers/narratives, with GIN for lexeme search. Preserve Unicode source text and do not claim morphological stemming across seven Indic languages; exact tokens/prefix behaviour require actual query tests. Keep tenant/RLS predicates on search and pagination. GIN on selected JSONB fields is justified only by implemented queries; not every JSONB column needs it.

PostgreSQL's ordinary B-tree/GIN architecture is the selected design. LSM is not a built-in substitute here; adding a database/search engine for it is outside the frozen stack and sprint. Indexes are proposed performance aids, not measured speed improvements. Verify query plans and representative tenant/category/queue searches before reporting benchmarks.

## 15. End-to-end demo and verification

Use synthetic records only: two departments, three regions, the three templates, at least two officer identities, a manager/configuration author and an independent senior approver. Seed an uninspected asset, stale observation, poor condition, unpriced restoration, and comparable repeated inspections.

Demonstrate: pending user cannot see inventory → administrator invites officer → manager drafts department-specific building lifecycle → different senior publishes → officer registers building → different manager verifies → complaint links to that building → officer submits inspection → manager approves poor condition → restoration proposed and approved → completion accepted independently → new approved inspection records improvement → central regional report drills into paired evidence → officer requests lifecycle change without changing the asset → senior approves the version-checked change → switch language without changing source records.

Before claiming a working flow, verify:

- Guessed IDs cannot cross department/authority for lists, reads, writes, evidence or exports.
- Central read cannot write; removed memberships stop working on the next request.
- Cross-tenant foreign keys, invalid transitions and self-review fail at database level where promised.
- Pending identities and missing transaction context have no domain access.
- Managers cannot grant themselves sensitive access; template author cannot publish their own version.
- Department/role/authority-member proposals leave targets unchanged until independent governance approval.
- Role retirement fails with active/inactive memberships or pending invites; reassign every referenced person before retirement.
- Role renames preserve ID-based permissions; existing scope changes fail. Stale governance versions cannot apply.
- Concurrent governance changes preserve effective administration and independent approval capabilities.
- Sensitive requests leave assets unchanged until independent senior approval; stale requests and replay cannot change assets.
- Existing assets retain published lifecycle/checklist versions after later template publication.
- Optimistic conflicts and repeated idempotency keys do not duplicate history/work.
- Domain mutation and its event roll back together.
- Draft/rejected/stale findings and unknown estimates do not produce misleading trusted metrics.
- Normal governance changes preserve final effective administrator/approver capabilities. Verified identity disablement or revocation still removes access and flags recovery.
- Actual restricted runtime credentials exercise RLS; owner-run tests do not establish runtime isolation.
- All seven released dictionaries cover every core screen; protected evidence delivery is independently tested or its absence disclosed.

Run the repository's required `bun run check`, `bun run typecheck`, and `bun run test` after changes. SQL requires actual PostgreSQL execution and role-level negative tests before being described as validated. Passing application tests does not prove SQL policies or external Clerk delivery.
