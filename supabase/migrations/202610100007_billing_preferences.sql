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
