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
