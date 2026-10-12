-- Tasas fijas para la prueba conectada. Revisar valores antes de ejecutar.
-- Se conservan los valores actuales de la demo; no son tasas de mercado.
-- Ejecutar manualmente como administrador, después de las migraciones.
-- No configura cuentas de ingreso ni mueve dinero.
begin;
-- Desactivar cotizaciones anteriores de estas rutas, conservando el historial.
update public.fx_rates set active=false
where (from_currency='PEN' and to_currency='BRL')
   or (from_currency='BRL' and to_currency='PEN');

insert into public.fx_rates(id,from_currency,to_currency,rate,commission_percent,min_amount,max_amount,active,valid_until)
values
 ('00000000-0000-4000-8000-000000000903','PEN','BRL',1.425,5,1,100000,true,now()+interval '30 days'),
 ('00000000-0000-4000-8000-000000000904','BRL','PEN',0.69,3,1,100000,true,now()+interval '30 days')
on conflict (id) do update set
 rate=excluded.rate,commission_percent=excluded.commission_percent,
 min_amount=excluded.min_amount,max_amount=excluded.max_amount,
 active=true,valid_until=excluded.valid_until;
commit;
-- Sin actualización automática: los valores quedan fijos hasta cambiarlos.
-- Al vencer los 30 días deja de aceptar solicitudes con estas cotizaciones.
