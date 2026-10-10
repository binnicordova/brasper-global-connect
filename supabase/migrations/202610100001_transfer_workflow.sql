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
