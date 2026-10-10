-- Aggregate the entire operation history, not just the visible page of rows.
create function public.staff_dashboard_summary() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_staff() then raise exception 'Solo el equipo autorizado puede consultar el dashboard'; end if;
 return jsonb_build_object(
  'statuses', coalesce((select jsonb_object_agg(status, count) from
    (select status, count(*) as count from public.transfers group by status) s), '{}'::jsonb),
  'invoices', coalesce((select jsonb_object_agg(status, count) from
    (select status, count(*) as count from public.invoices group by status) s), '{}'::jsonb),
  'amounts', coalesce((select jsonb_agg(s) from
    (select from_currency as currency, sum(amount) as amount, count(*) as operations
     from public.transfers where status <> 'cancelled' group by from_currency order by from_currency) s), '[]'::jsonb)
 );
end $$;
revoke execute on function public.staff_dashboard_summary() from public, anon;
grant execute on function public.staff_dashboard_summary() to authenticated;
