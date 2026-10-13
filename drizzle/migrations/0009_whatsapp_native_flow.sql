-- see file
alter table public.whatsapp_sessions add column if not exists entry_mode text not null default 'web' check(entry_mode in ('web','native'));
create table if not exists public.whatsapp_flow_states (
 session_id uuid primary key references public.whatsapp_sessions(id) on delete cascade,
 data jsonb not null default '{}'::jsonb,
 auth_cipher text,
 processing_id uuid,
 processing_until timestamptz,
 completed_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.whatsapp_flow_states enable row level security;
revoke all on public.whatsapp_flow_states from public,anon,authenticated;
grant all on public.whatsapp_flow_states to service_role;
create or replace function public.claim_whatsapp_flow(p_session_id uuid) returns public.whatsapp_flow_states
language plpgsql security definer set search_path=public as $$
declare s whatsapp_sessions; f whatsapp_flow_states;
begin
 if auth.role()<>'service_role' then raise exception 'Service required';end if;
 select * into s from whatsapp_sessions where id=p_session_id for update;
 if not found or s.entry_mode<>'native' or s.expires_at<=now() then raise exception 'Acceso de Flow no válido';end if;
 insert into whatsapp_flow_states(session_id)values(s.id)on conflict do nothing;
 update whatsapp_flow_states set processing_id=gen_random_uuid(),processing_until=now()+interval '90 seconds',updated_at=now()
 where session_id=s.id and (processing_until is null or processing_until<=now()) returning * into f;
 if not found then raise exception 'Solicitud en curso. Intenta de nuevo.';end if;
 return f;
end $$;
revoke all on function public.claim_whatsapp_flow(uuid) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_flow(uuid) to service_role;
create or replace function public.create_whatsapp_native_transfer(p_session_id uuid,p_data jsonb,p_expected_rate numeric,p_expected_commission numeric) returns uuid
language plpgsql security definer set search_path=public as $$
declare s whatsapp_sessions; r fx_rates;
begin
 select * into s from whatsapp_sessions where id=p_session_id for update;
 if auth.uid() is null or not found or s.claimed_by is distinct from auth.uid() or s.entry_mode<>'native' or s.expires_at<=now() then raise exception 'Acceso de Flow no válido';end if;
 if s.transfer_id is not null then return s.transfer_id;end if;
 select * into r from fx_rates where id=(p_data->>'p_rate_id')::uuid for share;
 if not found or not r.active or r.valid_until<=now() or r.rate is distinct from p_expected_rate or r.commission_percent is distinct from p_expected_commission then raise exception 'La cotización cambió. Vuelve a cotizar.';end if;
 return public.create_whatsapp_transfer(s.id,p_data);
end $$;
revoke all on function public.create_whatsapp_native_transfer(uuid,jsonb,numeric,numeric) from public,anon;
grant execute on function public.create_whatsapp_native_transfer(uuid,jsonb,numeric,numeric) to authenticated;