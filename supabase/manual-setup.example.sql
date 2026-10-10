-- Plantilla de configuración manual: NO contiene datos oficiales.
-- Ejecutar únicamente desde SQL Editor como administrador, después de aplicar
-- la migración. Sustituir los marcadores con datos aprobados antes de descomentar.
-- No contiene claves ni contraseñas. No ejecutar desde el navegador.

-- 1. El miembro del equipo primero crea y confirma su cuenta en Auth.
-- Obtener su UUID en Auth > Users; no permitir que el cliente se asigne roles.
-- insert into public.staff_members(user_id)
-- values ('<UUID_REAL_DEL_USUARIO_DEL_EQUIPO>') on conflict do nothing;

-- 2. Cuenta oficial de recepción. Una entrada por cuenta y moneda admitida.
-- insert into public.deposit_accounts(currency, bank, holder, account_number, instructions, country)
-- values ('<PEN_O_BRL_O_USD>', '<BANCO_REAL>', '<TITULAR_OFICIAL>',
--         '<CUENTA_REAL>', '<INSTRUCCIONES_APROBADAS>', '<PE_O_BR>');

-- Las cuentas USD existentes requieren indicar el país real antes de aceptar solicitudes:
-- update public.deposit_accounts set country='<PE_O_BR>' where id='<UUID_CUENTA_USD>' and currency='USD';

-- 3. Cotización aprobada. La tasa es unidades destino por unidad origen;
-- comisión porcentual descontada del monto origen. Usar números reales.
-- insert into public.fx_rates(from_currency, to_currency, rate,
--                             commission_percent, min_amount, max_amount, valid_until)
-- values ('<MONEDA_ORIGEN>', '<MONEDA_DESTINO>', <TASA_APROBADA>,
--         <COMISION_PORCENTUAL>, <MINIMO>, <MAXIMO>, '<VENCIMIENTO_ISO_CON_ZONA>');

-- 4. Inspección de la cola (solo administración).
-- select id, transfer_id, status, number, error, created_at from public.invoices
-- order by created_at desc;
-- Reencolar solo blocked después de corregir la configuración y comprobar
-- que no existe emisión previa. processing/sending/reconciliation_required
-- requieren conciliación con el proveedor antes de cualquier cambio.
