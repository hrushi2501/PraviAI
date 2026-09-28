import postgres from "postgres";

// Owner-run initial setup only. Clerk verifies identities; this script never
// creates accounts, changes passwords, or invents email verification.
const [primaryEmail, secondaryEmail] = process.argv.slice(2);
if (
  !primaryEmail ||
  !secondaryEmail ||
  primaryEmail.toLowerCase() === secondaryEmail.toLowerCase()
) {
  throw new Error("Provide two distinct registered administrator emails.");
}

async function verifiedUser(email) {
  const result = Bun.spawn(
    [
      "clerk",
      "api",
      `/users?email_address=${encodeURIComponent(email)}&limit=2`,
      "--instance",
      "dev",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const output = await new Response(result.stdout).text();
  if ((await result.exited) !== 0)
    throw new Error("Clerk account lookup failed.");
  const users = JSON.parse(output);
  if (!Array.isArray(users) || users.length !== 1)
    throw new Error(
      `Exactly one registered Clerk account required for ${email}.`,
    );
  const user = users[0];
  const primary = user.email_addresses.find(
    (address) => address.id === user.primary_email_address_id,
  );
  if (
    primary?.email_address.toLowerCase() !== email.toLowerCase() ||
    primary?.verification?.status !== "verified" ||
    user.banned ||
    user.locked ||
    user.deprovisioned ||
    !Number.isFinite(user.updated_at)
  )
    throw new Error(
      `An active account with this verified primary email is required: ${email}.`,
    );
  return {
    id: user.id,
    email: primary.email_address,
    name:
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username ||
      email,
    updated: new Date(user.updated_at).toISOString(),
  };
}

const [primary, secondary] = await Promise.all([
  verifiedUser(primaryEmail),
  verifiedUser(secondaryEmail),
]);
if (primary.id === secondary.id)
  throw new Error("Two distinct Clerk identities required.");
const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connection)
  throw new Error("An owner database connection must be configured privately.");
const db = postgres(connection, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
});
try {
  const result = await db.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('pravi_initial_admin_setup'))`;
    for (const user of [primary, secondary])
      await tx`select asset_manager.sync_identity(${user.id}, ${user.email}, ${user.name}, ${true}, ${user.updated}::timestamptz, 'en')`;
    const existing = await tx`select id from asset_manager.authorities`;
    if (existing.length) {
      const grants =
        await tx`select authority_id, clerk_id from asset_manager.authority_memberships where clerk_id in (${primary.id}, ${secondary.id}) and role='authority_admin' and active`;
      const complete = existing.find((authority) =>
        [primary.id, secondary.id].every((id) =>
          grants.some(
            (grant) =>
              grant.authority_id === authority.id && grant.clerk_id === id,
          ),
        ),
      );
      if (!complete)
        throw new Error(
          "An authority already exists; further admin grants require the governance workflow.",
        );
      return { authorityId: complete.id, alreadyConfigured: true };
    }
    const [authority] =
      await tx`select asset_manager.bootstrap_authority('PRAVI', 'Pravi', ${primary.id}, ${secondary.id}) as id`;
    return { authorityId: authority.id, alreadyConfigured: false };
  });
  console.log(
    JSON.stringify({
      ...result,
      primaryEmail: primary.email,
      secondaryEmail: secondary.email,
      role: "authority_admin",
      departmentPermissions:
        "Assigned separately through governed department roles",
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error && !error.code
      ? error.message
      : "Administrator setup failed; review the database role and schema.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
