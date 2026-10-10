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
