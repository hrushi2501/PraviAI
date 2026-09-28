# Local schema validation

Validated 28 September 2026 against disposable PGlite PostgreSQL 18.3 with its bundled pg_trgm extension. No live Supabase connection was used.

- Complete installer: 40 behavior/security groups passed in the latest fresh audit rerun, including server-derived snapshots.
- A second fresh installation passed with pg_trgm already installed in public.
- Runtime and worker role separation, all-table RLS, tenant-qualified children, denied direct mutations/internal helpers, protected transaction identity, independent governance and workflow approvals, dynamic templates/roles, evidence privacy, Clerk invitation binding, identity security events and Indic substring search were exercised.
- Repeat installation refuses without deleting existing objects.

Run locally:

```sh
bun scripts/test-schema.mjs /private/tmp/pravi-schema-validation
```

The validator dependency remains in the isolated temporary directory; the app package manifest and lockfile were not changed for SQL testing. To run elsewhere, install the same PGlite validator in a separate directory and pass its absolute path. The harness imports the bundled pg_trgm extension there.

The schema SHA-256 for this run is:

```
14c3183f28bf5e48de9c6e84a6879b4e27dd13e8bb59b34691d797da42ffaac1
```

This evidence covers the SQL file and local tests. It does not prove hosted Supabase owner privileges, deployed credential configuration, signed Clerk webhook delivery, authenticated UI routes, private media delivery or multi-session concurrency. The installer preserves an existing extension namespace and does not configure storage buckets. Application integration remains explicit separate work.

See [manual installation](SCHEMA_INSTALLATION.md) and [review corrections](SCHEMA_REVIEW_FIXES.md).

## Fresh audit corrections

The current rerun initially exposed stale harness fixtures and a real invitation acceptance defect. The harness now gives districts a state parent, expects assigned-role retirement to fail at proposal, and isolates confirmed duplicate candidates from the later registration-verification journey.

`accept_invitation` previously referenced nonexistent `department_memberships.granted_at` in its upsert. It now refreshes the existing `updated_at` while preserving `created_at`. The existing first-acceptance and retry checks pass, and a new regression group verifies reactivation of an inactive membership preserves creation time and advances update time. The complete disposable local run passes 38 groups. No hosted database was changed.

## Server-derived reporting snapshot validation

The latest complete canonical schema run passes 40 groups. New groups exercise current server-derived inventory/condition/restoration/measure snapshots: exact authorized scope, server actor/time, denied cross-department and unauthorized authority-wide generation, retry identity/mismatched retry rejection, whole-authority grant visibility and twice-repeatable additive migration. Estimate paise and recorded quantities are frozen as decimal strings to preserve precision through JSON consumers.

`migrations/20260928_server_report_snapshots.sql` is owner-run and additive; no hosted installation/migration was applied during this validation. Existing deployments require its reviewed application before the new UI generator can operate. It does not reconstruct arbitrary historical dates or accept caller totals.
