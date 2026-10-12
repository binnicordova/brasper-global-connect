> Para el despliegue actual consultar `docs/BIG_UPDATE.md`: boletas en PDF demo, recuperación de facturas aceptadas y reintentos limitados si todavía no hubo envío a SUNAT.

# SUNAT beta de Brasper

El motor reutiliza los constructores UBL, firma XML, transporte SOAP y verificador CDR del proyecto local `ChatGPT/facturacion/facturacionhotljb`. El emisor de ensayo es RUC 20608550454; no reutiliza el RUC, base de datos, tasa hotelera ni credenciales productivas de HOTEL JB.

La clave `BETA_API_KEY` existente fue reutilizada, con autorización del usuario, como token privado de gateway/worker para esta etapa. Está únicamente en `.env.billing-beta`, con permisos 0600 e ignorada por Git. El certificado diagnóstico incluido en el código es la fixture deliberadamente pública del proyecto original, jamás un certificado productivo. SUNAT beta utiliza las credenciales de prueba MODDATOS.

## Activación en Lovable

1. Sincroniza `main` y aplica las ocho migraciones en orden, incluyendo `202610100004_sunat_beta.sql` y `202610100005_guest_exchange.sql` una sola vez.
2. Configura el backend **de Brasper**, Auth, Storage, equipo, tasas y cuentas siguiendo `TRANSFER_WORKFLOW.md`.
3. En los secretos privados del servidor web configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BILLING_BETA_ENABLED=true` y `BILLING_GATEWAY_TOKEN`. Para el token reutiliza el valor del archivo local privado; no lo pegues en chat, código, variables VITE ni SQL público.
4. En los secretos de la Edge Function configura `BILLING_ENVIRONMENT=beta`, `BILLING_GATEWAY_URL=https://DOMINIO/api/billing-beta`, `BILLING_GATEWAY_TOKEN` y `BILLING_WORKER_SECRET`, reutilizando los valores privados autorizados. Supabase proporciona sus credenciales internas a la función. No conectes el proyecto Supabase del hotel.
5. Despliega `process-invoices --no-verify-jwt` y configura un scheduler privado que invoque POST con `Authorization: Bearer BILLING_WORKER_SECRET`. El gateway también exige POST, autorización y `Idempotency-Key` igual al UUID de factura.

El handler `/api/billing-beta` se ejecuta en servidor, con Node crypto y librerías XML/PDF; no puede sustituirse por una llamada de navegador. Verifica disponibilidad de secretos y compatibilidad Node del runtime de Lovable antes de activar el scheduler.

## Comportamiento

Tras verificar el ingreso y registrar manualmente el envío con constancia, la BD crea una solicitud única. El worker beta asigna una serie separada F902, prepara XML firmado y PDF, reserva el envío atómicamente antes de contactar SUNAT y guarda el resultado original antes de subir archivos. Una solicitud reservada no se reenvía automáticamente. F903 se reserva para pruebas independientes.

Las facturas de la cola usan el receptor fiscal y la comisión guardados en la operación. El principal de la remesa no se factura. Para comisiones BRL se aplica la tasa de la operación para expresar el servicio en PEN; el ensayo desglosa IGV 18% incluido, pendiente de confirmar para producción. PDF y XML reflejan los mismos datos. El smoke sin `--operation-demo` conserva valores de ensayo fijos; con esa opción usa un registro sintético. El resultado aceptado queda en `beta_accepted` y los PDF/XML/CDR en Storage privado. Beta no envía correo automático ni marca la transferencia `completed`.

Con la migración 010, si no hubo reserva de envío (`beta_sent_at IS NULL`), se permiten hasta cinco intentos con espera creciente. Si existe una aceptación guardada en `beta_result`, se recuperan los archivos de `beta_prepared` y CDR sin reenviar a SUNAT. Una reserva sin respuesta válida exige conciliación; no cambiarla a producción ni emitir otra vez automáticamente.

Los CDR se validan contra la referencia exacta y su estructura. La firma de demostración de SUNAT beta puede clasificarse como `no_disponible_beta`; nunca se considera una firma fiscal de producción ni se afirma confianza PKI por validar integridad.

## Verificación realizada

El 10 de octubre de 2026 se hizo **un envío real al servicio SUNAT beta**: `F903-91664285`, estado `aceptado`, código `0`, firma `no_disponible_beta`. XML firmado, PDF, CDR ZIP y respuesta se conservan localmente en `artifacts/billing-beta/F903-91664285/`, fuera de Git. Esta prueba no acredita despliegue de Lovable, conexión del backend de Brasper ni una factura de producción.

Para desarrollo local: `npm run setup:billing-beta` crea el archivo privado desde el proyecto original sin sobrescribirlo; `npm run dev:billing-beta` lo carga en el servidor. Añade las credenciales del backend de Brasper al archivo privado para activar la cola local. `npm run smoke:billing-beta` envía una sola prueba ficticia independiente: no ejecutarlo para reintentar un envío incierto.

Para producción faltan configuración fiscal propia de Brasper, credenciales SOL/certificado autorizado, tratamiento del servicio, series, receptor, adaptador productivo y correo verificado. Ninguna credencial productiva del hotel se copió.

El flujo web recoge factura o boleta. El motor SUNAT beta admite factura (`01`); las boletas (`03`) generan un PDF demo independiente sin consumir F902 ni contactar SUNAT. Ver [BILLING_PREFERENCES_LOVABLE.md](BILLING_PREFERENCES_LOVABLE.md).
