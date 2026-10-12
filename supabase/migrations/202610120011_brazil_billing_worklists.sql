-- Routing uses the currency RECEIVED BY THE BENEFICIARY, as requested.
-- Historical emitted/reserved fiscal documents keep their original issuer.
alter table public.transfers drop constraint transfers_billing_type_check;
alter table public.transfers add constraint transfers_billing_type_check check(billing_type in ('factura','boleta','nfse'));
alter table public.transfers drop constraint transfers_billing_document_type_check;
alter table public.transfers add constraint transfers_billing_document_type_check check(billing_document_type in ('0','1','4','6','7','cpf','cnpj','foreign'));
alter table public.transfers add column billing_country text not null default 'PE' check(billing_country in ('PE','BR'));
alter table public.invoices drop constraint invoices_document_type_check;
alter table public.invoices add constraint invoices_document_type_check check(document_type in ('01','03','NFSE'));
alter table public.invoices add column issuer_country text not null default 'PE' check(issuer_country in ('PE','BR'));
-- Change only requests with no fiscal submission or issuance yet.
update public.transfers t set billing_country='BR',billing_type='nfse',billing_document_type='foreign'
where t.to_currency='BRL' and t.status<>'completed' and not exists(select 1 from public.invoices i where i.transfer_id=t.id and (i.beta_sent_at is not null or i.status not in ('queued','blocked') or i.external_id is not null));
update public.invoices i set document_type='NFSE',issuer_country='BR'
from public.transfers t where i.transfer_id=t.id and t.billing_country='BR' and i.beta_sent_at is null and i.external_id is null and i.status in ('queued','blocked');
create or replace function public.set_invoice_document_type() returns trigger language plpgsql set search_path=public as $$
begin
 select case billing_type when 'boleta' then '03' when 'nfse' then 'NFSE' else '01' end,billing_country
 into new.document_type,new.issuer_country from transfers where id=new.transfer_id;
 return new;
end $$;
create or replace function public.create_transfer_with_billing(
 p_rate_id uuid,p_amount numeric,p_customer_name text,p_customer_document text,
 p_recipient_name text,p_recipient_document text,p_recipient_bank text,p_recipient_account text,
 p_recipient_account_type text,p_recipient_account_holder text,p_recipient_account_holder_document text,p_recipient_bank_branch text,
 p_customer_phone text,p_recipient_phone text,p_transfer_note text,
 p_billing_type text,p_billing_email text,p_billing_name text,p_billing_document text,p_billing_document_type text
) returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid; guest boolean; verified_email text; destination text;
begin
 select is_anonymous,case when email_confirmed_at is not null and not is_anonymous then lower(email) end
 into guest,verified_email from auth.users where id=auth.uid();
 if not found then raise exception 'Sesión privada requerida'; end if;
 select to_currency into destination from fx_rates where id=p_rate_id;
 if destination='BRL' and p_billing_type is distinct from 'nfse' then raise exception 'Destino BRL requiere nota fiscal brasileña'; end if;
 if destination='PEN' and (p_billing_type is null or p_billing_type not in ('factura','boleta')) then raise exception 'Destino PEN requiere factura o boleta peruana'; end if;
 if p_billing_type is null or p_billing_type not in ('factura','boleta','nfse') then raise exception 'Tipo de comprobante no válido'; end if;
 if p_billing_email is null or length(trim(p_billing_email))>254 or trim(p_billing_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Correo del comprobante no válido'; end if;
 if p_billing_name is null or length(trim(p_billing_name))<2 or length(p_billing_name)>200 then raise exception 'Completa el receptor del comprobante'; end if;
 if p_billing_document_type is null or p_billing_document_type not in ('0','1','4','6','7','cpf','cnpj','foreign') or p_billing_document is null or length(trim(p_billing_document))<2 or length(trim(p_billing_document))>20 then raise exception 'Documento del comprobante no válido'; end if;
 if p_billing_type='nfse' and (p_billing_document_type not in ('cpf','cnpj','foreign') or (p_billing_document_type='cpf' and trim(p_billing_document) !~ '^[0-9]{11}$') or (p_billing_document_type='cnpj' and trim(p_billing_document) !~ '^[0-9]{14}$') or (p_billing_document_type='foreign' and trim(p_billing_document) !~ '^[A-Za-z0-9-]{2,20}$')) then raise exception 'Revisa CPF, CNPJ o documento extranjero'; end if;
 if p_billing_type='factura'  and (p_billing_document_type<>'6' or trim(p_billing_document) !~ '^[0-9]{11}$') then raise exception 'La factura requiere RUC de 11 dígitos y razón social'; end if;
 if (p_billing_document_type='1' and trim(p_billing_document) !~ '^[0-9]{8}$') or (p_billing_document_type='6' and trim(p_billing_document) !~ '^[0-9]{11}$') then raise exception 'Revisa el tipo y número del documento'; end if;
 if p_billing_type='boleta' and p_billing_document_type not in ('0','1','4','6','7') then raise exception 'Tipo de documento peruano no válido'; end if;
 if p_billing_type='boleta' and (trim(p_billing_name)<>trim(p_customer_name) or trim(p_billing_document)<>trim(p_customer_document)) then raise exception 'La boleta debe usar los datos del cliente'; end if;
 if guest then
  tid=public.create_guest_transfer_details(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account,p_recipient_account_type,p_recipient_account_holder,p_recipient_account_holder_document,p_recipient_bank_branch,p_customer_phone,p_recipient_phone,p_transfer_note,p_billing_email);
 else
  tid=public.create_transfer_details(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account,p_recipient_account_type,p_recipient_account_holder,p_recipient_account_holder_document,p_recipient_bank_branch,p_customer_phone,p_recipient_phone,p_transfer_note);
 end if;
 update public.transfers set billing_country=case destination when 'BRL' then 'BR' else 'PE' end,billing_type=p_billing_type,billing_email=lower(trim(p_billing_email)),
  billing_email_verified=coalesce(verified_email=lower(trim(p_billing_email)),false),
  billing_name=trim(p_billing_name),billing_document=trim(p_billing_document),billing_document_type=p_billing_document_type
 where id=tid;
 return tid;
end $$;

create or replace function public.claim_demo_invoice(p_boleta_only boolean default false) returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set environment='demo',status='processing',error=null,processing_at=now(),
 number=coalesce(number,'DEMO-' || nextval('public.brasper_demo_invoice_number'))
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id
 where (i.status='queued' or (i.status='processing' and i.environment='demo' and i.processing_at<now()-interval '5 minutes')) and i.environment in ('unconfigured','demo') and i.beta_sent_at is null
 and (not p_boleta_only or i.document_type in ('03','NFSE')) and t.status='paid_out'
 order by i.created_at for update of i skip locked limit 1) returning *;
$$;
create or replace function public.claim_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='processing',environment='production' where id=(select id from invoices where status='queued' and environment in ('unconfigured','production') and issuer_country='PE' order by created_at for update skip locked limit 1) returning *;
$$;
create function public.claim_brazil_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set status='blocked',error='Configurar emisor brasileño y credenciales Omie antes de emitir NFS-e.'
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id where i.status='queued' and i.issuer_country='BR' and i.environment in ('unconfigured','production') and t.status='paid_out' order by i.created_at for update of i skip locked limit 1) returning *;
$$;
revoke execute on function public.claim_brazil_invoice() from public,anon,authenticated;
grant execute on function public.claim_brazil_invoice() to service_role;
-- Worklist indexes; the SQL bundle applies these transactionally during the manual update.
create index transfers_staff_worklist on public.transfers(status,created_at desc,id);
create index invoices_staff_worklist on public.invoices(status,transfer_id);
create index transfers_customer_document_search on public.transfers(customer_document text_pattern_ops);
create or replace function public.claim_beta_invoice() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set environment='beta',status='processing',error=null,processing_at=now(),beta_attempts=beta_attempts+1,
 number=coalesce(number,'F902-' || nextval('public.brasper_beta_invoice_number'))
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id
 where i.issuer_country='PE' and i.environment in ('unconfigured','beta') and i.document_type='01' and t.status='paid_out'
 and (i.next_attempt_at is null or i.next_attempt_at<=now()) and i.beta_attempts<5
 and (i.status='queued' or i.status='beta_reconciliation_required' or (i.status='processing' and i.processing_at<now()-interval '5 minutes'))
 and (i.beta_sent_at is null or (i.beta_prepared is not null and i.beta_result->>'estado' in ('aceptado','observado') and i.beta_result->>'codigo'='0' and coalesce(i.beta_result->>'cdrBase64','')<>''))
 order by i.created_at for update of i skip locked limit 1) returning *;
$$;
