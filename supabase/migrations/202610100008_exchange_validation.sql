-- Structured customer declarations; no identity or banking service is implied.
alter table public.deposit_accounts add column country text check(country in ('PE','BR'));
update public.deposit_accounts set country=case currency when 'PEN' then 'PE' when 'BRL' then 'BR' end;
create function public.default_deposit_country() returns trigger language plpgsql set search_path=public as $$
begin
 if new.country is null then new.country=case new.currency when 'PEN' then 'PE' when 'BRL' then 'BR' end; end if;
 return new;
end $$;
create trigger deposit_country before insert on public.deposit_accounts for each row execute function public.default_deposit_country();
revoke execute on function public.default_deposit_country() from public,anon,authenticated;

alter table public.transfers
 add column customer_document_type text check(customer_document_type in ('0','1','4','6','7','cpf','cnpj')),
 add column source_country text check(source_country in ('PE','BR')),
 add column destination_country text check(destination_country in ('PE','BR')),
 add column origin_bank text,
 add column funds_origin text check(funds_origin in ('','salary','savings','business','sale','loan','family','other')),
 add column funds_detail text,
 add column transfer_purpose text,
 add column recipient_relationship text,
 add column funds_declared_at timestamptz,
 add column deposit_bank_reference text;

create function public.create_validated_transfer(
 p_rate_id uuid,p_amount numeric,p_customer_name text,p_customer_document text,
 p_recipient_name text,p_recipient_document text,p_recipient_bank text,p_recipient_account text,
 p_recipient_account_type text,p_recipient_account_holder text,p_recipient_account_holder_document text,p_recipient_bank_branch text,
 p_customer_phone text,p_recipient_phone text,p_transfer_note text,
 p_billing_type text,p_billing_email text,p_billing_name text,p_billing_document text,p_billing_document_type text,
 p_customer_document_type text,p_source_country text,p_destination_country text,p_origin_bank text,
 p_funds_origin text,p_funds_detail text,p_transfer_purpose text,p_recipient_relationship text,p_declaration_accepted boolean
) returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid; r fx_rates; accounts jsonb; expected_length integer;
begin
 if auth.uid() is null then raise exception 'Sesión privada requerida'; end if;
 if p_declaration_accepted is distinct from true then raise exception 'Confirma la declaración de titularidad y datos'; end if;
 if p_source_country is null or p_destination_country is null or p_source_country not in ('PE','BR') or p_destination_country not in ('PE','BR') then raise exception 'Indica los países de las cuentas bancarias'; end if;
 select * into r from fx_rates where id=p_rate_id for share;
 if not found then raise exception 'Cotización no encontrada'; end if;
 if (r.from_currency='PEN' and p_source_country<>'PE') or (r.to_currency='PEN' and p_destination_country<>'PE') or (r.from_currency='BRL' and p_source_country<>'BR') or (r.to_currency='BRL' and p_destination_country<>'BR') then raise exception 'El país no corresponde a la ruta seleccionada'; end if;
 select jsonb_agg(jsonb_build_object('bank',bank,'holder',holder,'account_number',account_number,'instructions',instructions,'country',country)) into accounts from deposit_accounts where active and currency=r.from_currency and country=p_source_country;
 if accounts is null then raise exception 'No hay cuenta de ingreso configurada para esa moneda y país'; end if;
 if p_origin_bank is null or length(trim(p_origin_bank))<2 or length(p_origin_bank)>200 then raise exception 'Indica el banco de origen'; end if;
 if p_customer_document_type is null or p_customer_document_type not in ('0','1','4','6','7','cpf','cnpj') then raise exception 'Tipo de documento no válido'; end if;
 expected_length=case p_customer_document_type when '1' then 8 when '6' then 11 when 'cpf' then 11 when 'cnpj' then 14 end;
 if p_customer_document is null or (expected_length is not null and trim(p_customer_document) !~ ('^[0-9]{' || expected_length || '}$')) or (expected_length is null and trim(p_customer_document) !~ '^[A-Za-z0-9-]{2,20}$') then raise exception 'Revisa el tipo y número de tu documento'; end if;
 if p_billing_type='boleta' and p_billing_document_type<>(case when p_customer_document_type in ('cpf','cnpj') then '0' else p_customer_document_type end) then raise exception 'El tipo de documento de la boleta debe coincidir con el remitente'; end if;
 if p_customer_phone is null or trim(p_customer_phone) !~ '^[+][1-9][0-9]{7,14}$' then raise exception 'Teléfono con código de país no válido'; end if;
 if p_funds_origin is null or p_funds_origin not in ('','salary','savings','business','sale','loan','family','other') or length(coalesce(p_funds_detail,''))>500 or length(coalesce(p_transfer_purpose,''))>500 or length(coalesce(p_recipient_relationship,''))>200 then raise exception 'Declaración de fondos no válida'; end if;
 if p_source_country='PE' or p_destination_country='PE' then
  if p_funds_origin='' then raise exception 'Indica el origen de los fondos para operaciones con Perú'; end if;
  if p_funds_origin='other' and length(trim(coalesce(p_funds_detail,'')))<5 then raise exception 'Describe el origen de tus fondos'; end if;
  if length(trim(coalesce(p_transfer_purpose,'')))<5 then raise exception 'Indica el motivo del cambio'; end if;
 end if;
 if (trim(p_customer_document) is distinct from trim(p_recipient_document) or trim(p_customer_document) is distinct from trim(p_recipient_account_holder_document)) and length(trim(coalesce(p_recipient_relationship,'')))<2 then raise exception 'Indica tu relación con el destinatario y el titular de la cuenta'; end if;
 tid=public.create_transfer_with_billing(p_rate_id,p_amount,p_customer_name,p_customer_document,p_recipient_name,p_recipient_document,p_recipient_bank,p_recipient_account,p_recipient_account_type,p_recipient_account_holder,p_recipient_account_holder_document,p_recipient_bank_branch,p_customer_phone,p_recipient_phone,p_transfer_note,p_billing_type,p_billing_email,p_billing_name,p_billing_document,p_billing_document_type);
 update transfers set customer_document_type=p_customer_document_type,source_country=p_source_country,destination_country=p_destination_country,origin_bank=trim(p_origin_bank),funds_origin=p_funds_origin,funds_detail=trim(coalesce(p_funds_detail,'')),transfer_purpose=trim(coalesce(p_transfer_purpose,'')),recipient_relationship=trim(coalesce(p_recipient_relationship,'')),funds_declared_at=now(),deposit_instructions=accounts where id=tid;
 return tid;
end $$;
revoke execute on function public.create_validated_transfer(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.create_validated_transfer(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean) to authenticated;

-- Old helpers remain callable by the owner of the new RPC, but customers cannot bypass its checks.
revoke execute on function public.create_transfer(uuid,numeric,text,text,text,text,text,text),public.create_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text),public.create_guest_transfer_details(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text),public.create_transfer_with_billing(uuid,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from authenticated;

create function public.submit_transfer_proof(p_transfer_id uuid,p_path text,p_bank_reference text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_bank_reference is null or length(trim(p_bank_reference))<2 or length(trim(p_bank_reference))>100 then raise exception 'Indica el número de operación de tu pago bancario'; end if;
 -- Existing proof helper locks the transfer, checks ownership/status and verifies private storage.
 perform public.submit_proof(p_transfer_id,p_path);
 update transfers set deposit_bank_reference=trim(p_bank_reference) where id=p_transfer_id;
end $$;
revoke execute on function public.submit_transfer_proof(uuid,text,text) from public,anon;
grant execute on function public.submit_transfer_proof(uuid,text,text) to authenticated;
revoke execute on function public.submit_proof(uuid,text) from authenticated;
