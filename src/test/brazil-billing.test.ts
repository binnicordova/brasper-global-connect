// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  rateBR = "00000000-0000-4000-8000-000000000003",
  ratePE = "00000000-0000-4000-8000-000000000004";
let historical: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;grant usage on schema public,auth,storage to authenticated,anon,service_role;grant execute on function auth.uid(),storage.foldername(text) to authenticated;grant select,insert on storage.objects to authenticated;`,
  );

  await db.exec("alter table auth.users add column is_anonymous boolean not null default false");
  const migrations = readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const n of migrations.filter(
    (n) => !n.includes("0011") && !n.includes("0012") && !n.includes("0013"),
  ))
    await db.exec(readFileSync("supabase/migrations/" + n, "utf8"));
  await db.exec(`insert into auth.users values('${owner}','client@example.test',now(),false);
 insert into fx_rates(id,from_currency,to_currency,rate,commission_percent,valid_until) values('${rateBR}','PEN','BRL',1.425,5,now()+interval '1 day'),('${ratePE}','BRL','PEN',0.69,3,now()+interval '1 day');
 insert into deposit_accounts(currency,bank,holder,account_number) values('PEN','Banco Demo','Brasper','123'),('BRL','Banco Demo','Brasper','456');
 select set_config('test.uid','${owner}',false);`);
  const old = (
    await db.query(
      `select create_transfer_with_billing('${rateBR}',300,'Client','12345678','Dest','87654321','Bank','1234','bank_account','Dest','87654321','','+51999999999','','','factura','client@example.test','Company','20100070970','6') as id`,
    )
  ).rows[0] as { id: string };
  historical = old.id;
  await db.exec(
    `update transfers set status='paid_out' where id='${historical}';insert into invoices(transfer_id,environment,status,beta_sent_at,external_id) values('${historical}','beta','beta_accepted',now(),'historical');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610120011_brazil_billing_worklists.sql", "utf8"),
  );
  await db.exec(readFileSync("supabase/migrations/202610120012_mailersend_delivery.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/202610120013_saved_recipients.sql", "utf8"));
}, 20000);
afterAll(async () => {
  await db.close();
});
function args(
  type: string,
  destination: "PE" | "BR",
  docType = type === "nfse" ? "foreign" : type === "factura" ? "6" : "1",
  doc = type === "factura" ? "20100070970" : "12345678",
) {
  return `'${destination === "BR" ? rateBR : ratePE}',300,'Client','12345678','Dest','87654321','Bank','1234','bank_account','Dest','87654321','','+51999999999','','','${type}','client@example.test','${type === "factura" ? "Company" : "Client"}','${doc}','${docType}','1','${destination === "BR" ? "PE" : "BR"}','${destination}','Bank origin','salary','','Cambio para la familia','Familia',true`;
}
async function create(type: string, destination: "PE" | "BR", docType?: string, doc?: string) {
  const result = await db.query(
    `select create_validated_transfer(${args(type, destination, docType, doc)}) as id`,
  );
  return (result.rows[0] as { id: string }).id;
}
it("preserves the original issuer of an already emitted Peru invoice", async () => {
  expect(
    (await db.query(`select billing_country,billing_type from transfers where id='${historical}'`))
      .rows[0],
  ).toEqual({ billing_country: "PE", billing_type: "factura" });
  expect(
    (
      await db.query(
        `select issuer_country,document_type from invoices where transfer_id='${historical}'`,
      )
    ).rows[0],
  ).toEqual({ issuer_country: "PE", document_type: "01" });
});
it("routes by BENEFICIARY currency and rejects mismatched document types atomically", async () => {
  const count = (await db.query("select count(*)::int n from transfers")).rows[0];
  await expect(create("boleta", "BR")).rejects.toThrow(/brasileña/);
  await expect(create("factura", "BR")).rejects.toThrow(/brasileña/);
  await expect(create("nfse", "PE")).rejects.toThrow(/peruana/);
  expect((await db.query("select count(*)::int n from transfers")).rows[0]).toEqual(count);
  const id = await create("nfse", "BR");
  expect(
    (await db.query(`select billing_country,billing_type from transfers where id='${id}'`)).rows[0],
  ).toEqual({ billing_country: "BR", billing_type: "nfse" });
  await db.exec(
    `update transfers set status='paid_out' where id='${id}';insert into invoices(transfer_id) values('${id}')`,
  );
  expect(
    (await db.query(`select issuer_country,document_type from invoices where transfer_id='${id}'`))
      .rows[0],
  ).toEqual({ issuer_country: "BR", document_type: "NFSE" });
  expect((await db.query("select * from claim_beta_invoice()")).rows).toHaveLength(0);
  expect((await db.query("select * from claim_invoice()")).rows).toHaveLength(0);
  expect((await db.query("select * from claim_demo_invoice(true)")).rows[0]).toMatchObject({
    transfer_id: id,
    issuer_country: "BR",
    document_type: "NFSE",
    environment: "demo",
  });
});
it("validates CPF/CNPJ and supports both Peru document choices", async () => {
  await expect(create("nfse", "BR", "cpf", "123")).rejects.toThrow(/CPF/);
  await expect(create("nfse", "BR", "cnpj", "12345678901")).rejects.toThrow(/CNPJ/);
  await expect(create("boleta", "PE", "foreign")).rejects.toThrow(/documento.*boleta/);
  await create("nfse", "BR", "cpf", "12345678901");
  await create("nfse", "BR", "cnpj", "12345678901234");
  for (const type of ["boleta", "factura"]) {
    const id = await create(type, "PE");
    expect(
      (await db.query(`select billing_country,billing_type from transfers where id='${id}'`))
        .rows[0],
    ).toEqual({ billing_country: "PE", billing_type: type });
  }
});
it("blocks a real Brazil request for configuration without claiming it in SUNAT", async () => {
  const id = await create("nfse", "BR");
  await db.exec(
    `update transfers set status='paid_out' where id='${id}';insert into invoices(transfer_id) values('${id}')`,
  );
  expect((await db.query("select * from claim_brazil_invoice()")).rows[0]).toMatchObject({
    transfer_id: id,
    issuer_country: "BR",
    status: "blocked",
  });
  expect((await db.query("select * from claim_beta_invoice()")).rows).toHaveLength(0);
});
it("leases MailerSend jobs once, persists provider identity and preserves fiscal test status", async () => {
  const id = await create("nfse", "BR");
  await db.exec(
    `update invoices set email_status='blocked';update transfers set status='paid_out' where id='${id}';insert into invoices(transfer_id,status,environment,pdf_path) values('${id}','demo_generated','demo','private.pdf');`,
  );
  const jobs = (await db.query("select * from claim_mailersend_delivery('beta')")).rows as {
    id: string;
    email_attempts: number;
  }[];
  expect(jobs).toHaveLength(1);
  const job = jobs[0]!;
  expect(job.email_attempts).toBe(1);
  expect((await db.query("select * from claim_mailersend_delivery('beta')")).rows).toHaveLength(0);
  expect(
    (await db.query(`select start_mailersend_request('${job.id}',1,'client@brasper.test') as ok`))
      .rows[0],
  ).toEqual({ ok: true });
  expect(
    (await db.query(`select start_mailersend_request('${job.id}',1,'client@brasper.test') as ok`))
      .rows[0],
  ).toEqual({ ok: false });
  await db.query(`select record_mailersend_result('${job.id}',1,'submitted','msg123',null,60)`);
  expect((await db.query("select * from claim_mailersend_delivery('beta')")).rows).toHaveLength(0);
  await db.query(`select confirm_mailersend_status('${job.id}','msg123','sent',null)`);
  expect(
    (await db.query(`select status,email_status from invoices where id='${job.id}'`)).rows[0],
  ).toEqual({ status: "demo_generated", email_status: "sent" });
  expect((await db.query(`select status from transfers where id='${id}'`)).rows[0]).toEqual({
    status: "completed",
  });
  await db.exec("set role authenticated");
  await expect(db.query("select * from claim_mailersend_delivery('beta')")).rejects.toThrow(
    /permission/,
  );
  await db.exec("reset role");
});
it("retries confirmed failures with backoff, but reconciles stale requests already sent to the provider", async () => {
  const id = await create("boleta", "PE");
  await db.exec(
    `update transfers set status='paid_out' where id='${id}';insert into invoices(transfer_id,status,environment,pdf_path) values('${id}','demo_generated','demo','private.pdf')`,
  );
  let job = (await db.query("select * from claim_mailersend_delivery('demo')")).rows[0] as {
    id: string;
  };
  await db.query(`select record_mailersend_result('${job.id}',1,'retry',null,'HTTP 429',60)`);
  expect((await db.query("select * from claim_mailersend_delivery('demo')")).rows).toHaveLength(0);
  await db.query(
    `update invoices set email_next_attempt_at=now()-interval '1 minute' where id='${job.id}'`,
  );
  job = (await db.query("select * from claim_mailersend_delivery('demo')")).rows[0] as {
    id: string;
  };
  await db.query(`select start_mailersend_request('${job.id}',2,'client@brasper.test')`);
  await db.query(
    `update invoices set email_processing_at=now()-interval '6 minutes' where id='${job.id}'`,
  );
  expect((await db.query("select * from claim_mailersend_delivery('demo')")).rows).toHaveLength(0);
  expect(
    (await db.query(`select email_status,email_attempts from invoices where id='${job.id}'`))
      .rows[0],
  ).toEqual({ email_status: "reconciliation_required", email_attempts: 2 });
});

it("keeps saved recipients private, rejects guests and deduplicates only the owner's account", async () => {
  const id = await create("nfse", "BR");
  const other = "00000000-0000-4000-8000-000000000099";
  await db.exec(
    `insert into auth.users values('${other}','other@example.test',now(),false);set role authenticated;`,
  );
  const saved = (await db.query(`select save_transfer_recipient('${id}','Familia Brasil') id`))
    .rows[0] as { id: string };
  expect(
    (await db.query("select currency,country,recipient_name from saved_recipients")).rows,
  ).toEqual([{ currency: "BRL", country: "BR", recipient_name: "Dest" }]);
  expect((await db.query(`select save_transfer_recipient('${id}','Familia') id`)).rows[0]).toEqual(
    saved,
  );
  await db.exec(`select set_config('test.uid','${other}',false)`);
  expect((await db.query("select * from saved_recipients")).rows).toHaveLength(0);
  await expect(db.query(`select save_transfer_recipient('${id}','Ajena')`)).rejects.toThrow(
    /disponible/,
  );
  expect((await db.query(`select delete_saved_recipient('${saved.id}') ok`)).rows[0]).toEqual({
    ok: false,
  });
  await db.exec(
    `reset role;update auth.users set is_anonymous=true where id='${other}';set role authenticated;`,
  );
  await expect(db.query(`select save_transfer_recipient('${id}','Invitado')`)).rejects.toThrow(
    /registrada/,
  );
  await db.exec(`select set_config('test.uid','${owner}',false)`);
  await expect(db.query(`select save_transfer_recipient('${id}','X')`)).rejects.toThrow(/nombre/);
  expect((await db.query(`select delete_saved_recipient('${saved.id}') ok`)).rows[0]).toEqual({
    ok: true,
  });
  expect((await db.query("select * from saved_recipients")).rows).toHaveLength(0);
  expect((await db.query(`select id from transfers where id='${id}'`)).rows).toHaveLength(1);
  await db.exec("reset role");
});
