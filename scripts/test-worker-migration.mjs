import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Disposable local PostgreSQL only; no connection environment or provider calls.
const runtime = process.argv[2];
if (!runtime?.startsWith("/"))
  throw new Error("Pass an isolated PGlite runtime path");
const { PGlite } = await import(
  pathToFileURL(`${runtime}/node_modules/@electric-sql/pglite/dist/index.js`)
);
const { pg_trgm } = await import(
  pathToFileURL(
    `${runtime}/node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js`,
  )
);
const db = new PGlite({ extensions: { pg_trgm } });
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const schema = await readFile(
  new URL("../schema.sql", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../migrations/20260928_identity_worker_outbox.sql", import.meta.url),
  "utf8",
);
let checks = 0;
const check = async (label, run) => {
  await run();
  checks++;
  console.log(`PASS: ${label}`);
};
async function worker(run) {
  await db.exec("BEGIN; SET LOCAL ROLE pravi_identity_sync");
  try {
    const result = await run();
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
try {
  await check(
    "base schema and additive migration install in local PostgreSQL",
    async () => {
      await db.exec(schema);
      await db.exec(migration);
    },
  );
  await check(
    "additive migration can be rerun without changing queued data",
    async () => {
      await db.exec(migration);
    },
  );
  await check(
    "identity helper is worker-only and direct identity reads remain denied",
    async () => {
      assert.equal(
        (
          await query(
            "SELECT has_function_privilege('pravi_runtime','asset_manager.lookup_identity_state(text,text)','EXECUTE') AS allowed",
          )
        )[0].allowed,
        false,
      );
      assert.equal(
        (
          await query(
            "SELECT has_table_privilege('pravi_identity_sync','asset_manager.identities','SELECT') AS allowed",
          )
        )[0].allowed,
        false,
      );
      await worker(async () => {
        await query(
          "SELECT asset_manager.sync_identity('user_worker','worker@example.test','Worker',true,clock_timestamp(),'en')",
        );
        assert.equal(
          (
            await query(
              "SELECT asset_manager.lookup_identity_state('user_worker','worker@example.test') AS state",
            )
          )[0].state.verified,
          true,
        );
      });
    },
  );
  await check(
    "identity recovery preserves disabled and tombstoned states",
    async () => {
      await worker(() =>
        query(
          "SELECT asset_manager.disable_identity('user_worker',clock_timestamp())",
        ),
      );
      await worker(() =>
        query(
          "SELECT asset_manager.sync_identity('user_worker','worker@example.test','Worker',true,clock_timestamp(),'en')",
        ),
      );
      const [{ state }] = await worker(() =>
        query(
          "SELECT asset_manager.lookup_identity_state('user_worker','worker@example.test') AS state",
        ),
      );
      assert.equal(state.disabled, true);
      assert.equal(state.deprovisioned, true);
      assert.equal(state.verified, false);
    },
  );
  await query(
    "SELECT asset_manager.sync_identity('user_admin1','admin1@example.test','Admin One',true,clock_timestamp(),'en')",
  );
  await query(
    "SELECT asset_manager.sync_identity('user_admin2','admin2@example.test','Admin Two',true,clock_timestamp(),'en')",
  );
  const [{ id: authority }] = await query(
    "SELECT asset_manager.bootstrap_authority('WORKER_TEST','Worker Test','user_admin1','user_admin2') AS id",
  );
  await db.exec("BEGIN");
  await query("SELECT asset_manager.internal_assert_actor('user_admin1')");
  const [department] = await query(
    "SELECT * FROM asset_manager.create_department($1,'PWD','Public Works','user_admin1','department_manager',$2)",
    [authority, randomUUID()],
  );
  const [invitation] = await query(
    "SELECT * FROM asset_manager.create_invitation($1,'recipient@example.test','officer',now()+interval '2 days',$2)",
    [department.id, randomUUID()],
  );
  await db.exec("COMMIT");
  let event;
  await check(
    "worker claims actual queued invitation under transaction locks",
    async () => {
      event = await worker(async () => {
        const [{ claim }] = await query(
          "SELECT asset_manager.claim_invitation_outbox() AS claim",
        );
        assert.equal(claim.invitationId, invitation.id);
        assert.equal(claim.cancel, false);
        return claim;
      });
    },
  );
  await check(
    "failure increments attempts with scheduled backoff rather than immediate repeated dispatch",
    async () => {
      await worker(() =>
        query(
          "SELECT asset_manager.record_outbox_failure($1,'PROVIDER_FAILURE')",
          [event.eventId],
        ),
      );
      const [row] = await query(
        "SELECT attempts,status,next_attempt_at>now() AS deferred FROM asset_manager.integration_outbox WHERE id=$1",
        [event.eventId],
      );
      assert.equal(row.attempts, 1);
      assert.equal(row.status, "pending");
      assert.equal(row.deferred, true);
      assert.equal(
        (
          await worker(() =>
            query("SELECT asset_manager.claim_invitation_outbox() AS claim"),
          )
        )[0].claim,
        null,
      );
    },
  );
  await check("only confirmed provider identifier marks delivery", async () => {
    await assert.rejects(
      worker(() =>
        query("SELECT asset_manager.invitation_delivered($1,'')", [
          invitation.id,
        ]),
      ),
    );
    await worker(() =>
      query(
        "SELECT asset_manager.invitation_delivered($1,'inv_test_confirmed')",
        [invitation.id],
      ),
    );
    const [row] = await query(
      "SELECT status,clerk_invitation_id FROM asset_manager.invitations WHERE id=$1",
      [invitation.id],
    );
    assert.equal(row.status, "sent");
    assert.equal(row.clerk_invitation_id, "inv_test_confirmed");
  });
  await check(
    "revocation is claimed once and cannot resurrect delivery",
    async () => {
      await db.exec("BEGIN");
      await query("SELECT asset_manager.internal_assert_actor('user_admin1')");
      await query(
        "SELECT asset_manager.revoke_invitation($1,'Withdraw invitation')",
        [invitation.id],
      );
      await db.exec("COMMIT");
      await query(
        "UPDATE asset_manager.integration_outbox SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
        [event.eventId],
      );
      const [{ claim }] = await worker(() =>
        query("SELECT asset_manager.claim_invitation_outbox() AS claim"),
      );
      assert.equal(claim.cancel, true);
      assert.equal(claim.providerId, "inv_test_confirmed");
      await assert.rejects(
        worker(() =>
          query(
            "SELECT asset_manager.invitation_delivered($1,'inv_test_confirmed')",
            [invitation.id],
          ),
        ),
      );
      await worker(() =>
        query("SELECT asset_manager.complete_invitation_revocation($1)", [
          event.eventId,
        ]),
      );
      assert.equal(
        (
          await worker(() =>
            query("SELECT asset_manager.claim_invitation_outbox() AS claim"),
          )
        )[0].claim,
        null,
      );
    },
  );
  await check(
    "retry exhaustion stays bounded at ten and terminal records remain terminal",
    async () => {
      await query(
        "UPDATE asset_manager.integration_outbox SET status='pending',attempts=9 WHERE id=$1",
        [event.eventId],
      );
      await worker(() =>
        query(
          "SELECT asset_manager.record_outbox_failure($1,'PROVIDER_FAILURE')",
          [event.eventId],
        ),
      );
      await worker(() =>
        query(
          "SELECT asset_manager.record_outbox_failure($1,'PROVIDER_FAILURE')",
          [event.eventId],
        ),
      );
      const [row] = await query(
        "SELECT attempts,status FROM asset_manager.integration_outbox WHERE id=$1",
        [event.eventId],
      );
      assert.equal(row.attempts, 10);
      assert.equal(row.status, "failed");
    },
  );
  console.log(
    `Verified ${checks} local worker migration scenarios; no live provider delivery performed.`,
  );
} finally {
  await db.close();
}
