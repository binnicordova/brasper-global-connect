# Big update: BD y Edge Function

## 1. BD → SQL Editor

- **Sin migraciones anteriores aplicadas:** ejecutar `supabase/release/database-update.sql` (incluye las once).
- **Con migraciones aplicadas:** ejecutar únicamente los archivos pendientes de `supabase/migrations/`, en orden. No repetir el paquete completo.
- **Catálogo demo opcional:** después ejecutar `supabase/demo/seed.sql`. No es necesario para `?demo=1`, que funciona localmente.

La migración `202610120009_pen_brl_only.sql` deja solo PEN ↔ BRL para nuevos cambios y conserva el historial.

## 2. Edge Functions → process-invoices

1. Crear o editar la función **`process-invoices`**.
2. Subir estos tres archivos conservando las rutas: `process-invoices/index.ts`, `process-invoices/deno.json` y `_shared/demo-receipt.ts`, desde `supabase/functions/`. Desplegar `process-invoices`.
3. Desactivar **Verify JWT**, como indica `supabase/config.toml`. La función exige su propio `Authorization: Bearer BILLING_WORKER_SECRET`.
4. Conservar los secretos existentes. Para SUNAT beta configurar:

| Secret de Edge Function | Valor                                 |
| ----------------------- | ------------------------------------- |
| `BILLING_ENVIRONMENT`   | `beta`                                |
| `BILLING_GATEWAY_URL`   | `https://TU_DOMINIO/api/billing-beta` |
| `BILLING_GATEWAY_TOKEN` | Token privado ya autorizado           |
| `BILLING_WORKER_SECRET` | Secreto privado del worker            |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los proporciona Supabase; no copiarlos al frontend.

**El gateway `/api/billing-beta` requiere servidor Node:** configurar allí `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BILLING_BETA_ENABLED=true` y el mismo `BILLING_GATEWAY_TOKEN`. Subir solo la Edge Function no activa ese gateway. No activar el scheduler hasta comprobar que el servidor y sus secretos están disponibles. Beta envía facturas al gateway; las boletas peruanas y NFS-e brasileñas generan un PDF demo independiente con los datos de la operación, sin llamar a SUNAT ni enviar correo. La migración `202610120010_demo_receipts.sql` habilita este camino. No modifica boletas antiguas bloqueadas.

## 3. Configuración y comprobación

- Auth: activar **Anonymous sign-ins** y **Manual identity linking**.
- Equipo y cuentas PEN/BRL: completar `supabase/manual-setup.example.sql`. Tasas fijas de prueba: revisar y ejecutar `supabase/fixed-rates.example.sql` (sin actualización automática; vigencia de 30 días).
- Comprobar: migraciones aplicadas, función desplegada y una llamada sin autorización devuelve **401**. No emitir ni enviar correos durante esta comprobación.

## Prompt corto para Lovable

> Implementa únicamente docs/BIG_UPDATE.md: aplica las migraciones SQL pendientes y despliega process-invoices incluyendo index.ts, deno.json y _shared/demo-receipt.ts según las rutas indicadas y supabase/config.toml. Conserva los secretos; informa solo los faltantes. Comprueba Auth anónimo y que la función rechace llamadas sin autorización. No rediseñes, refactorices, regeneres código ni desarrolles IA/WhatsApp. No hagas emisiones, correos ni despliegues externos adicionales. Responde con estado de BD, Edge Function y bloqueo concreto si existe.

## De dónde salen los secretos

- `BILLING_ENVIRONMENT`: escribir `beta`. No es una contraseña.
- `BILLING_GATEWAY_URL`: URL del servidor publicado: `https://TU_DOMINIO/api/billing-beta`. No sirve una URL localhost.
- `BILLING_GATEWAY_TOKEN`: token propio compartido entre Edge Function y gateway. Ya está definido en el archivo local privado `.env.billing-beta`; copiarlo a Secrets, nunca al chat o Git.
- `BILLING_WORKER_SECRET`: secreto propio para autorizar al scheduler. También está definido en `.env.billing-beta`; copiarlo a Secrets y usarlo en la cabecera del scheduler.

Para probar ambos tipos sin gateway, usar `BILLING_ENVIRONMENT=demo`: genera PDF demo de boleta y factura. Mantener `beta` si se desea probar facturas en SUNAT beta. Los PDF demo quedan privados en Storage con estado `demo_generated`; el correo real requiere la integración de email pendiente.

Estos tokens son de nuestra integración, no credenciales entregadas por SUNAT. Mantener los valores actuales para que ambos servicios coincidan. El worker devuelve 401 si falta su secreto o si la llamada no lleva el valor correcto.

## Facturas beta: activar servidor y reintentos

La factura beta usa el receptor fiscal y la comisión de cada operación. Para comisiones BRL, las convierte a PEN con la tasa guardada de la operación. El ensayo desglosa IGV 18% incluido en esa comisión; es una configuración de prueba, pendiente de confirmar para producción. PDF y XML comparten los mismos importes.

En el servidor de la web (además de Secrets de la Edge Function): configurar `BILLING_BETA_ENABLED=true`, `BILLING_GATEWAY_TOKEN` con el mismo valor, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Son variables privadas del servidor, nunca `VITE_*`. Re-publicar con servidor Node disponible.

- Reintento automático solo si BD confirma `beta_sent_at IS NULL`: hasta 5 intentos con espera creciente. Requiere invocar periódicamente el worker autenticado.
- SUNAT ya aceptó pero falló la devolución/Storage: recuperar PDF, XML y CDR guardados, usando el mismo número; no volver a emitir.
- Respuesta incierta sin resultado guardado: conciliación; no reenviar a ciegas. Rechazo SUNAT: conservar diagnóstico y corregirlo antes de una nueva emisión.
- Correo: el circuito beta no envía emails. El envío nativo de Lovable sigue pendiente; debe consumir el documento ya generado y tener su propio estado/reintento, sin emitir nuevamente.

Comprobación del 12/10/2026: factura con datos de operación demo `F903-91841179` aceptada directamente por SUNAT beta, CDR código `0`. Gateway web publicado responde `503 Beta disabled` a una llamada autenticada sin datos de emisión. Activar las variables del servidor antes del scheduler. Esta prueba no certifica el despliegue completo.

## Regla de país y bandejas (migración 011)

Aplicar `202610120011_brazil_billing_worklists.sql`: moneda **recibida por el destinatario** PEN → boleta/factura Perú; BRL → NFS-e Brasil. Conserva comprobantes históricos ya emitidos. Incluye índices para las bandejas. En beta/demo Brasil genera PDF demo en BRL; producción Brasil queda bloqueada hasta configurar el proveedor y emisor. No se envía una NFS-e a SUNAT.

La web incorpora Pagos por revisar, Envíos pendientes, Todas las operaciones y Facturación. Generado y correo enviado son estados distintos. No activar correo ni cron hasta terminar la configuración pendiente.

## Presentación pulida y RUC de beta

La interfaz usa textos operativos y herramientas de presentación plegadas; los estados preparados no se confunden con correos enviados. Catálogo sintético actualizado en `supabase/demo/seed.sql`. Archivos de prueba conservan identificación discreta de su entorno.

El gateway beta usa el RUC autorizado `10042049579` y las credenciales públicas de pruebas MODDATOS; esto no utiliza la clave SOL de producción. La denominación del emisor es de pruebas, pendiente de su identidad fiscal aprobada. Re-publicar la web para actualizar este motor; los secretos del servidor indicados arriba siguen siendo necesarios. No modificar comprobantes ya preparados o enviados bajo el RUC anterior: recuperarlos con su identificación original.

Prueba del 12/10/2026: factura `F903-91844545`, por comisión de 31,05 PEN, aceptada directamente en SUNAT beta con código 0. PDF/XML/CDR guardados localmente. El gateway desplegado, cron y correo siguen pendientes del big update; esta comprobación no activa esos servicios. [Pautas oficiales SUNAT beta](https://orientacion.sunat.gob.pe/12-pautas-servicio-beta).
