// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  staff = "00000000-0000-4000-8000-000000000003",
  rate = "00000000-0000-4000-8000-000000000004";
let transfer: string;
async function act(user: string, sql: string) {
  await db.exec(`set role authenticated; select set_config('test.uid','${user}',false);`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;grant usage on schema public,auth,storage to authenticated,anon,service_role;grant execute on function auth.uid(),storage.foldername(text) to authenticated;grant select,insert on storage.objects to authenticated;`,
  );
  await db.exec(readFileSync("supabase/migrations/202610100001_transfer_workflow.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/202610100002_staff_dashboard.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/202610100003_recipient_details.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/202610100004_sunat_beta.sql", "utf8"));
  await db.exec(
    `insert into auth.users values('${owner}','owner@example.test',now()),('${other}','other@example.test',now()),('${staff}','staff@example.test',now());insert into staff_members(user_id) values('${staff}');insert into fx_rates(id,from_currency,to_currency,rate,commission_percent,valid_until) values('${rate}','PEN','BRL',1.475,5,now()+interval '1 day');insert into deposit_accounts(currency,bank,holder,account_number) values('PEN','Test bank','Brasper test','1234');`,
  );
  await db.exec("alter table auth.users add column is_anonymous boolean not null default false");
  await db.exec(readFileSync("supabase/migrations/202610100005_guest_exchange.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/202610100006_safe_transfer_review.sql", "utf8"));
}, 20000);
afterAll(async () => {
  await db.close();
});
describe("Database authorization and workflow", () => {
  it("calculates totals server-side and snapshots payment instructions", async () => {
    const result = await act(
      owner,
      `select create_transfer('${rate}',300,'Owner','123456','Recipient','654321','Bank','1111') as id`,
    );
    transfer = String((result.rows[0] as { id: string }).id);
    const row = await db.query(
      `select commission,recipient_amount,deposit_instructions from transfers where id='${transfer}'`,
    );
    expect(row.rows[0]).toMatchObject({ commission: "15.00", recipient_amount: "420.38" });
    expect((row.rows[0] as { deposit_instructions: unknown[] }).deposit_instructions).toHaveLength(
      1,
    );
  });
  it("isolates customers and prevents self-verification or raw updates", async () => {
    expect((await act(other, `select * from transfers`)).rows).toHaveLength(0);
    await expect(
      act(owner, `update transfers set status='verified' where id='${transfer}'`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      act(owner, `select review_transfer('${transfer}','verify','fake payment')`),
    ).rejects.toThrow(/autorizado/);
    await expect(
      act(staff, `select review_transfer('${transfer}','payout','sent','ref')`),
    ).rejects.toThrow(/estado/);
  });
  it("requires real uploaded evidence and restricts upload ownership", async () => {
    await expect(
      act(owner, `select submit_proof('${transfer}','${owner}/${transfer}/deposit/missing.pdf')`),
    ).rejects.toThrow(/Archivo/);
    await expect(
      act(
        other,
        `insert into storage.objects(bucket_id,name) values('transfer-proofs','${other}/${transfer}/deposit/foreign.pdf')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await act(
      owner,
      `insert into storage.objects(bucket_id,name) values('transfer-proofs','${owner}/${transfer}/deposit/receipt.pdf')`,
    );
    await act(
      owner,
      `select submit_proof('${transfer}','${owner}/${transfer}/deposit/receipt.pdf')`,
    );
  });
  it("queues exactly one invoice only after verified payout", async () => {
    await act(staff, `select review_transfer('${transfer}','verify','Bank statement checked')`);
    await expect(
      act(staff, `select review_transfer('${transfer}','payout','Sent','reference')`),
    ).rejects.toThrow(/constancia/);
    await act(
      staff,
      `insert into storage.objects(bucket_id,name) values('transfer-proofs','${staff}/${transfer}/payout/sent.pdf')`,
    );
    await act(
      staff,
      `select review_transfer('${transfer}','payout','Sent','reference','${staff}/${transfer}/payout/sent.pdf')`,
    );
    await expect(
      act(
        staff,
        `select review_transfer('${transfer}','payout','Repeated','reference','${staff}/${transfer}/payout/sent.pdf')`,
      ),
    ).rejects.toThrow(/estado/);
    expect((await db.query("select * from invoices")).rows).toHaveLength(1);
  });
  it("rejects expired rates and invalid amounts in the database", async () => {
    await expect(
      act(
        owner,
        `select create_transfer('${rate}',12.001,'Owner','123','Recipient','456','Bank','1111')`,
      ),
    ).rejects.toThrow(/Monto/);
    await db.exec(`update fx_rates set valid_until=now()-interval '1 second' where id='${rate}'`);
    await expect(
      act(
        owner,
        `select create_transfer('${rate}',300,'Owner','123','Recipient','456','Bank','1111')`,
      ),
    ).rejects.toThrow(/vencido/);
  });
  it("restricts worker claims and does not claim a fiscal job twice", async () => {
    await expect(act(owner, "select * from claim_invoice()")).rejects.toThrow(/permission denied/);
    const first = await db.query("select * from claim_invoice()");
    expect(first.rows).toHaveLength(1);
    expect((await db.query("select * from claim_invoice()")).rows).toHaveLength(0);
  });
  it("completes only a claimed delivery of an accepted invoice", async () => {
    const invoice = (await db.query("select id from invoices")).rows[0] as { id: string };
    await db.exec(`select complete_invoice_delivery('${invoice.id}')`);
    expect((await db.query("select status from transfers")).rows[0]).toMatchObject({
      status: "paid_out",
    });
    await db.exec("update invoices set status='accepted'");
    expect((await db.query("select * from claim_invoice_delivery()")).rows).toHaveLength(1);
    expect((await db.query("select * from claim_invoice_delivery()")).rows).toHaveLength(0);
    await db.exec(`select complete_invoice_delivery('${invoice.id}')`);
    expect((await db.query("select status from transfers")).rows[0]).toMatchObject({
      status: "completed",
    });
  });
  it("restricts dashboard aggregates to staff and separates currencies", async () => {
    await expect(act(owner, "select staff_dashboard_summary()")).rejects.toThrow(/autorizado/);
    const result = await act(staff, "select staff_dashboard_summary() as summary");
    expect(result.rows[0]).toMatchObject({
      summary: {
        statuses: { completed: 1 },
        invoices: { delivered: 1 },
        amounts: [{ currency: "PEN", amount: 300, operations: 1 }],
      },
    });
  });
  it("saves the full receiving account and links the private receipt for staff", async () => {
    await db.exec(`update fx_rates set valid_until=now()+interval '1 day' where id='${rate}'`);
    const result = await act(
      owner,
      `select create_transfer_details('${rate}',300,'Owner','123456','Recipient','456789','Test bank','key@example.test','pix','Account holder','987654','001','+51999999999','+5511999999999','Test instructions') as id`,
    );
    const id = String((result.rows[0] as { id: string }).id);
    const path = `${owner}/${id}/deposit/photo.jpg`;
    await act(
      owner,
      `insert into storage.objects(bucket_id,name) values('transfer-proofs','${path}')`,
    );
    await act(owner, `select submit_proof('${id}','${path}')`);
    expect(
      (
        await act(
          staff,
          `select recipient_account_type,recipient_account_holder,recipient_account_holder_document,recipient_account,recipient_bank_branch,customer_phone,recipient_phone,transfer_note,proof_path,status from transfers where id='${id}'`,
        )
      ).rows[0],
    ).toMatchObject({
      recipient_account_type: "pix",
      recipient_account_holder: "Account holder",
      recipient_account_holder_document: "987654",
      recipient_account: "key@example.test",
      recipient_bank_branch: "001",
      customer_phone: "+51999999999",
      recipient_phone: "+5511999999999",
      transfer_note: "Test instructions",
      proof_path: path,
      status: "proof_submitted",
    });
    expect((await act(other, `select * from transfers where id='${id}'`)).rows).toHaveLength(0);
    expect(
      (await act(staff, `select * from storage.objects where name='${path}'`)).rows,
    ).toHaveLength(1);
    expect(
      (await act(other, `select * from storage.objects where name='${path}'`)).rows,
    ).toHaveLength(0);
  });
  it("rolls back incompatible account types without leaving an extra operation", async () => {
    const before = (await db.query("select id from transfers")).rows.length;
    await expect(
      act(
        owner,
        `select create_transfer_details('${rate}',300,'Owner','123','Recipient','456','Bank','12345678901234567890','cci','Holder','789','','+51999999999','','')`,
      ),
    ).rejects.toThrow(/incompatible/);
    expect((await db.query("select id from transfers")).rows).toHaveLength(before);
    await expect(
      act(
        owner,
        `select create_transfer_details('${rate}',300,'Owner','123','Recipient','456','Bank','key','pix','Holder','789','','','','')`,
      ),
    ).rejects.toThrow(/teléfono/);
  });
  it("claims beta once, persists results and excludes beta from production delivery", async () => {
    const result = await act(
      owner,
      `select create_transfer('${rate}',300,'Owner','123','Recipient','456','Bank','1111') as id`,
    );
    const id = String((result.rows[0] as { id: string }).id);
    await db.exec(
      `update transfers set status='paid_out' where id='${id}'; insert into invoices(transfer_id) values('${id}')`,
    );
    await expect(act(owner, "select * from claim_beta_invoice()")).rejects.toThrow(
      /permission denied/,
    );
    const claimed = (await db.query("select * from claim_beta_invoice()")).rows[0] as {
      id: string;
      number: string;
      environment: string;
    };
    expect(claimed).toMatchObject({ number: "F902-1", environment: "beta" });
    expect((await db.query("select * from claim_beta_invoice()")).rows).toHaveLength(0);
    const prepared = JSON.stringify({ xml: "signed test", pdfBase64: "test" });
    expect(
      (await db.query(`select claim_beta_submission('${claimed.id}','${id}','${prepared}') as ok`))
        .rows[0],
    ).toMatchObject({ ok: true });
    expect(
      (await db.query(`select claim_beta_submission('${claimed.id}','${id}','${prepared}') as ok`))
        .rows[0],
    ).toMatchObject({ ok: false });
    await db.exec(
      `select record_beta_result('${claimed.id}','{"estado":"aceptado"}'); update invoices set status='accepted' where id='${claimed.id}'`,
    );
    expect((await db.query("select * from claim_invoice_delivery()")).rows).toHaveLength(0);
    await db.exec(`update invoices set status='queued' where id='${claimed.id}'`);
    expect((await db.query("select * from claim_invoice()")).rows).toHaveLength(0);
    expect((await db.query("select * from claim_beta_invoice()")).rows).toHaveLength(0);
    await db.exec(`select complete_invoice_delivery('${claimed.id}')`);
    expect((await db.query(`select status from transfers where id='${id}'`)).rows[0]).toMatchObject(
      { status: "paid_out" },
    );
  });
  it("allows private guest transactions without confirmed email and preserves owner isolation", async () => {
    const guest = "00000000-0000-4000-8000-000000000006";
    await db.exec(`insert into auth.users values('${guest}',null,null,true)`);
    const args = `'${rate}',300,'Guest','123456','Recipient','456789','Bank','pix-key','pix','Holder','987654','','+51999999999','','','guest@example.test'`;
    await expect(act(owner, `select create_guest_transfer_details(${args})`)).rejects.toThrow(
      /invitado/,
    );
    const response = await act(guest, `select create_guest_transfer_details(${args}) as id`);
    const id = String((response.rows[0] as { id: string }).id);
    expect(
      (
        await act(
          guest,
          `select customer_email,customer_email_verified,status from transfers where id='${id}'`,
        )
      ).rows[0],
    ).toMatchObject({
      customer_email: "guest@example.test",
      customer_email_verified: false,
      status: "awaiting_payment",
    });
    expect((await act(other, `select id from transfers where id='${id}'`)).rows).toHaveLength(0);
    await expect(
      act(
        guest,
        `select create_guest_transfer_base('${rate}',300,'Guest','123','Recipient','456','Bank','111','guest@example.test')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      act(guest, `update transfers set customer_email_verified=true where id='${id}'`),
    ).rejects.toThrow(/permission denied/);
    await expect(act(guest, "select verify_transfer_contact()")).rejects.toThrow(/Confirma/);
    const path = `${guest}/${id}/deposit/photo.jpg`;
    await act(
      guest,
      `insert into storage.objects(bucket_id,name) values('transfer-proofs','${path}')`,
    );
    await act(guest, `select submit_proof('${id}','${path}')`);
    expect(
      (await act(other, `select * from storage.objects where name='${path}'`)).rows,
    ).toHaveLength(0);
    await expect(act(guest, `select review_transfer('${id}','verify','fake')`)).rejects.toThrow(
      /autorizado/,
    );
    await act(staff, `select review_transfer('${id}','verify','Bank checked')`);
    const sent = `${staff}/${id}/payout/sent.pdf`;
    await act(
      staff,
      `insert into storage.objects(bucket_id,name) values('transfer-proofs','${sent}')`,
    );
    await act(staff, `select review_transfer('${id}','payout','Sent','ref','${sent}')`);
    await db.exec(
      `update invoices set status='accepted',environment='production' where transfer_id='${id}'`,
    );
    expect((await db.query("select * from claim_invoice_delivery()")).rows).toHaveLength(0);
    await db.exec(
      `update auth.users set email='verified@example.test',email_confirmed_at=now(),is_anonymous=false where id='${guest}'`,
    );
    await act(guest, "select verify_transfer_contact()");
    expect(
      (
        await act(
          guest,
          `select customer_email,customer_email_verified from transfers where id='${id}'`,
        )
      ).rows[0],
    ).toMatchObject({ customer_email: "verified@example.test", customer_email_verified: true });
    expect((await db.query("select * from claim_invoice_delivery()")).rows).toHaveLength(1);
  });
  it("limits repeated guest submissions and rejects calls without a private session", async () => {
    const guest = "00000000-0000-4000-8000-000000000007";
    await db.exec(`insert into auth.users values('${guest}',null,null,true)`);
    const args = `'${rate}',300,'Guest','123','Recipient','456','Bank','pix-key','pix','Holder','789','','+51999999999','','','guest@example.test'`;
    await db.exec("set role anon");
    try {
      await expect(db.query(`select create_guest_transfer_details(${args})`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
    for (let i = 0; i < 10; i++) await act(guest, `select create_guest_transfer_details(${args})`);
    await expect(act(guest, `select create_guest_transfer_details(${args})`)).rejects.toThrow(
      /Límite/,
    );
    expect((await act(guest, "select id from transfers")).rows).toHaveLength(10);
  });

  it("rejects legacy cancellation, stale cancellation and non-staff actions", async () => {
    const result = await act(
      owner,
      `select create_transfer('${rate}',300,'Owner','123','Recipient','456','Bank','1111') as id`,
    );
    const id = String((result.rows[0] as { id: string }).id);
    await expect(
      act(owner, `select cancel_transfer('${id}','awaiting_payment','Cancel requested')`),
    ).rejects.toThrow(/autorizado/);
    await expect(act(staff, `select review_transfer('${id}','cancel','tofo bin')`)).rejects.toThrow(
      /confirmación dedicada/,
    );
    expect((await db.query(`select status from transfers where id='${id}'`)).rows[0]).toMatchObject(
      { status: "awaiting_payment" },
    );
    const path = `${owner}/${id}/deposit/photo.jpg`;
    await act(
      owner,
      `insert into storage.objects(bucket_id,name) values('transfer-proofs','${path}')`,
    );
    await act(owner, `select submit_proof('${id}','${path}')`);
    await act(staff, `select review_transfer('${id}','verify','Bank statement checked')`);
    await expect(
      act(staff, `select cancel_transfer('${id}','proof_submitted','Stale screen')`),
    ).rejects.toThrow(/estado cambió/);
    await expect(act(staff, `select cancel_transfer('${id}',null,'Stale screen')`)).rejects.toThrow(
      /estado cambió/,
    );
    expect((await db.query(`select status from transfers where id='${id}'`)).rows[0]).toMatchObject(
      { status: "verified" },
    );
    await act(staff, `select cancel_transfer('${id}','verified','Explicit cancellation')`);
    await expect(act(staff, `select cancel_transfer('${id}','verified','Repeat')`)).rejects.toThrow(
      /estado cambió/,
    );
    await expect(
      act(owner, `select restore_verified_transfer('${id}','Accidental cancellation')`),
    ).rejects.toThrow(/autorizado/);
    await act(
      staff,
      `select restore_verified_transfer('${id}','Accidental cancellation correction')`,
    );
    expect((await db.query(`select status from transfers where id='${id}'`)).rows[0]).toMatchObject(
      { status: "verified" },
    );
    const events = await db.query(
      `select action from transfer_events where transfer_id='${id}' order by id desc limit 2`,
    );
    expect(events.rows).toEqual([{ action: "restore_verified" }, { action: "cancel" }]);
    expect((await db.query(`select id from invoices where transfer_id='${id}'`)).rows).toHaveLength(
      0,
    );
    await expect(act(staff, `select restore_verified_transfer('${id}','Repeat')`)).rejects.toThrow(
      /Solo se puede restaurar/,
    );
  });

  it("cannot restore unverified cancellations or operations with payout/billing", async () => {
    const result = await act(
      owner,
      `select create_transfer('${rate}',300,'Owner','123','Recipient','456','Bank','1111') as id`,
    );
    const id = String((result.rows[0] as { id: string }).id);
    await act(staff, `select cancel_transfer('${id}','awaiting_payment','Requested by client')`);
    await expect(
      act(staff, `select restore_verified_transfer('${id}','Correction')`),
    ).rejects.toThrow(/Solo se puede restaurar/);
    // Even a matching last pair of events cannot bypass existing payout/invoice checks.
    await db.exec(
      `update transfers set verified_at=now(),payout_at=now() where id='${id}'; insert into transfer_events(transfer_id,action) values('${id}','verify'),('${id}','cancel')`,
    );
    await expect(
      act(staff, `select restore_verified_transfer('${id}','Correction')`),
    ).rejects.toThrow(/Solo se puede restaurar/);
    await db.exec(
      `update transfers set payout_at=null where id='${id}'; insert into invoices(transfer_id) values('${id}')`,
    );
    await expect(
      act(staff, `select restore_verified_transfer('${id}','Correction')`),
    ).rejects.toThrow(/Solo se puede restaurar/);
    await db.exec("set role anon");
    try {
      await expect(
        db.query(`select cancel_transfer('${id}','cancelled','Attempt')`),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query(`select restore_verified_transfer('${id}','Attempt')`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  });
});
