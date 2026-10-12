-- REVISAR ANTES DE EJECUTAR: solo migraciones posteriores a none.
-- No repetir sobre un proyecto donde ya se aplicaron. Este archivo no configura secretos.
begin;

-- Fuente: supabase/migrations/202610100001_transfer_workflow.sql
-- No demo bank accounts, official rates or staff accounts are installed.
create table public.staff_members (user_id uuid primary key references auth.users(id), created_at timestamptz not null default now());
create function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from staff_members where user_id = auth.uid()); $$;
create table public.fx_rates (
 id uuid primary key default gen_random_uuid(), from_currency text not null check(from_currency in ('PEN','BRL','USD')), to_currency text not null check(to_currency in ('PEN','BRL','USD')),
 rate numeric(18,8) not null check(rate > 0), commission_percent numeric(6,3) not null check(commission_percent between 0 and 100),
 min_amount numeric(18,2) not null default 10 check(min_amount > 0), max_amount numeric(18,2) not null default 10000 check(max_amount >= min_amount),
 valid_until timestamptz not null, active boolean not null default true, check(from_currency <> to_currency)
);
create table public.deposit_accounts (
 id uuid primary key default gen_random_uuid(), currency text not null check(currency in ('PEN','BRL','USD')), bank text not null, holder text not null, account_number text not null, instructions text not null default '', active boolean not null default true
);
create table public.transfers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), rate_id uuid not null references fx_rates(id),
 from_currency text not null, to_currency text not null, amount numeric(18,2) not null, rate numeric(18,8) not null, commission numeric(18,2) not null, recipient_amount numeric(18,2) not null,
 customer_name text not null, customer_document text not null, customer_email text not null, recipient_name text not null, recipient_document text not null, recipient_bank text not null, recipient_account text not null,
 status text not null default 'awaiting_payment' check(status in ('awaiting_payment','proof_submitted','verified','paid_out','completed','cancelled')),
 deposit_instructions jsonb not null, proof_path text, payout_path text, payout_reference text, payout_at timestamptz, verified_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.transfer_events (id bigint generated always as identity primary key, transfer_id uuid not null references transfers(id), actor uuid references auth.users(id), action text not null, note text not null default '', created_at timestamptz not null default now());
create table public.invoices (
 id uuid primary key default gen_random_uuid(), transfer_id uuid not null unique references transfers(id),
 status text not null default 'queued' check(status in ('queued','processing','accepted','sending','delivered','blocked','reconciliation_required')),
 external_id text, number text, pdf_path text, xml_path text, cdr_path text, error text, created_at timestamptz not null default now(), delivered_at timestamptz, email_attempted_at timestamptz
);
create index on transfers(user_id, created_at desc);
create index on transfer_events(transfer_id);
create index on invoices(status);

alter table staff_members enable row level security;
alter table fx_rates enable row level security;
alter table deposit_accounts enable row level security;
alter table transfers enable row level security;
alter table transfer_events enable row level security;
alter table invoices enable row level security;
create policy staff_self on staff_members for select to authenticated using (user_id = auth.uid());
create policy rates_read on fx_rates for select to authenticated using (active and valid_until > now() or public.is_staff());
create policy accounts_read on deposit_accounts for select to authenticated using (active or public.is_staff());
create policy rates_staff on fx_rates for all to authenticated using (public.is_staff()) with check(public.is_staff());
create policy accounts_staff on deposit_accounts for all to authenticated using (public.is_staff()) with check(public.is_staff());
create policy transfers_read on transfers for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy events_read on transfer_events for select to authenticated using (exists(select 1 from transfers t where t.id=transfer_id and (t.user_id=auth.uid() or public.is_staff())));
create policy invoices_read on invoices for select to authenticated using (exists(select 1 from transfers t where t.id=transfer_id and (t.user_id=auth.uid() or public.is_staff())));
-- All mutations of transfers, events and invoices go through controlled functions.
revoke all on staff_members, transfers, transfer_events, invoices from anon, authenticated;
grant select on staff_members, transfers, transfer_events, invoices to authenticated;
revoke all on fx_rates, deposit_accounts from anon, authenticated;
grant select, insert, update, delete on fx_rates, deposit_accounts to authenticated;
grant all on staff_members, fx_rates, deposit_accounts, transfers, transfer_events, invoices to service_role;
grant usage, select on sequence transfer_events_id_seq to service_role;

create function public.create_transfer(p_rate_id uuid, p_amount numeric, p_customer_name text, p_customer_document text, p_recipient_name text, p_recipient_document text, p_recipient_bank text, p_recipient_account text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r fx_rates; tid uuid; fee numeric; email text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 select * into r from fx_rates where id=p_rate_id and active and valid_until>now() for share;
 if not found then raise exception 'La cotización ha vencido'; end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) or p_amount<r.min_amount or p_amount>r.max_amount then raise exception 'Monto fuera del rango permitido'; end if;
 if not exists(select 1 from deposit_accounts where active and currency=r.from_currency) then raise exception 'No hay una cuenta de ingreso habilitada'; end if;
 if exists(select 1 from unnest(array[p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account]) v where v is null or length(trim(v))<2 or length(v)>200) then raise exception 'Completa correctamente los datos'; end if;
 select u.email into email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if email is null then raise exception 'Confirma tu correo antes de operar'; end if;
 fee=round(p_amount*r.commission_percent/100,2);
 if round((p_amount-fee)*r.rate,2)<=0 then raise exception 'El monto neto debe ser mayor a cero'; end if;
 insert into transfers(user_id,rate_id,from_currency,to_currency,amount,rate,commission,recipient_amount,customer_name,customer_document,customer_email,recipient_name,recipient_document,recipient_bank,recipient_account,deposit_instructions)
 values(auth.uid(),r.id,r.from_currency,r.to_currency,p_amount,r.rate,fee,round((p_amount-fee)*r.rate,2),trim(p_customer_name),trim(p_customer_document),email,trim(p_recipient_name),trim(p_recipient_document),trim(p_recipient_bank),trim(p_recipient_account),(select jsonb_agg(jsonb_build_object('bank',bank,'holder',holder,'account_number',account_number,'instructions',instructions)) from deposit_accounts where active and currency=r.from_currency)) returning id into tid;
 insert into transfer_events(transfer_id,actor,action) values(tid,auth.uid(),'Solicitud registrada');
 return tid;
end $$;

create function public.submit_proof(p_transfer_id uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
declare t transfers;
begin
 select * into t from transfers where id=p_transfer_id for update;
 if not found or t.user_id<>auth.uid() or auth.uid() is null then raise exception 'Operación no autorizada'; end if;
 if t.status not in ('awaiting_payment','proof_submitted') then raise exception 'La operación ya fue revisada'; end if;
 if p_path is null or p_path not like auth.uid()::text || '/' || t.id::text || '/deposit/%' or not exists(select 1 from storage.objects where bucket_id='transfer-proofs' and name=p_path) then raise exception 'Archivo no válido'; end if;
 update transfers set proof_path=p_path,status='proof_submitted',updated_at=now() where id=t.id;
 insert into transfer_events(transfer_id,actor,action) values(t.id,auth.uid(),'Prueba de pago recibida');
end $$;

create function public.review_transfer(p_transfer_id uuid, p_action text, p_note text, p_reference text default null, p_payout_path text default null) returns void language plpgsql security definer set search_path = public as $$
declare t transfers;
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede revisar'; end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>1000 then raise exception 'Registra una observación de revisión'; end if;
 select * into t from transfers where id=p_transfer_id for update;
 if not found then raise exception 'Operación no encontrada'; end if;
 if p_action='verify' and t.status='proof_submitted' then
  update transfers set status='verified',verified_at=now(),updated_at=now() where id=t.id;
 elsif p_action='request_proof' and t.status='proof_submitted' then
  update transfers set status='awaiting_payment',updated_at=now() where id=t.id;
 elsif p_action='cancel' and t.status in ('awaiting_payment','proof_submitted','verified') then
  update transfers set status='cancelled',updated_at=now() where id=t.id;
 elsif p_action='payout' and t.status='verified' then
  if p_reference is null or length(trim(p_reference))<3 or length(p_reference)>200 then raise exception 'Falta referencia del envío'; end if;
  if p_payout_path is null or p_payout_path not like auth.uid()::text || '/' || t.id::text || '/payout/%' or not exists(select 1 from storage.objects where bucket_id='transfer-proofs' and name=p_payout_path) then raise exception 'Adjunta la constancia del envío'; end if;
  update transfers set status='paid_out',payout_path=p_payout_path,payout_reference=trim(p_reference),payout_at=now(),updated_at=now() where id=t.id;
  insert into invoices(transfer_id) values(t.id);
 else raise exception 'Cambio de estado no permitido'; end if;
 insert into transfer_events(transfer_id,actor,action,note) values(t.id,auth.uid(),p_action,trim(p_note));
end $$;
revoke execute on function public.create_transfer(uuid,numeric,text,text,text,text,text,text), public.submit_proof(uuid,text), public.review_transfer(uuid,text,text,text,text) from public, anon;
grant execute on function public.create_transfer(uuid,numeric,text,text,text,text,text,text), public.submit_proof(uuid,text), public.review_transfer(uuid,text,text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('transfer-proofs','transfer-proofs',false,5242880,array['image/jpeg','image/png','application/pdf']),('invoice-documents','invoice-documents',false,5242880,array['application/pdf','application/xml','text/xml']) on conflict(id) do nothing;
create policy proof_upload on storage.objects for insert to authenticated with check (
 bucket_id='transfer-proofs' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from transfers t where t.id::text=(storage.foldername(name))[2]
 and (((storage.foldername(name))[3]='deposit' and t.user_id=auth.uid() and t.status in ('awaiting_payment','proof_submitted')) or ((storage.foldername(name))[3]='payout' and public.is_staff() and t.status='verified')))
);
create policy proof_read on storage.objects for select to authenticated using(bucket_id='transfer-proofs' and exists(select 1 from transfers t where t.proof_path=name or t.payout_path=name) and exists(select 1 from transfers t where (t.proof_path=name or t.payout_path=name) and (t.user_id=auth.uid() or public.is_staff())));
create policy invoice_read on storage.objects for select to authenticated using(bucket_id='invoice-documents' and exists(select 1 from invoices i join transfers t on t.id=i.transfer_id where (i.pdf_path=name or i.xml_path=name or i.cdr_path=name) and (t.user_id=auth.uid() or public.is_staff())));

-- Worker claims a job atomically. A crashed fiscal request is NOT retried blindly.
create function public.claim_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='processing' where id=(select id from invoices where status='queued' order by created_at for update skip locked limit 1) returning *;
$$;
revoke execute on function public.claim_invoice() from public, anon, authenticated;
grant execute on function public.claim_invoice() to service_role;
create function public.complete_invoice_delivery(p_invoice_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 update invoices set status='delivered',delivered_at=now(),error=null where id=p_invoice_id and status='sending' returning transfer_id into tid;
 if tid is not null then
  update transfers set status='completed',updated_at=now() where id=tid and status='paid_out';
  insert into transfer_events(transfer_id,action) values(tid,'Comprobante enviado al correo');
 end if;
end $$;
revoke execute on function public.complete_invoice_delivery(uuid) from public, anon, authenticated;
grant execute on function public.complete_invoice_delivery(uuid) to service_role;

create function public.claim_invoice_delivery() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='sending',email_attempted_at=coalesce(email_attempted_at,now()) where id=(select id from invoices where status='accepted' order by created_at for update skip locked limit 1) returning *;
$$;
revoke execute on function public.claim_invoice_delivery() from public, anon, authenticated;
grant execute on function public.claim_invoice_delivery() to service_role;


-- Fuente: supabase/migrations/202610100002_staff_dashboard.sql
-- Aggregate the entire operation history, not just the visible page of rows.
create function public.staff_dashboard_summary() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede consultar el dashboard'; end if;
 return jsonb_build_object(
  'statuses', coalesce((select jsonb_object_agg(status, count) from
    (select status, count(*) as count from public.transfers group by status) s), '{}'::jsonb),
  'invoices', coalesce((select jsonb_object_agg(status, count) from
    (select status, count(*) as count from public.invoices group by status) s), '{}'::jsonb),
  'amounts', coalesce((select jsonb_agg(s) from
    (select from_currency as currency, sum(amount) as amount, count(*) as operations
     from public.transfers where status <> 'cancelled' group by from_currency order by from_currency) s), '[]'::jsonb)
 );
end $$;
revoke execute on function public.staff_dashboard_summary() from public, anon;
grant execute on function public.staff_dashboard_summary() to authenticated;


-- Fuente: supabase/migrations/202610100003_recipient_details.sql
-- Preserve existing operations; richer recipient details are submitted via one RPC.
alter table public.transfers
 add column recipient_account_type text not null default 'bank_account' check(recipient_account_type in ('bank_account','cci','pix')),
 add column recipient_account_holder text not null default '',
 add column recipient_account_holder_document text not null default '',
 add column recipient_bank_branch text not null default '',
 add column customer_phone text not null default '',
 add column recipient_phone text not null default '',
 add column transfer_note text not null default '';
update public.transfers set recipient_account_holder=recipient_name,recipient_account_holder_document=recipient_document;

create function public.create_transfer_details(
 p_rate_id uuid, p_amount numeric, p_customer_name text, p_customer_document text,
 p_recipient_name text, p_recipient_document text, p_recipient_bank text, p_recipient_account text,
 p_recipient_account_type text, p_recipient_account_holder text, p_recipient_account_holder_document text, p_recipient_bank_branch text,
 p_customer_phone text, p_recipient_phone text, p_transfer_note text
) returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 if p_recipient_account_type is null or p_recipient_account_type not in ('bank_account','cci','pix') then raise exception 'Tipo de cuenta no válido'; end if;
 if p_recipient_account_holder is null or length(trim(p_recipient_account_holder))<2 or length(p_recipient_account_holder)>200 then raise exception 'Completa el titular de la cuenta'; end if;
 if p_recipient_account_holder_document is null or length(trim(p_recipient_account_holder_document))<2 or length(p_recipient_account_holder_document)>200 then raise exception 'Completa el documento del titular'; end if;
 if p_customer_phone is null or length(trim(p_customer_phone))<6 then raise exception 'Completa tu teléfono de contacto'; end if;
 if length(coalesce(p_recipient_bank_branch,''))>50 or length(coalesce(p_customer_phone,''))>40 or length(coalesce(p_recipient_phone,''))>40 or length(coalesce(p_transfer_note,''))>500 then raise exception 'Datos adicionales demasiado largos'; end if;
 if p_recipient_account_type='cci' and (p_recipient_account is null or p_recipient_account !~ '^[0-9]{20}$') then raise exception 'El CCI debe tener 20 dígitos'; end if;
 tid=public.create_transfer(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account);
 if (p_recipient_account_type='cci' and (select to_currency from transfers where id=tid)<>'PEN') or (p_recipient_account_type='pix' and (select to_currency from transfers where id=tid)<>'BRL') then raise exception 'Tipo de cuenta incompatible con la moneda de destino'; end if;
 update transfers set recipient_account_type=p_recipient_account_type,recipient_account_holder=trim(p_recipient_account_holder),recipient_account_holder_document=trim(p_recipient_account_holder_document),recipient_bank_branch=trim(coalesce(p_recipient_bank_branch,'')),customer_phone=trim(coalesce(p_customer_phone,'')),recipient_phone=trim(coalesce(p_recipient_phone,'')),transfer_note=trim(coalesce(p_transfer_note,'')) where id=tid;
 return tid;
end $$;
revoke execute on function public.create_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- Enable dashboard updates when Supabase Realtime is available; preserve RLS.
do $$
declare tbl text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach tbl in array array['transfers','invoices'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl) then
    execute format('alter publication supabase_realtime add table public.%I',tbl);
   end if;
  end loop;
 end if;
end $$;


-- Fuente: supabase/migrations/202610100004_sunat_beta.sql
alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in ('queued','processing','accepted','sending','delivered','blocked','reconciliation_required','beta_accepted','beta_rejected','beta_reconciliation_required'));
alter table public.invoices
 add column environment text not null default 'unconfigured' check(environment in ('unconfigured','beta','production')),
 add column beta_sent_at timestamptz,
 add column beta_prepared jsonb,
 add column beta_result jsonb;
create sequence public.brasper_beta_invoice_number maxvalue 99999999 no cycle;
-- A beta job never consumes a production series or completes a real transfer.
create function public.claim_beta_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='processing',environment='beta',number=coalesce(number,'F902-' || nextval('public.brasper_beta_invoice_number'))
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id where i.status='queued' and i.environment in ('unconfigured','beta') and i.beta_sent_at is null and t.status='paid_out' order by i.created_at for update of i skip locked limit 1) returning *;
$$;
create or replace function public.claim_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='processing',environment='production' where id=(select id from invoices where status='queued' and environment<>'beta' order by created_at for update skip locked limit 1) returning *;
$$;
create function public.claim_beta_submission(p_invoice_id uuid,p_transfer_id uuid,p_prepared jsonb) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if p_prepared is null or jsonb_typeof(p_prepared)<>'object' or coalesce(length(p_prepared->>'xml'),0)<1 or coalesce(length(p_prepared->>'pdfBase64'),0)<1 then raise exception 'Documentos beta no preparados'; end if;
 update invoices set beta_sent_at=now(),beta_prepared=p_prepared
 where id=p_invoice_id and transfer_id=p_transfer_id and environment='beta' and status='processing' and beta_sent_at is null
 and exists(select 1 from transfers t where t.id=p_transfer_id and t.status='paid_out');
 return found;
end $$;
create function public.record_beta_result(p_invoice_id uuid,p_result jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 update invoices set beta_result=p_result where id=p_invoice_id and environment='beta' and beta_sent_at is not null;
 if not found then raise exception 'No existe envío beta reservado'; end if;
end $$;
revoke execute on function public.claim_beta_invoice(), public.claim_beta_submission(uuid,uuid,jsonb),public.record_beta_result(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_beta_invoice(), public.claim_beta_submission(uuid,uuid,jsonb),public.record_beta_result(uuid,jsonb) to service_role;
-- Explicitly exclude beta from any customer email or completion path.
create or replace function public.claim_invoice_delivery() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='sending',email_attempted_at=coalesce(email_attempted_at,now()) where id=(select id from invoices where status='accepted' and environment='production' order by created_at for update skip locked limit 1) returning *;
$$;
create or replace function public.complete_invoice_delivery(p_invoice_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 update invoices set status='delivered',delivered_at=now(),error=null where id=p_invoice_id and status='sending' and environment='production' returning transfer_id into tid;
 if tid is not null then
  update transfers set status='completed',updated_at=now() where id=tid and status='paid_out';
  insert into transfer_events(transfer_id,action) values(tid,'Comprobante enviado al correo');
 end if;
end $$;


-- Fuente: supabase/migrations/202610100005_guest_exchange.sql
-- Guest sessions retain existing owner-based RLS; no public transfer or file access.
alter table public.transfers add column customer_email_verified boolean not null default true;

create function public.create_guest_transfer_base(p_rate_id uuid, p_amount numeric, p_customer_name text, p_customer_document text, p_recipient_name text, p_recipient_document text, p_recipient_bank text, p_recipient_account text, p_contact_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r fx_rates; tid uuid; fee numeric;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and is_anonymous=true) then raise exception 'Sesión de invitado requerida'; end if;
 if p_contact_email is null or length(trim(p_contact_email))>320 or trim(p_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Correo de contacto no válido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from transfers where user_id=auth.uid() and created_at>now()-interval '1 day')>=10 then raise exception 'Límite de solicitudes de invitado alcanzado'; end if;
 select * into r from fx_rates where id=p_rate_id and active and valid_until>now() for share;
 if not found then raise exception 'La cotización ha vencido'; end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) or p_amount<r.min_amount or p_amount>r.max_amount then raise exception 'Monto fuera del rango permitido'; end if;
 if not exists(select 1 from deposit_accounts where active and currency=r.from_currency) then raise exception 'No hay una cuenta de ingreso habilitada'; end if;
 if exists(select 1 from unnest(array[p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account]) v where v is null or length(trim(v))<2 or length(v)>200) then raise exception 'Completa correctamente los datos'; end if;
 fee=round(p_amount*r.commission_percent/100,2);
 if round((p_amount-fee)*r.rate,2)<=0 then raise exception 'El monto neto debe ser mayor a cero'; end if;
 insert into transfers(user_id,rate_id,from_currency,to_currency,amount,rate,commission,recipient_amount,customer_name,customer_document,customer_email,customer_email_verified,recipient_name,recipient_document,recipient_bank,recipient_account,deposit_instructions)
 values(auth.uid(),r.id,r.from_currency,r.to_currency,p_amount,r.rate,fee,round((p_amount-fee)*r.rate,2),trim(p_customer_name),trim(p_customer_document),lower(trim(p_contact_email)),false,trim(p_recipient_name),trim(p_recipient_document),trim(p_recipient_bank),trim(p_recipient_account),(select jsonb_agg(jsonb_build_object('bank',bank,'holder',holder,'account_number',account_number,'instructions',instructions)) from deposit_accounts where active and currency=r.from_currency)) returning id into tid;
 insert into transfer_events(transfer_id,actor,action) values(tid,auth.uid(),'Solicitud registrada');
 return tid;
end $$;

create function public.create_guest_transfer_details(
 p_rate_id uuid, p_amount numeric, p_customer_name text, p_customer_document text,
 p_recipient_name text, p_recipient_document text, p_recipient_bank text, p_recipient_account text,
 p_recipient_account_type text, p_recipient_account_holder text, p_recipient_account_holder_document text, p_recipient_bank_branch text,
 p_customer_phone text, p_recipient_phone text, p_transfer_note text, p_contact_email text
) returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 if p_recipient_account_type is null or p_recipient_account_type not in ('bank_account','cci','pix') then raise exception 'Tipo de cuenta no válido'; end if;
 if p_recipient_account_holder is null or length(trim(p_recipient_account_holder))<2 or length(p_recipient_account_holder)>200 then raise exception 'Completa el titular de la cuenta'; end if;
 if p_recipient_account_holder_document is null or length(trim(p_recipient_account_holder_document))<2 or length(p_recipient_account_holder_document)>200 then raise exception 'Completa el documento del titular'; end if;
 if p_customer_phone is null or length(trim(p_customer_phone))<6 then raise exception 'Completa tu teléfono de contacto'; end if;
 if length(coalesce(p_recipient_bank_branch,''))>50 or length(coalesce(p_customer_phone,''))>40 or length(coalesce(p_recipient_phone,''))>40 or length(coalesce(p_transfer_note,''))>500 then raise exception 'Datos adicionales demasiado largos'; end if;
 if p_recipient_account_type='cci' and (p_recipient_account is null or p_recipient_account !~ '^[0-9]{20}$') then raise exception 'El CCI debe tener 20 dígitos'; end if;
 tid=public.create_guest_transfer_base(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account,p_contact_email);
 if (p_recipient_account_type='cci' and (select to_currency from transfers where id=tid)<>'PEN') or (p_recipient_account_type='pix' and (select to_currency from transfers where id=tid)<>'BRL') then raise exception 'Tipo de cuenta incompatible con la moneda de destino'; end if;
 update transfers set recipient_account_type=p_recipient_account_type,recipient_account_holder=trim(p_recipient_account_holder),recipient_account_holder_document=trim(p_recipient_account_holder_document),recipient_bank_branch=trim(coalesce(p_recipient_bank_branch,'')),customer_phone=trim(coalesce(p_customer_phone,'')),recipient_phone=trim(coalesce(p_recipient_phone,'')),transfer_note=trim(coalesce(p_transfer_note,'')) where id=tid;
 return tid;
end $$;

revoke execute on function public.create_guest_transfer_base(uuid,numeric,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke execute on function public.create_guest_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.create_guest_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
-- Linking an anonymous session to a verified account preserves its UUID and ownership.
create function public.verify_transfer_contact() returns void language plpgsql security definer set search_path=public as $$
declare verified_email text;
begin
 select email into verified_email from auth.users where id=auth.uid() and is_anonymous=false and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Confirma tu correo para guardar el acceso'; end if;
 update transfers set customer_email=verified_email,customer_email_verified=true where user_id=auth.uid() and customer_email_verified=false;
end $$;
revoke execute on function public.verify_transfer_contact() from public,anon;
grant execute on function public.verify_transfer_contact() to authenticated;
-- Never send financial documents to a guest's self-declared, unverified email.
create or replace function public.claim_invoice_delivery() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='sending',email_attempted_at=coalesce(email_attempted_at,now()) where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id where i.status='accepted' and i.environment='production' and t.customer_email_verified=true order by i.created_at for update of i skip locked limit 1) returning *;
$$;


-- Fuente: supabase/migrations/202610100006_safe_transfer_review.sql
-- Cancel only through a dedicated, state-checked RPC. Old UIs fail safely.
create or replace function public.review_transfer(p_transfer_id uuid, p_action text, p_note text, p_reference text default null, p_payout_path text default null) returns void language plpgsql security definer set search_path = public as $$
declare t transfers;
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede revisar'; end if;
 if p_action='cancel' then raise exception 'La cancelación requiere la confirmación dedicada. Actualiza la página'; end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>1000 then raise exception 'Registra una observación de revisión'; end if;
 select * into t from transfers where id=p_transfer_id for update;
 if not found then raise exception 'Operación no encontrada'; end if;
 if p_action='verify' and t.status='proof_submitted' then
  update transfers set status='verified',verified_at=now(),updated_at=now() where id=t.id;
 elsif p_action='request_proof' and t.status='proof_submitted' then
  update transfers set status='awaiting_payment',updated_at=now() where id=t.id;
 elsif p_action='payout' and t.status='verified' then
  if p_reference is null or length(trim(p_reference))<3 or length(p_reference)>200 then raise exception 'Falta referencia del envío'; end if;
  if p_payout_path is null or p_payout_path not like auth.uid()::text || '/' || t.id::text || '/payout/%' or not exists(select 1 from storage.objects where bucket_id='transfer-proofs' and name=p_payout_path) then raise exception 'Adjunta la constancia del envío'; end if;
  update transfers set status='paid_out',payout_path=p_payout_path,payout_reference=trim(p_reference),payout_at=now(),updated_at=now() where id=t.id;
  insert into invoices(transfer_id) values(t.id);
 else raise exception 'Cambio de estado no permitido'; end if;
 insert into transfer_events(transfer_id,actor,action,note) values(t.id,auth.uid(),p_action,trim(p_note));
end $$;

create function public.cancel_transfer(p_transfer_id uuid, p_expected_status text, p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare t transfers;
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede cancelar'; end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>1000 then raise exception 'Registra un motivo de cancelación'; end if;
 select * into t from transfers where id=p_transfer_id for update;
 if not found then raise exception 'Operación no encontrada'; end if;
 if p_expected_status is null or t.status<>p_expected_status then raise exception 'El estado cambió. Actualiza y revisa la operación antes de cancelar'; end if;
 if t.status not in ('awaiting_payment','proof_submitted','verified') then raise exception 'Cambio de estado no permitido'; end if;
 update transfers set status='cancelled',updated_at=now() where id=t.id;
 insert into transfer_events(transfer_id,actor,action,note) values(t.id,auth.uid(),'cancel',trim(p_note));
end $$;
revoke execute on function public.cancel_transfer(uuid,text,text) from public,anon;
grant execute on function public.cancel_transfer(uuid,text,text) to authenticated;

-- Keep the original cancel event. A staff correction adds a new audit event;
-- it never implies a payout, queues an invoice, or performs a bank transfer.
create function public.restore_verified_transfer(p_transfer_id uuid, p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare t transfers; recent_actions text[];
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede restaurar'; end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>1000 then raise exception 'Registra el motivo de restauración'; end if;
 select * into t from transfers where id=p_transfer_id for update;
 if not found then raise exception 'Operación no encontrada'; end if;
 select array_agg(action order by id desc) into recent_actions from
  (select id,action from transfer_events where transfer_id=t.id order by id desc limit 2) e;
 if t.status<>'cancelled' or t.verified_at is null or t.payout_at is not null
  or t.payout_path is not null or t.payout_reference is not null
  or exists(select 1 from invoices where transfer_id=t.id)
  or recent_actions is distinct from array['cancel','verify']::text[]
 then raise exception 'Solo se puede restaurar una cancelación posterior a confirmar el ingreso, sin envío ni facturación'; end if;
 update transfers set status='verified',updated_at=now() where id=t.id;
 insert into transfer_events(transfer_id,actor,action,note) values(t.id,auth.uid(),'restore_verified',trim(p_note));
end $$;
revoke execute on function public.restore_verified_transfer(uuid,text) from public,anon;
grant execute on function public.restore_verified_transfer(uuid,text) to authenticated;


-- Fuente: supabase/migrations/202610100007_billing_preferences.sql
-- Billing data is saved atomically with the operation, independently of its receiving account.
alter table public.transfers
 add column billing_type text not null default 'factura' check(billing_type in ('factura','boleta')),
 add column billing_email text,
 add column billing_email_verified boolean not null default false,
 add column billing_name text not null default '',
 add column billing_document text not null default '',
 add column billing_document_type text not null default '0' check(billing_document_type in ('0','1','4','6','7'));

update public.transfers set billing_email=customer_email,
 billing_email_verified=customer_email_verified,billing_name=customer_name,
 billing_document=customer_document;

alter table public.invoices add column document_type text not null default '01'
 check(document_type in ('01','03'));

create function public.set_invoice_document_type() returns trigger
language plpgsql set search_path=public as $$
begin
 select case when billing_type='boleta' then '03' else '01' end
 into new.document_type from public.transfers where id=new.transfer_id;
 return new;
end $$;
create trigger invoice_document_type before insert on public.invoices
 for each row execute function public.set_invoice_document_type();
revoke execute on function public.set_invoice_document_type() from public,anon,authenticated;

create function public.create_transfer_with_billing(
 p_rate_id uuid,p_amount numeric,p_customer_name text,p_customer_document text,
 p_recipient_name text,p_recipient_document text,p_recipient_bank text,p_recipient_account text,
 p_recipient_account_type text,p_recipient_account_holder text,p_recipient_account_holder_document text,p_recipient_bank_branch text,
 p_customer_phone text,p_recipient_phone text,p_transfer_note text,
 p_billing_type text,p_billing_email text,p_billing_name text,p_billing_document text,p_billing_document_type text
) returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid; guest boolean; verified_email text;
begin
 select is_anonymous,case when email_confirmed_at is not null and not is_anonymous then lower(email) end
 into guest,verified_email from auth.users where id=auth.uid();
 if not found then raise exception 'Sesión privada requerida'; end if;
 if p_billing_type is null or p_billing_type not in ('factura','boleta') then raise exception 'Elige factura o boleta'; end if;
 if p_billing_email is null or length(trim(p_billing_email))>254 or trim(p_billing_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Correo del comprobante no válido'; end if;
 if p_billing_name is null or length(trim(p_billing_name))<2 or length(p_billing_name)>200 then raise exception 'Completa el receptor del comprobante'; end if;
 if p_billing_document_type is null or p_billing_document_type not in ('0','1','4','6','7') or p_billing_document is null or length(trim(p_billing_document))<2 or length(trim(p_billing_document))>20 then raise exception 'Documento del comprobante no válido'; end if;
 if p_billing_type='factura' and (p_billing_document_type<>'6' or trim(p_billing_document) !~ '^[0-9]{11}$') then raise exception 'La factura requiere RUC de 11 dígitos y razón social'; end if;
 if (p_billing_document_type='1' and trim(p_billing_document) !~ '^[0-9]{8}$') or (p_billing_document_type='6' and trim(p_billing_document) !~ '^[0-9]{11}$') then raise exception 'Revisa el tipo y número del documento'; end if;
 if p_billing_type='boleta' and (trim(p_billing_name)<>trim(p_customer_name) or trim(p_billing_document)<>trim(p_customer_document)) then raise exception 'La boleta debe usar los datos del cliente'; end if;
 if guest then
  tid=public.create_guest_transfer_details(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account,p_recipient_account_type,p_recipient_account_holder,p_recipient_account_holder_document,p_recipient_bank_branch,p_customer_phone,p_recipient_phone,p_transfer_note,p_billing_email);
 else
  tid=public.create_transfer_details(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account,p_recipient_account_type,p_recipient_account_holder,p_recipient_account_holder_document,p_recipient_bank_branch,p_customer_phone,p_recipient_phone,p_transfer_note);
 end if;
 update public.transfers set billing_type=p_billing_type,billing_email=lower(trim(p_billing_email)),
  billing_email_verified=coalesce(verified_email=lower(trim(p_billing_email)),false),
  billing_name=trim(p_billing_name),billing_document=trim(p_billing_document),billing_document_type=p_billing_document_type
 where id=tid;
 return tid;
end $$;
revoke execute on function public.create_transfer_with_billing(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.create_transfer_with_billing(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- Confirming account access must not overwrite a separately chosen billing address.
create or replace function public.verify_transfer_contact() returns void
language plpgsql security definer set search_path=public as $$
declare verified_email text;
begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and is_anonymous=false and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Confirma tu correo para guardar el acceso'; end if;
 update transfers set customer_email=verified_email,customer_email_verified=true
 where user_id=auth.uid() and customer_email_verified=false;
 update transfers set billing_email=coalesce(billing_email,verified_email),billing_email_verified=true
 where user_id=auth.uid() and (billing_email is null or lower(billing_email)=verified_email);
end $$;

create or replace function public.claim_invoice_delivery() returns setof public.invoices
language sql security definer set search_path=public as $$
 update invoices set status='sending',email_attempted_at=coalesce(email_attempted_at,now())
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id
  where i.status='accepted' and i.environment='production'
  and ((t.billing_email is not null and t.billing_email_verified) or (t.billing_email is null and t.customer_email_verified))
  order by i.created_at for update of i skip locked limit 1) returning *;
$$;

-- The existing beta engine supports only invoices. Never issue a factura for a boleta request.
-- Production adapters receive code 03 and must implement the applicable boleta submission flow.
create or replace function public.claim_beta_invoice() returns setof public.invoices
language sql security definer set search_path=public as $$
 update invoices set environment='beta',
  status=case when document_type='03' then 'blocked' else 'processing' end,
  error=case when document_type='03' then 'Boleta solicitada: configurar el emisor de boletas; el motor beta actual solo admite facturas.' else null end,
  number=case when document_type='03' then number else coalesce(number,'F902-' || nextval('public.brasper_beta_invoice_number')) end
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id
  where i.status='queued' and i.environment in ('unconfigured','beta') and i.beta_sent_at is null and t.status='paid_out'
  order by i.created_at for update of i skip locked limit 1) returning *;
$$;


-- Fuente: supabase/migrations/202610100008_exchange_validation.sql
-- Structured customer declarations; no identity or banking service is implied.
alter table public.deposit_accounts add column country text check(country in ('PE','BR'));
update public.deposit_accounts set country=case currency when 'PEN' then 'PE' when 'BRL' then 'BR' end;
create function public.default_deposit_country() returns trigger language plpgsql set search_path=public as $$
begin
 if new.country is null then new.country=case new.currency when 'PEN' then 'PE' when 'BRL' then 'BR' end; end if;
 return new;
end $$;
create trigger deposit_country before insert on public.deposit_accounts for each row execute function public.default_deposit_country();
revoke execute on function public.default_deposit_country() from public,anon,authenticated;

alter table public.transfers
 add column customer_document_type text check(customer_document_type in ('0','1','4','6','7','cpf','cnpj')),
 add column source_country text check(source_country in ('PE','BR')),
 add column destination_country text check(destination_country in ('PE','BR')),
 add column origin_bank text,
 add column funds_origin text check(funds_origin in ('','salary','savings','business','sale','loan','family','other')),
 add column funds_detail text,
 add column transfer_purpose text,
 add column recipient_relationship text,
 add column funds_declared_at timestamptz,
 add column deposit_bank_reference text;

create function public.create_validated_transfer(
 p_rate_id uuid,p_amount numeric,p_customer_name text,p_customer_document text,
 p_recipient_name text,p_recipient_document text,p_recipient_bank text,p_recipient_account text,
 p_recipient_account_type text,p_recipient_account_holder text,p_recipient_account_holder_document text,p_recipient_bank_branch text,
 p_customer_phone text,p_recipient_phone text,p_transfer_note text,
 p_billing_type text,p_billing_email text,p_billing_name text,p_billing_document text,p_billing_document_type text,
 p_customer_document_type text,p_source_country text,p_destination_country text,p_origin_bank text,
 p_funds_origin text,p_funds_detail text,p_transfer_purpose text,p_recipient_relationship text,p_declaration_accepted boolean
) returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid; r fx_rates; accounts jsonb; expected_length integer;
begin
 if auth.uid() is null then raise exception 'Sesión privada requerida'; end if;
 if p_declaration_accepted is distinct from true then raise exception 'Confirma la declaración de titularidad y datos'; end if;
 if p_source_country is null or p_destination_country is null or p_source_country not in ('PE','BR') or p_destination_country not in ('PE','BR') then raise exception 'Indica los países de las cuentas bancarias'; end if;
 select * into r from fx_rates where id=p_rate_id for share;
 if not found then raise exception 'Cotización no encontrada'; end if;
 if (r.from_currency='PEN' and p_source_country<>'PE') or (r.to_currency='PEN' and p_destination_country<>'PE') or (r.from_currency='BRL' and p_source_country<>'BR') or (r.to_currency='BRL' and p_destination_country<>'BR') then raise exception 'El país no corresponde a la ruta seleccionada'; end if;
 select jsonb_agg(jsonb_build_object('bank',bank,'holder',holder,'account_number',account_number,'instructions',instructions,'country',country)) into accounts from deposit_accounts where active and currency=r.from_currency and country=p_source_country;
 if accounts is null then raise exception 'No hay cuenta de ingreso configurada para esa moneda y país'; end if;
 if p_origin_bank is null or length(trim(p_origin_bank))<2 or length(p_origin_bank)>200 then raise exception 'Indica el banco de origen'; end if;
 if p_customer_document_type is null or p_customer_document_type not in ('0','1','4','6','7','cpf','cnpj') then raise exception 'Tipo de documento no válido'; end if;
 expected_length=case p_customer_document_type when '1' then 8 when '6' then 11 when 'cpf' then 11 when 'cnpj' then 14 end;
 if p_customer_document is null or (expected_length is not null and trim(p_customer_document) !~ ('^[0-9]{' || expected_length || '}$')) or (expected_length is null and trim(p_customer_document) !~ '^[A-Za-z0-9-]{2,20}$') then raise exception 'Revisa el tipo y número de tu documento'; end if;
 if p_billing_type='boleta' and p_billing_document_type<>(case when p_customer_document_type in ('cpf','cnpj') then '0' else p_customer_document_type end) then raise exception 'El tipo de documento de la boleta debe coincidir con el remitente'; end if;
 if p_customer_phone is null or trim(p_customer_phone) !~ '^[+][1-9][0-9]{7,14}$' then raise exception 'Teléfono con código de país no válido'; end if;
 if p_funds_origin is null or p_funds_origin not in ('','salary','savings','business','sale','loan','family','other') or length(coalesce(p_funds_detail,''))>500 or length(coalesce(p_transfer_purpose,''))>500 or length(coalesce(p_recipient_relationship,''))>200 then raise exception 'Declaración de fondos no válida'; end if;
 if p_source_country='PE' or p_destination_country='PE' then
  if p_funds_origin='' then raise exception 'Indica el origen de los fondos para operaciones con Perú'; end if;
  if p_funds_origin='other' and length(trim(coalesce(p_funds_detail,'')))<5 then raise exception 'Describe el origen de tus fondos'; end if;
  if length(trim(coalesce(p_transfer_purpose,'')))<5 then raise exception 'Indica el motivo del cambio'; end if;
 end if;
 if (trim(p_customer_document) is distinct from trim(p_recipient_document) or trim(p_customer_document) is distinct from trim(p_recipient_account_holder_document)) and length(trim(coalesce(p_recipient_relationship,'')))<2 then raise exception 'Indica tu relación con el destinatario y el titular de la cuenta'; end if;
 tid=public.create_transfer_with_billing(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account,p_recipient_account_type,p_recipient_account_holder,p_recipient_account_holder_document,p_recipient_bank_branch,p_customer_phone,p_recipient_phone,p_transfer_note,p_billing_type,p_billing_email,p_billing_name,p_billing_document,p_billing_document_type);
 update transfers set customer_document_type=p_customer_document_type,source_country=p_source_country,destination_country=p_destination_country,origin_bank=trim(p_origin_bank),funds_origin=p_funds_origin,funds_detail=trim(coalesce(p_funds_detail,'')),transfer_purpose=trim(coalesce(p_transfer_purpose,'')),recipient_relationship=trim(coalesce(p_recipient_relationship,'')),funds_declared_at=now(),deposit_instructions=accounts where id=tid;
 return tid;
end $$;
revoke execute on function public.create_validated_transfer(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.create_validated_transfer(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean) to authenticated;

-- Old helpers remain callable by the owner of the new RPC, but customers cannot bypass its checks.
revoke execute on function public.create_transfer(uuid,numeric,text,text,text,text,text,text),public.create_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text),public.create_guest_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text),public.create_transfer_with_billing(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from authenticated;

create function public.submit_transfer_proof(p_transfer_id uuid,p_path text,p_bank_reference text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_bank_reference is null or length(trim(p_bank_reference))<2 or length(trim(p_bank_reference))>100 then raise exception 'Indica el número de operación de tu pago bancario'; end if;
 -- Existing proof helper locks the transfer, checks ownership/status and verifies private storage.
 perform public.submit_proof(p_transfer_id,p_path);
 update transfers set deposit_bank_reference=trim(p_bank_reference) where id=p_transfer_id;
end $$;
revoke execute on function public.submit_transfer_proof(uuid,text,text) from public,anon;
grant execute on function public.submit_transfer_proof(uuid,text,text) to authenticated;
revoke execute on function public.submit_proof(uuid,text) from authenticated;


-- Fuente: supabase/migrations/202610120009_pen_brl_only.sql
-- New business only supports PEN <-> BRL. Preserve historical transfers.
update public.fx_rates set active = false
where from_currency not in ('PEN','BRL') or to_currency not in ('PEN','BRL') or from_currency = to_currency;
update public.deposit_accounts set active = false where currency not in ('PEN','BRL');

alter table public.fx_rates add constraint active_pen_brl_routes
check (not active or (from_currency in ('PEN','BRL') and to_currency in ('PEN','BRL') and from_currency <> to_currency));
alter table public.deposit_accounts add constraint active_pen_brl_accounts
check (not active or currency in ('PEN','BRL'));


-- Fuente: supabase/migrations/202610120010_demo_receipts.sql
-- Presentation PDFs only. No SUNAT submission or customer email in this path.
alter table public.invoices drop constraint invoices_environment_check;
alter table public.invoices add constraint invoices_environment_check check(environment in ('unconfigured','beta','production','demo'));
alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in ('queued','processing','accepted','sending','delivered','blocked','reconciliation_required','beta_accepted','beta_rejected','beta_reconciliation_required','demo_generated'));
alter table public.invoices add column beta_attempts integer not null default 0,
 add column next_attempt_at timestamptz, add column processing_at timestamptz;
create sequence public.brasper_demo_invoice_number maxvalue 99999999 no cycle;
create function public.claim_demo_invoice(p_boleta_only boolean default false) returns setof public.invoices
language sql security definer set search_path=public as $$
 update invoices set environment='demo',status='processing',error=null,processing_at=now(),
 number=coalesce(number,'DEMO-' || nextval('public.brasper_demo_invoice_number'))
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id
 where (i.status='queued' or (i.status='processing' and i.environment='demo' and i.processing_at<now()-interval '5 minutes')) and i.environment in ('unconfigured','demo') and i.beta_sent_at is null
 and (not p_boleta_only or i.document_type='03') and t.status='paid_out'
 order by i.created_at for update of i skip locked limit 1) returning *;
$$;
revoke execute on function public.claim_demo_invoice(boolean) from public,anon,authenticated;
grant execute on function public.claim_demo_invoice(boolean) to service_role;
-- Fiscal workers cannot claim a demo retry when changing environment later.
create or replace function public.claim_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='processing',environment='production' where id=(select id from invoices where status='queued' and environment in ('unconfigured','production') order by created_at for update skip locked limit 1) returning *;
$$;
-- Bounded safe retries and recovery of already persisted SUNAT results.
create function public.schedule_beta_retry(p_invoice_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update invoices set status='queued',next_attempt_at=now()+interval '1 minute'*power(2,least(beta_attempts,5))
 where id=p_invoice_id and environment='beta' and status in ('processing','beta_reconciliation_required')
 and beta_sent_at is null and beta_attempts<5;
 return found;
end $$;
revoke execute on function public.schedule_beta_retry(uuid) from public,anon,authenticated;
grant execute on function public.schedule_beta_retry(uuid) to service_role;
-- Beta facturas only. Boletas are handled by the separate demo claim above.
create or replace function public.claim_beta_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set environment='beta',status='processing',error=null,processing_at=now(),beta_attempts=beta_attempts+1,
 number=coalesce(number,'F902-' || nextval('public.brasper_beta_invoice_number'))
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id
 where i.environment in ('unconfigured','beta') and i.document_type='01' and t.status='paid_out'
 and (i.next_attempt_at is null or i.next_attempt_at<=now()) and i.beta_attempts<5
 and (i.status='queued' or i.status='beta_reconciliation_required' or (i.status='processing' and i.processing_at<now()-interval '5 minutes'))
 and (i.beta_sent_at is null or (i.beta_prepared is not null and i.beta_result->>'estado' in ('aceptado','observado') and i.beta_result->>'codigo'='0' and coalesce(i.beta_result->>'cdrBase64','')<>''))
 order by i.created_at for update of i skip locked limit 1) returning *;
$$;


commit;
