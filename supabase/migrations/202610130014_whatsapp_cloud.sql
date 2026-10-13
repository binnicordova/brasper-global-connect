-- Native WhatsApp chat + the existing published Brasper web. No financial approvals by AI.
create table if not exists public.whatsapp_channels (
 phone text primary key check(phone ~ '^[1-9][0-9]{7,14}$'),
 mode text not null default 'assistant' check(mode in ('assistant','human')),
 history jsonb not null default '[]'::jsonb,
 ai_window timestamptz not null default now(), ai_calls integer not null default 0,
 last_inbound timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.whatsapp_sessions (
 id uuid primary key default gen_random_uuid(), phone text not null references public.whatsapp_channels(phone),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '2 hours',
 claimed_by uuid references auth.users(id), transfer_id uuid unique references public.transfers(id),
 notification_state text not null default 'pending' check(notification_state in ('pending','accepted','failed'))
);
create index if not exists whatsapp_sessions_phone on public.whatsapp_sessions(phone,created_at desc);
create table if not exists public.whatsapp_events (
 id text primary key, phone text not null, payload jsonb not null,
 status text not null default 'processing' check(status in ('processing','done','failed')),
 error_code text, created_at timestamptz not null default now()
);
alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_events enable row level security;
revoke all on public.whatsapp_channels,public.whatsapp_sessions,public.whatsapp_events from anon,authenticated;
grant select on public.whatsapp_channels,public.whatsapp_sessions,public.whatsapp_events to authenticated;
grant all on public.whatsapp_channels,public.whatsapp_sessions,public.whatsapp_events to service_role;
create policy whatsapp_staff_channels on public.whatsapp_channels for select to authenticated using(public.is_staff());
create policy whatsapp_staff_sessions on public.whatsapp_sessions for select to authenticated using(public.is_staff());
create policy whatsapp_staff_events on public.whatsapp_events for select to authenticated using(public.is_staff());

create or replace function public.claim_whatsapp_session(p_id uuid,p_user uuid) returns public.whatsapp_sessions
language plpgsql security definer set search_path=public as $$
declare s whatsapp_sessions;
begin
 if auth.role()<>'service_role' then raise exception 'Service required'; end if;
 select * into s from whatsapp_sessions where id=p_id for update;
 if not found or s.expires_at<=now() then raise exception 'Enlace caducado'; end if;
 if s.claimed_by is not null and s.claimed_by<>p_user then raise exception 'Enlace usado en otro acceso'; end if;
 update whatsapp_sessions set claimed_by=p_user where id=p_id returning * into s;
 return s;
end $$;
revoke all on function public.claim_whatsapp_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_session(uuid,uuid) to service_role;

create or replace function public.create_whatsapp_transfer(p_session_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare s whatsapp_sessions; tid uuid;
begin
 select * into s from whatsapp_sessions where id=p_session_id for update;
 if auth.uid() is null or not found or s.claimed_by is distinct from auth.uid() or s.expires_at<=now() then raise exception 'Acceso de WhatsApp no válido'; end if;
 if s.transfer_id is not null then return s.transfer_id; end if;
 tid=public.create_validated_transfer(
 (p_data->>'p_rate_id')::uuid,(p_data->>'p_amount')::numeric,
 p_data->>'p_customer_name',p_data->>'p_customer_document',p_data->>'p_recipient_name',p_data->>'p_recipient_document',
 p_data->>'p_recipient_bank',p_data->>'p_recipient_account',p_data->>'p_recipient_account_type',p_data->>'p_recipient_account_holder',
 p_data->>'p_recipient_account_holder_document',p_data->>'p_recipient_bank_branch',p_data->>'p_customer_phone',p_data->>'p_recipient_phone',p_data->>'p_transfer_note',
 p_data->>'p_billing_type',p_data->>'p_billing_email',p_data->>'p_billing_name',p_data->>'p_billing_document',p_data->>'p_billing_document_type',
 p_data->>'p_customer_document_type',p_data->>'p_source_country',p_data->>'p_destination_country',p_data->>'p_origin_bank',
 p_data->>'p_funds_origin',p_data->>'p_funds_detail',p_data->>'p_transfer_purpose',p_data->>'p_recipient_relationship',(p_data->>'p_declaration_accepted')::boolean
 );
 update whatsapp_sessions set transfer_id=tid where id=s.id;
 return tid;
end $$;
revoke all on function public.create_whatsapp_transfer(uuid,jsonb) from public,anon;
grant execute on function public.create_whatsapp_transfer(uuid,jsonb) to authenticated;

create or replace function public.reserve_whatsapp_ai(p_phone text) returns boolean
language plpgsql security definer set search_path=public as $$
declare c whatsapp_channels;
begin
 if auth.role()<>'service_role' then return false; end if;
 select * into c from whatsapp_channels where phone=p_phone for update;
 if not found or c.mode='human' then return false; end if;
 if c.ai_window<now()-interval '1 hour' then update whatsapp_channels set ai_window=now(),ai_calls=1 where phone=p_phone;return true;end if;
 if c.ai_calls>=30 then return false;end if;
 update whatsapp_channels set ai_calls=ai_calls+1 where phone=p_phone;return true;
end $$;
revoke all on function public.reserve_whatsapp_ai(text) from public,anon,authenticated;
grant execute on function public.reserve_whatsapp_ai(text) to service_role;
