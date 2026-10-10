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
  await db.exec(
    `insert into auth.users values('${owner}','owner@example.test',now()),('${other}','other@example.test',now()),('${staff}','staff@example.test',now());insert into staff_members(user_id) values('${staff}');insert into fx_rates(id,from_currency,to_currency,rate,commission_percent,valid_until) values('${rate}','PEN','BRL',1.475,5,now()+interval '1 day');insert into deposit_accounts(currency,bank,holder,account_number) values('PEN','Test bank','Brasper test','1234');`,
  );
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
});
