# Government infrastructure asset manager — vision summary

Prepared 28 September 2026. This describes the agreed product direction and intended controls. It does not claim that the application or database capabilities below have been implemented or verified.

## The problem we are solving

Government departments own fixed physical infrastructure: roads, bridges, buildings, culverts, drains, water tanks, pipelines, parks, land and other public structures. The product provides a reliable central record of these assets and turns inspection, complaint and restoration evidence into useful operational and regional planning decisions.

The primary questions are:

1. Which assets need inspection or restoration, why, and who must act?
2. When a complaint concerns an asset, what is its last verified condition, how old is that evidence, and what work has already happened?
3. Which regions have an observed restoration backlog, how complete is the evidence, and what restoration costs have actually been estimated?

The vision is more than an asset directory. It is a department-aware system of record with asset-specific lifecycle rules, attributable observations, independent senior approvals and an enduring history.

## Government organisation and access

Each government department is a tenant within a governing authority. Department users work within explicitly assigned departments. Central planners and specially authorised users can inspect records across the departments covered by their grants. Central access is scoped to the authority and the granted operations; it is not automatic nationwide access or automatic permission to approve engineering findings.

Departments are configurable records, not a fixed list in source code. Creating a department requires a proposal and independent authorised approval. Deactivating a department with existing assets preserves the records and history. An administrative change must not erase physical infrastructure or imply that the infrastructure was retired.

Clerk handles sign-up, sign-in, credential creation, account recovery and identity verification. The application handles department memberships and domain permissions. A successful login alone does not grant access to government records. Never store user passwords in the application database.

The intended user journey is invitation or registration through Clerk, followed by an authorised membership grant. An unassigned user sees an access-pending state. Authority-level grants require the governance procedure; department membership administration follows the granted capabilities and must not allow self-promotion. Revocation blocks subsequent protected actions even when the person still has a valid login session.

## Flexible roles with controlled authority

Role names and role definitions are editable. The system must not depend on fixed titles such as Assistant Manager, Senior Engineer or Department Officer. Those can be starter examples; access is based on stable role IDs and permissions.

The permission catalog is bounded by implemented operations. Administrators can assemble roles from known capabilities; inventing a new permission label does not create a new executable operation. Every role has an immutable authority or department scope, and a department assignment applies only to that department.

Role creation, permission changes, retirement and authority membership changes are governance proposals. A different authorised governance approver reviews them. Proposed changes do not affect access until approval. Approval rechecks the current version and cannot remove the last effective authority administration or governance approval capability.

If the Assistant Manager role has ten assigned profiles, retirement must fail with a useful blocker count. Inactive assignments and pending invitations also count. An administrator must explicitly reassign or revoke those assignments before requesting retirement. The system must not silently move people into a more powerful role, delete their logins or leave their history without an attributable identity.

Renaming a role preserves its ID and existing access. Approved role changes affect future authorisation checks while historical decisions preserve who acted and the relevant decision context.

## Different assets need different lifecycles

The shared asset record holds stable identity, department, owner and maintenance custodian, location and canonical region, category, provenance, lifecycle state, availability and timestamps. Category-specific fields live in a validated, versioned definition rather than separate incompatible applications for roads and buildings.

The first starter categories are:

| Category | Example specific information | Example observations and interventions |
| --- | --- | --- |
| Road segment | Chainage/endpoints, section length, surface and class | Surface defects, drainage, shoulders, resurfacing and widening |
| Bridge | Span, type, dimensions and material where documented | Deck, bearings, superstructure, substructure, restrictions and rehabilitation |
| Public building | Use, storeys, area, commissioning date and date precision | Water ingress, visible distress, services, renovation and change of use |

Departments can introduce further asset categories. A responsible manager or designated expert drafts the definition: fields, types, units, requiredness by stage, component inspection checklist, evidence requirements, lifecycle states and allowed transitions. A different senior approver publishes it.

Published definitions are immutable versions. Assets and inspections retain the version used to create or assess them. A later template change must not silently reinterpret historic data. Any future migration of existing assets must be explicit and reviewed.

Configuration cannot weaken minimum security, approval independence or audit rules. The seven-hour implementation should offer a bounded structured configuration editor, not a drag-and-drop universal workflow engine.

## Keep five meanings separate

| Dimension | What it answers |
| --- | --- |
| Registration quality | Is the record a draft, submitted, verified or awaiting correction? |
| Lifecycle | Which stage of its department-defined lifecycle is the asset in? |
| Service availability | Is it in service, restricted, closed or unknown? |
| Condition | What does the latest approved inspection say, when was it observed, and is it current? |
| Restoration progress | Has a proposed intervention been approved, started, completed and accepted? |

A commissioned building may be closed, have poor condition and have restoration awaiting approval at the same time. One status field cannot express all of this.

Age is context, not an engineering diagnosis. Missing age remains unknown. A complaint signals a concern, not a verified condition change. Work completion alone does not prove the asset improved; a subsequent approved assessment establishes that.

## The core flows

### Asset registration and verification

An authorised user chooses the department and a published asset definition, enters identity, location, ownership and relevant attributes, attaches source evidence, and saves a draft. The server validates the tenant, template and values. The user submits the record for independent verification. A reviewer approves it or requests corrections with reasons. Missing historic information remains explicit rather than fabricated.

Suspected duplicates are flagged for review. A weak name match must not automatically merge assets. A road is represented at a meaningful section level so mixed condition and regional attribution are not concealed.

### Lifecycle, closure and archival decisions

An officer requests an allowed lifecycle transition, service restriction/reopening or archival action with a reason and evidence. Submission leaves the effective asset state unchanged. A different authorised senior approver checks the request, current permissions, allowed transition and expected asset version. Approval commits the decision, asset change and history together; rejection records the reason. Stale or self-approved requests fail.

Historical milestones can be recorded with their actual event date and source reference, while the insertion timestamp remains the current server time. Archival preserves evidence; it is not an unrestricted deletion operation.

### Complaint and investigation

An officer searches for the exact asset and logs the complaint. If identification is ambiguous, the complaint remains unresolved until a person confirms the link. Asset details show the last approved condition, evidence age, prior complaints and interventions. Triage records reported urgency and responsibility. A severe report enters an urgent investigation queue without replacing verified condition.

### Inspection and approval

An authorised assessor uses the asset's versioned category checklist, records component observations, overall assessment, observation date and evidence, and submits it. An independent authorised reviewer approves it or requests correction. Only approved observations feed trusted condition reporting. Approved findings are preserved; corrections supersede them with a reference and explanation rather than silently overwriting them.

Inspection freshness follows the recorded departmental policy and next-review date. No universal engineering interval is invented.

### Restoration and verification

A responsible officer proposes work from an inspection or complaint, records scope, ownership, deadline and an estimate with its basis and status. A different senior approver authorises it. Progress and completion evidence are recorded. An independent senior reviewer accepts completion, and a new approved inspection establishes the resulting condition. The original findings and decisions remain visible.

### Regional planning

Central users filter by authorised departments, region and category. They see inventory coverage, current approved condition, unknown/stale evidence, open work, reviewed restoration estimates and unpriced actions. Every total opens its contributing records.

## What makes the system smart

Attention comes from visible evidence-based rules:

- Approved critical finding: urgent competent-engineer review.
- Severe unresolved complaint: urgent investigation.
- Approved poor condition: restoration assessment required.
- Passed inspection deadline: inspection overdue.
- Passed work deadline: restoration overdue.
- No approved inspection: condition unknown.

An asset may have several reasons. Each reason shows its source, date and accountable person. The system supports decisions without inventing a national health score, predicting structural safety from age or automatically prescribing engineering treatment.

Regional comparisons distinguish condition from evidence coverage. A region with few inspections cannot appear healthy because unknown assets were counted as good. Compare roads in lengths and bridges/buildings in appropriate category measures rather than combining them into an unexplained engineering average.

Trends compare repeated compatible approved observations of the same assets using observation dates. Show the paired sample size and exclusions. Changes in inventory or inspection coverage must not be described as physical deterioration.

Restoration totals use sourced, reviewed estimates and avoid counting multiple revisions of the same work. Missing prices remain visible. The result is an observed restoration backlog, not sanctioned funding or a complete new-development budget. New-development planning additionally needs population, demand, service coverage and capacity data.

## Multilingual and accessible experience

The hackathon target is English, Hindi, Gujarati, Marathi, Bengali, Tamil and Telugu. Translate interface labels, template labels, actions, validation, approval messages, attention reasons and metric explanations with bundled dictionaries.

Original asset names, official IDs, narratives, observations and evidence retain their source language. Language changes must preserve filters, department scope and unsaved form data. Use native language names, appropriate Indic rendering and Indian number/date/currency formatting. Clerk's actual supported authentication locales must be checked separately; unsupported sign-in translations need a disclosed fallback.

Keep active department and central scope visible. Show evidence freshness and the next action prominently on asset details. Use draft saves, explicit units, helpful errors, unknown options, keyboard navigation, visible focus, readable contrast, mobile layouts and text alongside colour. Translation coverage and human review are separate checks; dictionary completeness does not imply professional translation approval.

## Schema, transactions and enforcement

The requested deliverable is a reviewable, one-run `schema.sql` in this repository, intended to be run manually by the owner. No live Supabase schema changes are authorised by this request. SQL preparation is in progress; this summary does not assert that it is finished, deployed or runtime-tested.

The intended relational model covers authorities, departments, regions, identities, membership/invitation grants, roles and permission assignments, governance requests, versioned templates, assets, approvals, complaints, inspections, restoration actions, evidence and append-only asset events.

Tenant-qualified foreign keys prevent cross-department child links. Server validation and restricted database credentials work with tested PostgreSQL row-level security. Clerk identities require verified transaction-local context for direct Drizzle connections; neither a client-supplied department ID nor enabling RLS on its own proves isolation. Connection pooling must not retain another request's tenant context. Privileged database owner/service roles must not be treated as ordinary policy-enforced application roles.

Business mutations and their history entries are atomic transactions. Expected versions prevent stale overwrites; retryable submissions use idempotency protections. Approval independently rechecks actor permission and target state. Records referenced by assignments, evidence and history cannot be casually cascade-deleted. Application history is append-only for runtime users, not a claim of tamper-proof protection against database administrators.

## Performance without unsupported promises

Use PostgreSQL's supported indexes based on actual query patterns: tenant-first B-tree indexes for identity, region/category, status and dated lookups; partial indexes for open complaints, outstanding works and approval queues; and suitable indexes for tenant-qualified foreign keys. A GIN index can support token search or demonstrated JSONB containment needs. Do not add every possible index: each index adds write and storage cost.

Ordinary PostgreSQL does not offer an LSM-tree switch for these tables. LSM is not a universal faster choice, and replacing the frozen database stack would not make this hackathon more credible. Pagination, bounded queries, avoiding per-row fetches, selective projections and measured query plans matter more than a promise to be the fastest system ever. Nationwide scale requires representative data, load testing and operational validation.

## Seven-hour scope and demonstration

Prioritise tenant enforcement, dynamic role governance, department-specific templates and senior approvals alongside one complete complaint-to-inspection-to-restoration journey. Add derived regional reporting and the seven-language interface. Freeze optional scope early enough to validate and package the result.

Defer AI prediction, elaborate GIS, offline synchronisation, public grievance integrations, general workflow design, tendering, payments, procurement systems and national deployment claims. The prototype can retain historical planning/construction milestones without claiming to implement those entire processes.

The demonstration should show a central planner comparing regional condition and coverage; an officer locating a building from a complaint; a new inspection independently approved; restoration proposed with a sourced synthetic estimate and senior approval; completion followed by reinspection; and a regional trend based on comparable records. Also demonstrate denied cross-department access, independent template publication, a transition that remains pending until approval, blocked retirement of an assigned role, and language switching without changing source records.

Submission artefacts are the actual architecture diagram, source ZIP, deployment and reviewer demo accounts, screen recording, README, assumptions and validation evidence. Demo data must be labelled synthetic. Demo credentials may be documented; provider secrets and database credentials must not be committed.

## Current status and honest boundaries

- The user reports a working boilerplate and checked service APIs. This summary does not independently revalidate that claim.
- The detailed implementation plan exists at `docs/GOVERNMENT_ASSET_MANAGER_PLAN.md` and has been refined as requirements developed.
- This file summarises the vision; it makes no application changes.
- The standalone schema now includes the reviewed security and workflow corrections; local verification is being completed separately. `SCHEMA_REVIEW_FIXES.md` distinguishes implemented database controls from deferred features, and `SCHEMA_INSTALLATION.md` documents manual owner setup. Application handlers/screens still require integration. No live Supabase changes are requested or claimed.
- Government references inform design. The prototype is not certified, endorsed, engineering-approved or proven to meet every central/state departmental rule. Actual adoption needs applicable manuals, professional review, security/accessibility assessment, hosting approvals and operational testing.

The guiding standard is that every important record, permission, approval and regional conclusion should have an understandable source, authorised actor and preserved history.
