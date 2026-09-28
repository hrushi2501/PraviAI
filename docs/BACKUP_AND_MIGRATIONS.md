# Backup, restore and schema-change runbook

This runbook is preparation, not evidence of a configured hosted backup or successful restore. No live database operations were performed. `schema.sql` is a fresh installer and refuses existing schema/group roles; never drop an existing application to rerun it.

## Required ownership and evidence

The database owner confirms actual provider backup/PITR availability, retention, backup encryption/access, recovery-point and recovery-time targets, and restore permissions. Record the inspected configuration and a dated disposable restore result. A paid tier or connected API does not prove restore capability. Protect backup artifacts as sensitive government records even when the development fixtures are synthetic.

Use a dedicated read/backup connection through a private libpq service definition/passfile or approved secret manager. Do not put credentials in command arguments, committed files, CI logs or source ZIPs. Do not store dumps under this repository. Confirm your pg_dump client supports the actual server major version and provider restrictions. No pg_dump/psql dependency is added to the application runtime.

## Backup and disposable restore drill

1. Confirm the exact source project/database identity and authorized backup scope. Inventory schema, extensions, roles, grants/RLS, functions/triggers, sequences, and privately stored media references. Database dumps do not back up Clerk accounts, storage object bytes or external provider configuration.
2. Inspect provider snapshots/PITR first. If an authorized logical export is appropriate, run `PGSERVICE=pravi_backup_read pg_dump --format=custom --no-owner --no-acl --file=<PRIVATE_BACKUP_PATH>`. The service name/path must be privately configured. Apply approved encryption and retention; record checksum and timestamp without publishing private metadata.
3. Provision a **separate disposable** database named `pravi_test_restore_<DATE>` on localhost or a separately authorized staging project. Confirm target identity using `SELECT current_database(), current_user`. Never use the production hostname/credentials as the restore target.
4. Recreate reviewed extension/role prerequisites on the disposable target. A `--no-owner --no-acl` export omits original ownership/permissions; explicitly restore/test the reviewed runtime and identity-worker grants. Do not claim a table-only restore preserved security.
5. Restore with a reviewed `pg_restore --exit-on-error --single-transaction --no-owner --no-acl` operation against the independently confirmed target. No automatic script here selects a live destination or performs destructive cleaning.
6. Validate row counts, latest accepted workflow records, sequence continuity, relationships, published template pinning, evidence references, audit attribution and representative authorized/denied queries under dedicated app/worker login roles. Use synthetic copied test fixtures where privacy policy requires it. Test the application against this target without sending invitations/emails or public media writes.
7. Record duration, backup timestamp/data gap, omissions, failures and corrective actions. Delete or retain the disposable instance/artifact under approved policy. A successful `pg_restore` exit alone is not a complete recovery test.

## Migrations and rollback

- Prepare incremental reviewed SQL/Drizzle migration files for an existing installation; do not apply the fresh installer or broad `db:push` to a populated production database.
- Rehearse against a disposable restore of the actual schema version. Test existing data, RLS/procedure grants, actor/worker roles, pinned definitions, constraint failures and independent workflow approvals.
- Prefer expand → backfill → compatibility validation → application switch → later contract. Keep old columns/paths until the rollback window closes; irreversible data loss cannot be reversed by `ROLLBACK` after commit.
- Bound backfills with explicit scope/checkpoints and verify counts/invariants. Take a confirmed recoverable backup before destructive schema operations. Decide maintenance/lock budgets from representative data, not invented performance numbers.
- Use transaction rollback for atomic migration failures where PostgreSQL permits it. A committed migration requires its tested reverse/forward-repair procedure or verified backup restoration; label non-reversible steps explicitly.
- Apply only with separately authorized owner credentials and a known target/release. Runtime credentials must not acquire owner/DDL privileges. Record migration identifiers, database version, checksum, successful checks and actual release identity.

## Safe local integration command

`bun scripts/test-postgres-integration.mjs` accepts only an explicit `PRAVI_DISPOSABLE_OWNER_URL`, `PRAVI_ALLOW_DISPOSABLE_TEST=1`, localhost, and database names matching `pravi_test_*`. It never falls back to app `DATABASE_URL` or `DIRECT_URL`, refuses an already installed application schema, and never resets a database. It runs owner setup only in that dedicated fresh target, then exercises real repositories/services using a separate restricted login. Run it in an isolated PostgreSQL cluster because installer group-role names are cluster-wide. The CI PostgreSQL service is disposable by design.

The new PostgreSQL service job has not been executed in this local session: no local PostgreSQL server or running Docker daemon was available. CI must supply the real passing result before this harness is described as verified. The existing disposable PGlite harness remains separately documented evidence.
