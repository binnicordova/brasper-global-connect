-- New business only supports PEN <-> BRL. Preserve historical transfers.
update public.fx_rates set active = false
where from_currency not in ('PEN','BRL') or to_currency not in ('PEN','BRL') or from_currency = to_currency;
update public.deposit_accounts set active = false where currency not in ('PEN','BRL');

alter table public.fx_rates add constraint active_pen_brl_routes
check (not active or (from_currency in ('PEN','BRL') and to_currency in ('PEN','BRL') and from_currency <> to_currency));
alter table public.deposit_accounts add constraint active_pen_brl_accounts
check (not active or currency in ('PEN','BRL'));
