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
