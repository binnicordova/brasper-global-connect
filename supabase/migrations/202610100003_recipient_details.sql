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
