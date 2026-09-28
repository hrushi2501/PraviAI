# Manual schema installation and application integration

The root `schema.sql` is the complete installer. Review and execute that file yourself against a fresh Supabase PostgreSQL database. No live Supabase schema, user, password, bucket or deployment was changed during this work.

## 1. Review before executing

The installer requires PostgreSQL 15 or newer and an owner able to create schemas, roles and the supported `pg_trgm` extension. An existing `pg_trgm` installation is reused in its actual namespace. It runs inside one transaction, creates `asset_manager`, and reserves the group roles `pravi_runtime` and `pravi_identity_sync`. It refuses an existing application schema or either reserved role. It is a fresh-install file, not a repeatable migration, and contains no destructive reset. Preserve an existing installation and write a reviewed migration instead of deleting it to rerun the file.

Use an owner connection for installation only. Run the complete file, including its final RLS policies, explicit permission grants and `COMMIT`. If the SQL editor reports an error, roll back the transaction and resolve the error before retrying. Do not execute just a copied fragment. Confirm your hosted database version and owner privileges separately from local validation.

Table owners and roles with `BYPASSRLS` can bypass ordinary row policies. Application runtime must use its own restricted role rather than the installer owner or Supabase service credentials. See [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## 2. Provision separate server credentials

The installed group roles cannot log in. As owner, provision separate server login roles using strong independently generated secrets. The following is a template: replace its password placeholders privately and never commit the resulting text.

```sql
CREATE ROLE pravi_app_login LOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '<APP_PASSWORD_FROM_PRIVATE_SECRET_MANAGER>';
GRANT pravi_runtime TO pravi_app_login;

CREATE ROLE pravi_worker_login LOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '<DISTINCT_WORKER_PASSWORD_FROM_PRIVATE_SECRET_MANAGER>';
GRANT pravi_identity_sync TO pravi_worker_login;
```

Grant each login only its corresponding group. Do not grant the app login worker, owner, service, administration, role-creation or schema-creation privileges. Confirm the login cannot read application tables before selecting its group role. The login may select only a role for which it has membership; [PostgreSQL SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html) documents this boundary.

Set the app's server-only `DATABASE_URL` to the app login. Give the signed identity-webhook worker its own separate server-only connection. Do not expose either connection string in browser code or the submission README. Dedicated disposable demo-account credentials can be documented for judges; database passwords and vendor secret keys cannot.

Choose the supported direct, session-pooler or transaction-pooler connection for your deployment. Reuse the repository client in `src/db/index.ts`, which already sets `prepare: false` for transaction-pooler compatibility. Verify custom login usernames and TLS settings in your own project rather than guessing a connection string. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 3. Sync real identities and bootstrap two administrators

Clerk owns accounts, credentials and email verification. A signature-verified webhook uses the worker role and calls `sync_identity` with the actual Clerk subject, email, name, verification flag and provider update timestamp. An unverified identity receives no domain access. Normal identity sync never grants application roles.

Bootstrap requires two distinct real Clerk identities already synced as verified and enabled. Independently confirm both identities; do not mark arbitrary IDs verified for convenience. The owner-only bootstrap template is:

```sql
BEGIN;
SELECT asset_manager.bootstrap_authority(
  '<AUTHORITY_CODE>',
  '<AUTHORITY_NAME>',
  'user_REPLACE_WITH_FIRST_VERIFIED_CLERK_ID',
  'user_REPLACE_WITH_SECOND_VERIFIED_CLERK_ID'
);
COMMIT;
```

The returned authority UUID identifies the new governing authority. Bootstrap creates editable starter roles and grants both administrators authority administration and independent governance approval. A single administrator cannot approve their own proposal. The app and worker roles cannot execute bootstrap.

Create departments and regions through `request_governance` and `decide_governance`, with different authorised people proposing and approving. Department managers must be active verified identities assigned a valid department-scoped role. Additional authority memberships and role changes follow the same governance path. Department memberships use their controlled API. Logging in or joining a Clerk organisation does not itself assign any of these grants.

A non-admin central planner also needs an explicit approved `central_read_grants` scope. Use `request_central_read` and independent `decide_central_read`; a NULL department explicitly grants the authority portfolio. Authority administrators retain authority-wide administrative read access. Neither read capability confers department mutation or engineering approval permission.

## 4. One authenticated request, one transaction

Derive `userId` from Clerk's verified server session, never a request field. Every protected read or mutation runs in a transaction, selects `pravi_runtime`, and asserts that subject exactly once. The database rejects unverified/disabled identities and a second actor assertion in the same transaction.

The following uses the existing Drizzle client and bound SQL values. It is an integration example, not a handler already installed by the schema:

```ts
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const { userId } = await auth();
if (!userId) throw new Error("Unauthorised");

const result = await db.transaction(async (tx) => {
  await tx.execute(sql`SET LOCAL ROLE pravi_runtime`);
  await tx.execute(sql`SELECT asset_manager.set_actor(${userId})`);
  return tx.execute(sql`
    SELECT asset_manager.create_asset(
      ${departmentId}::uuid,
      ${JSON.stringify(validatedAssetInput)}::jsonb,
      ${requestId}::uuid
    )
  `);
});
```

Validate `departmentId`, the input and the idempotency UUID before entering this example. Do not concatenate request values into SQL, use `sql.raw` on user input, interpolate role names, or perform later reads outside the transaction. Reuse the same UUID for retries of the same create request. Supply expected versions for edits and reload on conflicts. Drizzle's transaction callback rolls back thrown failures; see [Drizzle transactions](https://orm.drizzle.team/docs/transactions).

Actor identity is stored in a private database table keyed by backend and transaction identity. Setting an arbitrary custom PostgreSQL setting does not alter the authenticated actor. This is a trusted-server assertion boundary, not database verification of a Clerk JWT. A compromised backend able to submit arbitrary initial subjects still requires incident response; no HMAC or full-backend-compromise resistance is claimed.

## 5. Read models and evidence delivery

`src/db/schema.ts` remains the boilerplate read-model location. It must be mapped to the installed SQL schema before relying on typed queries. Do not run `db:push` against this installation: it can omit or alter policies, triggers, custom roles and functions that the ORM model does not represent. Owner-reviewed introspection may establish read models later; normal mutations call the explicit SQL APIs.

Query the security-invoker reports inside the same actor transaction. Reports and components inherit department scope. Zero assessment coverage means no current evidence, not healthy infrastructure. Quantities must retain their units and parent/child distinction.

Evidence metadata has column-level read grants: runtime cannot `SELECT *` from `evidence` or fetch `object_key` directly. Call `request_evidence_access(evidenceId, purpose)` to authorise and log a delivery request, then deliver the object using protected server access. The event proves an authorised request; it does not prove that bytes were downloaded. Internal/restricted evidence cannot use public Cloudinary delivery. The server must verify tenant-prefixed object ownership before attaching metadata. Ambiguous complaints may hold evidence before an asset is identified.

## 6. Recovery and maintenance

Verified identity disablement or verification revocation always removes access, even for the final administrator. Such events must not be rejected merely to retain administrative access. The schema creates authority recovery flags, retaining records while access fails closed. Normal administrative role changes preserve distinct effective requester and approver identities, so a sole person cannot become their own only reviewer.

For a disabled account, the owner independently confirms the current verified Clerk account and a strictly newer provider update time, then calls `restore_identity(clerkId, providerUpdatedAt, reason)`. The owner-only function clears eligible tombstones and recovery flags. Do not expose it through a generic app administrator endpoint. A verification-only revocation can be corrected by a newer verified signed sync event; independently confirm that recovery flags are resolved and effective administrators/approvers exist before closing the incident.

Creation retry receipts store a payload hash and minimal result IDs/versions, rather than full submitted records. Owner-only `prune_command_receipts(cutoff)` refuses cutoffs newer than thirty days. Pruning ends deduplication for those old UUIDs, so use only after the documented retry window and never while an outstanding retry needs the receipt. This installer does not schedule maintenance.

Back up before migrations, retain audit according to authority policy, and verify hosted runtime credentials against at least two departments. Local tests cannot establish live Supabase grants, Clerk webhook delivery, private media delivery or deployed application behaviour. See `SCHEMA_REVIEW_FIXES.md` for implemented controls and deferred production recommendations.

## 7. Future migrations must repeat privilege checks

PostgreSQL per-schema default privileges cannot revoke privileges granted globally. The installer explicitly revokes access on every object it creates before committing; do not assume its schema-local default-privilege statements secure future objects under an owner with global PUBLIC/Supabase grants. Each future migration must explicitly revoke PUBLIC/browser-role function and table access, enable RLS, grant only its reviewed API/columns, and run the negative privilege tests before deployment. Do not change global defaults for unrelated schemas merely to migrate this application. See [ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).
