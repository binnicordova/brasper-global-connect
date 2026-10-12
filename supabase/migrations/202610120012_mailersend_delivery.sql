-- MailerSend delivery is independent of fiscal issuance, including beta/preview PDFs.
alter table public.invoices
 add column email_status text not null default 'pending' check(email_status in ('pending','sending','submitted','sent','retry','blocked','reconciliation_required')),
 add column email_attempts integer not null default 0 check(email_attempts between 0 and 5),
 add column email_next_attempt_at timestamptz,
 add column email_processing_at timestamptz,
 add column email_request_started_at timestamptz,
 add column email_provider_id text,
 add column email_recipient text,
 add column email_error text,
 add column email_sent_at timestamptz,
 add column email_checked_at timestamptz;
-- Historical deliveries must never be resent. Unknown legacy sends need reconciliation.
update public.invoices set email_status='sent',email_sent_at=delivered_at where status='delivered';
update public.invoices set email_status='reconciliation_required',email_error='Revisar envío anterior antes de usar MailerSend.' where status='sending' or (email_attempted_at is not null and status<>'delivered');
create index invoices_mailersend_queue on public.invoices(email_status,email_next_attempt_at,created_at);
create function public.claim_mailersend_delivery(p_environment text) returns setof public.invoices language plpgsql security definer set search_path=public as $$
begin
 if p_environment not in ('beta','demo','production') then raise exception 'Entorno no válido'; end if;
 update invoices set email_status=case when email_request_started_at is not null then 'reconciliation_required' when email_attempts>=5 then 'blocked' else 'retry' end,email_error='Lease de correo vencido; revisar si la petición llegó al proveedor.'
 where email_status='sending' and email_processing_at<now()-interval '5 minutes';
 return query update invoices set email_status='sending',email_attempts=email_attempts+1,email_processing_at=now(),email_error=null
 where id=(select i.id from invoices i join transfers t on t.id=i.transfer_id
 where i.email_status in ('pending','retry') and i.email_attempts<5 and i.email_provider_id is null and i.email_request_started_at is null
 and (i.email_next_attempt_at is null or i.email_next_attempt_at<=now()) and i.pdf_path is not null and t.status='paid_out'
 and ((p_environment='production' and i.environment='production' and i.status='accepted') or (p_environment='beta' and ((i.environment='beta' and i.status='beta_accepted') or (i.environment='demo' and i.status='demo_generated'))) or (p_environment='demo' and i.environment='demo' and i.status='demo_generated'))
 order by i.created_at for update of i skip locked limit 1) returning *;
end $$;
create function public.start_mailersend_request(p_invoice_id uuid,p_attempt integer,p_recipient text) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update invoices set email_request_started_at=now(),email_recipient=p_recipient,email_attempted_at=coalesce(email_attempted_at,now())
 where id=p_invoice_id and email_status='sending' and email_attempts=p_attempt and email_request_started_at is null and email_processing_at>now()-interval '5 minutes';
 return found;
end $$;
create function public.record_mailersend_result(p_invoice_id uuid,p_attempt integer,p_state text,p_message_id text default null,p_error text default null,p_delay integer default 60) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if p_state not in ('submitted','retry','blocked','reconciliation_required') then raise exception 'Estado de entrega no válido'; end if;
 if p_state='submitted' and coalesce(p_message_id,'')='' then raise exception 'Falta identificador de MailerSend'; end if;
 update invoices set email_status=case when p_state='retry' and email_attempts>=5 then 'blocked' else p_state end,
 email_provider_id=p_message_id,email_error=left(p_error,500),email_processing_at=null,
 email_request_started_at=case when p_state='retry' then null else email_request_started_at end,
 email_next_attempt_at=case when p_state='retry' then now()+make_interval(secs=>greatest(60,least(p_delay,86400))) else null end
 where id=p_invoice_id and email_attempts=p_attempt and email_status in ('sending','reconciliation_required') and email_provider_id is null;
 return found;
end $$;
create function public.claim_mailersend_status() returns setof public.invoices language sql security definer set search_path=public as $$
 update invoices set email_checked_at=now() where id=(select id from invoices where email_status='submitted' and email_provider_id is not null and (email_checked_at is null or email_checked_at<now()-interval '2 minutes') order by email_checked_at nulls first,created_at for update skip locked limit 1) returning *;
$$;
create function public.confirm_mailersend_status(p_invoice_id uuid,p_message_id text,p_state text,p_error text default null) returns boolean language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 if p_state not in ('sent','blocked','submitted') then raise exception 'Estado no válido'; end if;
 update invoices set email_status=p_state,email_error=left(p_error,500),email_sent_at=case when p_state='sent' then now() else email_sent_at end,
 status=case when p_state='sent' and status='accepted' then 'delivered' else status end,
 delivered_at=case when p_state='sent' then now() else delivered_at end
 where id=p_invoice_id and email_provider_id=p_message_id and email_status='submitted' returning transfer_id into tid;
 if tid is null then return false; end if;
 if p_state='sent' then
  update transfers set status='completed',updated_at=now() where id=tid and status='paid_out';
  insert into transfer_events(transfer_id,action,note) values(tid,'Comprobante enviado al correo','MailerSend confirmó envío.');
 end if;
 return true;
end $$;
revoke execute on function public.claim_mailersend_delivery(text),public.start_mailersend_request(uuid,integer,text),public.record_mailersend_result(uuid,integer,text,text,text,integer),public.claim_mailersend_status(),public.confirm_mailersend_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_mailersend_delivery(text),public.start_mailersend_request(uuid,integer,text),public.record_mailersend_result(uuid,integer,text,text,text,integer),public.claim_mailersend_status(),public.confirm_mailersend_status(uuid,text,text,text) to service_role;
