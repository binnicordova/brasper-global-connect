-- Cancel only through a dedicated, state-checked RPC. Old UIs fail safely.
create or replace function public.review_transfer(p_transfer_id uuid, p_action text, p_note text, p_reference text default null, p_payout_path text default null) returns void language plpgsql security definer set search_path = public as $$
declare t transfers;
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede revisar'; end if;
 if p_action='cancel' then raise exception 'La cancelación requiere la confirmación dedicada. Actualiza la página'; end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>1000 then raise exception 'Registra una observación de revisión'; end if;
 select * into t from transfers where id=p_transfer_id for update;
 if not found then raise exception 'Operación no encontrada'; end if;
 if p_action='verify' and t.status='proof_submitted' then
  update transfers set status='verified',verified_at=now(),updated_at=now() where id=t.id;
 elsif p_action='request_proof' and t.status='proof_submitted' then
  update transfers set status='awaiting_payment',updated_at=now() where id=t.id;
 elsif p_action='payout' and t.status='verified' then
  if p_reference is null or length(trim(p_reference))<3 or length(p_reference)>200 then raise exception 'Falta referencia del envío'; end if;
  if p_payout_path is null or p_payout_path not like auth.uid()::text || '/' || t.id::text || '/payout/%' or not exists(select 1 from storage.objects where bucket_id='transfer-proofs' and name=p_payout_path) then raise exception 'Adjunta la constancia del envío'; end if;
  update transfers set status='paid_out',payout_path=p_payout_path,payout_reference=trim(p_reference),payout_at=now(),updated_at=now() where id=t.id;
  insert into invoices(transfer_id) values(t.id);
 else raise exception 'Cambio de estado no permitido'; end if;
 insert into transfer_events(transfer_id,actor,action,note) values(t.id,auth.uid(),p_action,trim(p_note));
end $$;

create function public.cancel_transfer(p_transfer_id uuid, p_expected_status text, p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare t transfers;
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede cancelar'; end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>1000 then raise exception 'Registra un motivo de cancelación'; end if;
 select * into t from transfers where id=p_transfer_id for update;
 if not found then raise exception 'Operación no encontrada'; end if;
 if p_expected_status is null or t.status<>p_expected_status then raise exception 'El estado cambió. Actualiza y revisa la operación antes de cancelar'; end if;
 if t.status not in ('awaiting_payment','proof_submitted','verified') then raise exception 'Cambio de estado no permitido'; end if;
 update transfers set status='cancelled',updated_at=now() where id=t.id;
 insert into transfer_events(transfer_id,actor,action,note) values(t.id,auth.uid(),'cancel',trim(p_note));
end $$;
revoke execute on function public.cancel_transfer(uuid,text,text) from public,anon;
grant execute on function public.cancel_transfer(uuid,text,text) to authenticated;

-- Keep the original cancel event. A staff correction adds a new audit event;
-- it never implies a payout, queues an invoice, or performs a bank transfer.
create function public.restore_verified_transfer(p_transfer_id uuid, p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare t transfers; recent_actions text[];
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede restaurar'; end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>1000 then raise exception 'Registra el motivo de restauración'; end if;
 select * into t from transfers where id=p_transfer_id for update;
 if not found then raise exception 'Operación no encontrada'; end if;
 select array_agg(action order by id desc) into recent_actions from
  (select id,action from transfer_events where transfer_id=t.id order by id desc limit 2) e;
 if t.status<>'cancelled' or t.verified_at is null or t.payout_at is not null
  or t.payout_path is not null or t.payout_reference is not null
  or exists(select 1 from invoices where transfer_id=t.id)
  or recent_actions is distinct from array['cancel','verify']::text[]
 then raise exception 'Solo se puede restaurar una cancelación posterior a confirmar el ingreso, sin envío ni facturación'; end if;
 update transfers set status='verified',updated_at=now() where id=t.id;
 insert into transfer_events(transfer_id,actor,action,note) values(t.id,auth.uid(),'restore_verified',trim(p_note));
end $$;
revoke execute on function public.restore_verified_transfer(uuid,text) from public,anon;
grant execute on function public.restore_verified_transfer(uuid,text) to authenticated;
