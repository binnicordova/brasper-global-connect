# Big update: BD y Edge Function

## 1. BD → SQL Editor

- **Sin migraciones anteriores aplicadas:** ejecutar `supabase/release/database-update.sql` (incluye las nueve).
- **Con migraciones aplicadas:** ejecutar únicamente los archivos pendientes de `supabase/migrations/`, en orden. No repetir el paquete completo.
- **Catálogo demo opcional:** después ejecutar `supabase/demo/seed.sql`. No es necesario para `?demo=1`, que funciona localmente.

La migración `202610120009_pen_brl_only.sql` deja solo PEN ↔ BRL para nuevos cambios y conserva el historial.

## 2. Edge Functions → process-invoices

1. Crear o editar la función **`process-invoices`**.
2. Copiar todo `supabase/functions/process-invoices/index.ts` como `index.ts` y desplegar.
3. Desactivar **Verify JWT**, como indica `supabase/config.toml`. La función exige su propio `Authorization: Bearer BILLING_WORKER_SECRET`.
4. Conservar los secretos existentes. Para SUNAT beta configurar:

| Secret de Edge Function | Valor                                 |
| ----------------------- | ------------------------------------- |
| `BILLING_ENVIRONMENT`   | `beta`                                |
| `BILLING_GATEWAY_URL`   | `https://TU_DOMINIO/api/billing-beta` |
| `BILLING_GATEWAY_TOKEN` | Token privado ya autorizado           |
| `BILLING_WORKER_SECRET` | Secreto privado del worker            |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los proporciona Supabase; no copiarlos al frontend.

**El gateway `/api/billing-beta` requiere servidor Node:** configurar allí `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BILLING_BETA_ENABLED=true` y el mismo `BILLING_GATEWAY_TOKEN`. Subir solo la Edge Function no activa ese gateway. No activar el scheduler hasta comprobar que el servidor y sus secretos están disponibles. Beta admite factura; boleta queda bloqueada.

## 3. Configuración y comprobación

- Auth: activar **Anonymous sign-ins** y **Manual identity linking**.
- Equipo y cuentas PEN/BRL: completar `supabase/manual-setup.example.sql`. Tasas fijas de prueba: revisar y ejecutar `supabase/fixed-rates.example.sql` (sin actualización automática; vigencia de 30 días).
- Comprobar: migraciones aplicadas, función desplegada y una llamada sin autorización devuelve **401**. No emitir ni enviar correos durante esta comprobación.

## Prompt corto para Lovable

> Implementa únicamente docs/BIG_UPDATE.md: aplica las migraciones SQL pendientes y despliega process-invoices usando exactamente supabase/functions/process-invoices/index.ts y supabase/config.toml. Conserva los secretos; informa solo los faltantes. Comprueba Auth anónimo y que la función rechace llamadas sin autorización. No rediseñes, refactorices, regeneres código ni desarrolles IA/WhatsApp. No hagas emisiones, correos ni despliegues externos adicionales. Responde con estado de BD, Edge Function y bloqueo concreto si existe.

## De dónde salen los secretos

- `BILLING_ENVIRONMENT`: escribir `beta`. No es una contraseña.
- `BILLING_GATEWAY_URL`: URL del servidor publicado: `https://TU_DOMINIO/api/billing-beta`. No sirve una URL localhost.
- `BILLING_GATEWAY_TOKEN`: token propio compartido entre Edge Function y gateway. Ya está definido en el archivo local privado `.env.billing-beta`; copiarlo a Secrets, nunca al chat o Git.
- `BILLING_WORKER_SECRET`: secreto propio para autorizar al scheduler. También está definido en `.env.billing-beta`; copiarlo a Secrets y usarlo en la cabecera del scheduler.

Estos tokens son de nuestra integración, no credenciales entregadas por SUNAT. Mantener los valores actuales para que ambos servicios coincidan. El worker devuelve 401 si falta su secreto o si la llamada no lleva el valor correcto.
