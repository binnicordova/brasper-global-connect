// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  sid = "00000000-0000-4000-8000-000000000003";
async function act(role: string, uid: string, sql: string) {
  await db.exec(
    `set role ${role};select set_config('test.uid','${uid}',false);select set_config('test.role','${role}',false);`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;create function public.is_staff() returns boolean language sql as $$select false$$;create table public.transfers(id uuid primary key,user_id uuid not null);grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users values('${user}'),('${other}');`,
  );
  const args = ["uuid", "numeric", ...Array(26).fill("text"), "boolean"];
  await db.exec(
    `create function public.create_validated_transfer(${args.join(",")}) returns uuid language plpgsql as $$declare id uuid=gen_random_uuid();begin if $2<=0 or $29 is distinct from true then raise exception 'Invalid financial data';end if;insert into public.transfers values(id,auth.uid());return id;end$$;`,
  );
  await db.exec(readFileSync("supabase/migrations/202610130014_whatsapp_cloud.sql", "utf8"));
  await db.exec(
    "create table public.fx_rates(id uuid primary key,active boolean not null,valid_until timestamptz not null,rate numeric,commission_percent numeric);",
  );
  await db.exec(readFileSync("supabase/migrations/202610130015_whatsapp_native_flow.sql", "utf8"));
  await db.exec(
    `insert into public.whatsapp_channels(phone)values('51999999999');insert into public.whatsapp_sessions(id,phone)values('${sid}','51999999999');`,
  );
}, 20000);
afterAll(async () => db.close());
it("anonymous users cannot claim a channel session directly", async () => {
  await expect(
    act("authenticated", user, `select claim_whatsapp_session('${sid}','${user}')`),
  ).rejects.toThrow(/permission denied/);
});
it("only backend can claim; another user cannot take it over", async () => {
  await act("service_role", "", `select claim_whatsapp_session('${sid}','${user}')`);
  await expect(
    act("service_role", "", `select claim_whatsapp_session('${sid}','${other}')`),
  ).rejects.toThrow(/otro acceso/);
});
it("customer cannot read phone, sessions or raw webhook records", async () => {
  expect((await act("authenticated", user, "select * from whatsapp_sessions")).rows).toHaveLength(
    0,
  );
  expect((await act("authenticated", other, "select * from whatsapp_channels")).rows).toHaveLength(
    0,
  );
});
it("one linked session creates one transfer under the customer identity", async () => {
  const data = JSON.stringify({ p_rate_id: sid, p_amount: 300, p_declaration_accepted: true });
  const a = await act(
    "authenticated",
    user,
    `select create_whatsapp_transfer('${sid}','${data}'::jsonb) as id`,
  );
  const b = await act(
    "authenticated",
    user,
    `select create_whatsapp_transfer('${sid}','${data}'::jsonb) as id`,
  );
  expect(b.rows).toEqual(a.rows);
  expect((await db.query("select user_id from transfers")).rows).toEqual([{ user_id: user }]);
});
it("does not let another customer create or attach that transfer", async () => {
  await expect(
    act("authenticated", other, `select create_whatsapp_transfer('${sid}','{}'::jsonb)`),
  ).rejects.toThrow(/no válido/);
});
it("rate limiter applies on backend and honors human pause", async () => {
  await expect(
    act("authenticated", user, "select reserve_whatsapp_ai('51999999999')"),
  ).rejects.toThrow(/permission denied/);
  for (let i = 0; i < 30; i++)
    expect(
      (await act("service_role", "", "select reserve_whatsapp_ai('51999999999') as ok")).rows,
    ).toEqual([{ ok: true }]);
  expect(
    (await act("service_role", "", "select reserve_whatsapp_ai('51999999999') as ok")).rows,
  ).toEqual([{ ok: false }]);
});

it("native flow state cannot expose guest credentials or be leased by a customer", async () => {
  const nativeId = "00000000-0000-4000-8000-000000000020";
  await db.exec(
    `insert into whatsapp_sessions(id,phone,entry_mode)values('${nativeId}','51999999999','native')`,
  );
  await expect(
    act("authenticated", user, `select claim_whatsapp_flow('${nativeId}')`),
  ).rejects.toThrow(/permission denied/);
  await expect(
    act("authenticated", user, "select auth_cipher from whatsapp_flow_states"),
  ).rejects.toThrow(/permission denied/);
  expect(
    (await act("service_role", "", `select (claim_whatsapp_flow('${nativeId}')).session_id as id`))
      .rows,
  ).toEqual([{ id: nativeId }]);
  await expect(
    act("service_role", "", `select claim_whatsapp_flow('${nativeId}')`),
  ).rejects.toThrow(/curso/);
  await expect(act("service_role", "", `select claim_whatsapp_flow('${sid}')`)).rejects.toThrow(
    /no válido/,
  );
});
it("native creation rejects a changed quote and uses the same identity and duplicate guard", async () => {
  const nativeId = "00000000-0000-4000-8000-000000000020",
    rateId = "00000000-0000-4000-8000-000000000021";
  await db.exec(`insert into fx_rates values('${rateId}',true,now()+interval '1 hour',1.5,3)`);
  await act("service_role", "", `select claim_whatsapp_session('${nativeId}','${user}')`);
  const data = JSON.stringify({ p_rate_id: rateId, p_amount: 300, p_declaration_accepted: true });
  await expect(
    act(
      "authenticated",
      user,
      `select create_whatsapp_native_transfer('${nativeId}','${data}'::jsonb,1.4,3)`,
    ),
  ).rejects.toThrow(/cotización cambió/);
  await expect(
    act(
      "authenticated",
      other,
      `select create_whatsapp_native_transfer('${nativeId}','${data}'::jsonb,1.5,3)`,
    ),
  ).rejects.toThrow(/no válido/);
  const a = await act(
    "authenticated",
    user,
    `select create_whatsapp_native_transfer('${nativeId}','${data}'::jsonb,1.5,3) as id`,
  );
  await db.exec(`update fx_rates set rate=2 where id='${rateId}'`);
  expect(
    (
      await act(
        "authenticated",
        user,
        `select create_whatsapp_native_transfer('${nativeId}','${data}'::jsonb,1.5,3) as id`,
      )
    ).rows,
  ).toEqual(a.rows);
  expect(
    (await db.query(`select user_id from transfers where id='${(a.rows[0] as { id: string }).id}'`))
      .rows,
  ).toEqual([{ user_id: user }]);
});
