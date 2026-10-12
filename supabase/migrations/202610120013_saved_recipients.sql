-- Private recipient shortcuts, saved only on explicit request from a registered user.
create function public.has_registered_session() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from auth.users where id=auth.uid() and not is_anonymous);
$$;
revoke all on function public.has_registered_session() from public,anon;
grant execute on function public.has_registered_session() to authenticated,service_role;
create table public.saved_recipients (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 label text not null check(length(trim(label)) between 2 and 80),
 currency text not null check(currency in ('PEN','BRL')),
 country text not null check(country in ('PE','BR')),
 recipient_name text not null,
 recipient_document text not null,
 recipient_bank text not null,
 recipient_account text not null,
 recipient_account_type text not null check(recipient_account_type in ('bank_account','cci','pix')),
 recipient_account_holder text not null,
 recipient_account_holder_document text not null,
 recipient_bank_branch text not null default '',
 recipient_phone text not null default '',
 recipient_relationship text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((currency='PEN' and country='PE' and recipient_account_type<>'pix') or (currency='BRL' and country='BR' and recipient_account_type<>'cci')),
 unique(user_id,currency,recipient_account_type,recipient_bank,recipient_account)
);
alter table public.saved_recipients enable row level security;
revoke all on public.saved_recipients from public,anon,authenticated;
grant select on public.saved_recipients to authenticated;
grant all on public.saved_recipients to service_role;
create policy saved_recipients_owner_read on public.saved_recipients for select to authenticated
 using(user_id=auth.uid() and public.has_registered_session());
create function public.save_transfer_recipient(p_transfer_id uuid,p_label text) returns uuid language plpgsql security definer set search_path=public as $$
declare t transfers; saved_id uuid;
begin
 if not public.has_registered_session() then raise exception 'Inicia sesión con una cuenta registrada para guardar destinatarios'; end if;
 if p_label is null or length(trim(p_label)) not between 2 and 80 then raise exception 'Indica un nombre para la cuenta (2 a 80 caracteres)'; end if;
 select * into t from transfers where id=p_transfer_id and user_id=auth.uid();
 if not found then raise exception 'Operación no disponible'; end if;
 if t.to_currency not in ('PEN','BRL') or length(t.recipient_account_holder)<2 or length(t.recipient_account_holder_document)<2 then raise exception 'Revisa los datos de la cuenta antes de guardarla'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select id into saved_id from saved_recipients where user_id=auth.uid() and currency=t.to_currency and recipient_account_type=t.recipient_account_type and recipient_bank=t.recipient_bank and recipient_account=t.recipient_account;
 if saved_id is null and (select count(*) from saved_recipients where user_id=auth.uid())>=50 then raise exception 'Puedes guardar hasta 50 cuentas'; end if;
 insert into saved_recipients(user_id,label,currency,country,recipient_name,recipient_document,recipient_bank,recipient_account,recipient_account_type,recipient_account_holder,recipient_account_holder_document,recipient_bank_branch,recipient_phone,recipient_relationship)
 values(auth.uid(),trim(p_label),t.to_currency,case t.to_currency when 'PEN' then 'PE' else 'BR' end,t.recipient_name,t.recipient_document,t.recipient_bank,t.recipient_account,t.recipient_account_type,t.recipient_account_holder,t.recipient_account_holder_document,t.recipient_bank_branch,t.recipient_phone,coalesce(t.recipient_relationship,''))
 on conflict(user_id,currency,recipient_account_type,recipient_bank,recipient_account) do update set label=excluded.label,recipient_name=excluded.recipient_name,recipient_document=excluded.recipient_document,recipient_account_holder=excluded.recipient_account_holder,recipient_account_holder_document=excluded.recipient_account_holder_document,recipient_bank_branch=excluded.recipient_bank_branch,recipient_phone=excluded.recipient_phone,recipient_relationship=excluded.recipient_relationship,updated_at=now()
 returning id into saved_id;
 return saved_id;
end $$;
create function public.delete_saved_recipient(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.has_registered_session() then raise exception 'Inicia sesión con una cuenta registrada'; end if;
 delete from saved_recipients where id=p_id and user_id=auth.uid();
 return found;
end $$;
revoke all on function public.save_transfer_recipient(uuid,text),public.delete_saved_recipient(uuid) from public,anon;
grant execute on function public.save_transfer_recipient(uuid,text),public.delete_saved_recipient(uuid) to authenticated;
