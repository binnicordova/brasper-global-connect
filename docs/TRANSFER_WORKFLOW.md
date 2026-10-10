# Activación del flujo de Brasper

El desarrollo añade `/transferencias`: autenticación por correo, cotización basada en tasas configuradas, solicitudes persistidas, evidencia privada, seguimiento y revisión del equipo. La landing conserva el cálculo ilustrativo separado de las cotizaciones operativas y abre el WhatsApp publicado por Brasper: +51 966 991 933.

## Configuración de Supabase

1. Crear o elegir el proyecto de Brasper. Copiar `.env.example` a `.env.local` y configurar URL y clave pública/anon. No colocar service_role ni claves fiscales en VITE_*.
2. Aplicar las ocho migraciones en orden, desde `202610100001_transfer_workflow.sql` hasta `202610100008_exchange_validation.sql`, con SQL Editor o `supabase db push`. Crean permisos RLS, buckets privados, resumen global, datos de cuenta receptora, revisión segura, elección de comprobante y declaraciones de fondos. No repetir migraciones ya aplicadas.
3. Configurar Auth: Site URL y redirect permitido `https://DOMINIO/transferencias`; confirmación de correo habilitada y SMTP oficial. Habilitar **Anonymous sign-ins** y **manual identity linking** para «Continuar sin cuenta». Los usuarios crean su cuenta; un administrador añade los UUID autorizados a `public.staff_members` desde SQL Editor. Los usuarios no pueden darse ese rol.
4. Registrar cuentas oficiales de ingreso en `deposit_accounts`: moneda, banco, titular, número e instrucciones. Las instrucciones se copian a cada solicitud para conservarlas si luego cambia la cuenta.
5. Registrar tasas aprobadas en `fx_rates`: monedas origen/destino, tasa, comisión porcentual, rango de montos y vencimiento. No hay tasas ni cuentas ficticias precargadas. La base calcula la comisión y recepción; el cliente no puede sobrescribir esos valores.
6. Definir política de privacidad y retención aplicable antes de operar con personas reales. Los archivos son privados; acceso temporal firmado de 60 segundos. Limpiar mediante un procedimiento de administración los archivos huérfanos de cargas fallidas, conservando los usados por operaciones.

## Cambio sin registro

El cliente elige «Continuar sin cuenta». Supabase abre una sesión anónima privada sin pedir contraseña, registro ni confirmación de correo. Esta identidad técnica conserva el aislamiento RLS de cada operación y sus archivos; no hace público el acceso. La quinta migración incorpora `create_guest_transfer_details`, correo de contacto sin verificar y máximo 10 solicitudes por sesión en 24 horas. Conserva los límites de acceso anónimo del proveedor; comprueba su configuración antes de publicar.

El invitado introduce contacto, cuenta de destino y comprobante, y consulta sus operaciones en el mismo navegador. Se explica que borrar datos del navegador o cambiar de dispositivo puede perder ese acceso. No se promete recuperación por conocer una referencia. «Guardar acceso con una cuenta (opcional)» vincula un correo a la misma identidad, conservando sus operaciones, tras confirmar el correo. Luego puede ingresar desde otro dispositivo mediante enlace por correo, sin exigir contraseña. No se fusionan cuentas existentes automáticamente.

El correo escrito por un invitado no acredita identidad. Se muestra como contacto sin verificar; el worker productivo no envía documentos financieros a esa dirección hasta verificarla. El invitado puede consultar los documentos autorizados en su sesión privada. SUNAT beta conserva sus reglas: sin validez tributaria, sin correo automático ni finalización de la operación real.

## Operación manual

La revisión segura y su migración incremental están en [FIX_REVIEW_LOVABLE.md](FIX_REVIEW_LOVABLE.md). Después de confirmar ingreso, el formulario empieza vacío; cancelar exige una confirmación separada. El equipo puede restaurar una cancelación accidental posterior a la verificación mediante una acción auditada si no hay envío ni factura.

El dashboard `/dashboard` está reservado a cuentas del equipo. Muestra totales del historial con `staff_dashboard_summary`, filtros, paginación de 50 filas y enlaces a la operación exacta en `/transferencias`. Los importes de solicitudes se agrupan por moneda, sin representar saldos bancarios. Su sección «Puesta en marcha» refleja `MASTER_PLAN.json`: actualizar ese documento tras verificar cada hito, sin confundir desarrollo disponible con despliegue real.

Cliente: crea solicitud → paga a la cuenta indicada → sube PDF/JPG/PNG (máximo 5 MB). Subir evidencia no confirma ingreso.

La calculadora inicia el cambio dentro de la web conservando únicamente monedas y monto en la URL. El asistente guía cotización → contacto → cuenta receptora → revisión y pago. Se pueden corregir datos sin perderlos antes de confirmar; cada paso se valida. Si la ruta solicitada no tiene tasa vigente, no se sustituye silenciosamente por otra. El resumen muestra comisión, monto a recibir y datos de cuenta.

El formulario recoge contacto del remitente, documento y contacto del destinatario, titular y documento de la cuenta, banco, número de cuenta/CCI/PIX, agencia y observaciones. El RPC `create_validated_transfer` guarda los datos de cuenta y la elección de factura/boleta, correo y receptor del comprobante de forma atómica, sin permitir cambios de estado del cliente. Ver [BILLING_PREFERENCES_LOVABLE.md](BILLING_PREFERENCES_LOVABLE.md) para activación y límites del emisor. CCI se admite para PEN y PIX para BRL; la validación de formato no acredita propiedad de la cuenta ni consulta al banco.

El formulario también pide tipo/documento del remitente, banco y país de origen, país de recepción y relación con destinatario/titular cuando sean distintos. Las operaciones con Perú requieren origen de fondos y motivo del cambio; «Otro origen» requiere explicación. Esto incluye USD con cuentas en Perú. `submit_transfer_proof` exige el número de operación bancaria junto con la imagen/PDF. Los endpoints de creación antiguos y `submit_proof` dejan de estar disponibles al cliente para evitar omitir estas validaciones. Las operaciones anteriores se conservan. Ver [EXCHANGE_VALIDATIONS.md](EXCHANGE_VALIDATIONS.md).

Si ya se realizó el ingreso, el cliente puede adjuntar su foto o PDF al registrar la solicitud. Si no, registra los datos y obtiene las instrucciones antes de pagar. La subida y el enlace del archivo son operaciones posteriores a la creación: si Storage falla, la solicitud permanece en espera de pago y se muestra que hay que subir el comprobante a esa misma operación. No se declara pago confirmado por adjuntar un archivo. La vista previa local se descarta al salir y los documentos enviados permanecen en Storage privado.

El dashboard permite abrir los datos completos y la imagen/PDF en un diálogo, con enlaces firmados de 60 segundos renovados mientras se consultan. Los documentos no se publican. La tercera migración habilita eventos de `transfers` e `invoices` si existe la publicación Supabase Realtime; el equipo refresca la cola ante esos eventos y conserva el botón Actualizar como respaldo. Verificar Realtime y sus permisos en el proyecto real.

Equipo: entra a la misma página, abre «Bandeja del equipo», comprueba el ingreso real en banco y guarda una observación → confirma ingreso → ejecuta el envío fuera de esta plataforma → registra referencia y constancia bancaria. No hay ejecución bancaria automática ni lectura de saldos bancarios.

Registrar envío crea exactamente una solicitud fiscal en `invoices`. No se puede saltar la verificación ni repetir payout para crear otro comprobante. Si se cancela después de un ingreso, el reembolso debe gestionarse fuera del sistema y documentarse: no hay módulo de devolución automatizada.

## Facturación: SUNAT beta implementado; producción pendiente

El repositorio incluye un emisor **SUNAT beta directo**, reutilizado del proyecto local de facturación. La activación y sus secretos están en [SUNAT_BETA.md](SUNAT_BETA.md). Las pruebas son ficticias, no completan transferencias ni se envían por correo al cliente. La producción fiscal y Keyfacil siguen pendientes. Incluye una cola y una Edge Function preparada para una pasarela fiscal autorizada de producción. La API de emisión de Keyfacil no es pública: integrar su contrato real o un proveedor elegido antes de habilitar. No utilizar el calculador como criterio fiscal ni asignar IGV a todas las operaciones.

La pasarela debe configurar razón social/RUC, certificado y permisos fiscales, series, tipo de comprobante, receptor fiscal, concepto, base y tratamiento tributario. Debe cumplir idempotencia por `invoice_request_id`, almacenar el resultado fiscal y permitir conciliación. La ruta de transferencia por sí sola no define la entidad emisora ni los impuestos.

### Contrato interno del adaptador fiscal

`POST BILLING_GATEWAY_URL`, HTTPS, con `Authorization: Bearer BILLING_GATEWAY_TOKEN` y `Idempotency-Key: <invoice UUID>`.

Solicitud: `{ operation_id, invoice_request_id, document_type, billing, transfer }`. `document_type` es `01` para factura o `03` para boleta; `billing` contiene el receptor y correo elegido. El proveedor debe resolver el modelo fiscal aprobado, no emitir sobre el monto de la remesa por defecto.

Respuesta para aceptación: `{ authority: "SUNAT", document_type: "01" | "03", status: "accepted", cdr_code: "0", external_id, number, pdf_base64, xml_base64, cdr_base64 }`. PDF debe ser un archivo PDF; XML y CDR deben ser documentos auténticos del proveedor. Este contrato es propio del proyecto: **no es el endpoint ni el formato de SUNAT o Keyfacil**. Para respuestas pendientes/rechazadas o timeout el worker marca conciliación requerida; no reemite automáticamente.

### Despliegue y procesamiento

Configurar secretos de la función:

- `BILLING_WORKER_SECRET`: secreto aleatorio para autenticar el scheduler.
- `BILLING_GATEWAY_URL`, `BILLING_GATEWAY_TOKEN`: adaptador fiscal ya implementado.
- `BILLING_ALLOWED_ROUTES`: lista separada por comas de rutas aprobadas (por ejemplo PEN-BRL), solo después de validar la configuración fiscal. Vacío bloquea emisión.
- `RESEND_API_KEY`, `BILLING_FROM_EMAIL`: correo remitente verificado de Brasper. Alternativamente sustituir el adaptador de correo por el proveedor de la empresa.
- Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al entorno de Edge Functions.

Desplegar: `supabase functions deploy process-invoices --no-verify-jwt`. La función exige el secreto propio y POST; no se invoca desde el navegador. Programar un cron en la infraestructura/Supabase que haga POST a `/functions/v1/process-invoices` con el secreto, por ejemplo cada minuto. No hay cron desplegado por este cambio. No guardar secretos en SQL público ni en Git.

Cada ejecución toma una entrega pendiente o una emisión en cola. Sin configuración fiscal, deja el job en `blocked`. Tras configurarla, un administrador puede pasar jobs bloqueados a `queued` en SQL. **Nunca** reencolar `processing`, `sending` o `reconciliation_required` sin consultar primero al proveedor: puede existir un documento emitido o correo ya enviado. Un crash deja el job visible para conciliación.

Solo la aceptación fiscal permite guardar PDF/XML/CDR y avanzar a `accepted`. La entrega se procesa aparte; el envío de correo confirmado por el proveedor marca `completed`. Esto acredita aceptación del correo para envío, no lectura ni entrega en bandeja del cliente. Los eventos de rebote/entrega final requieren un webhook de correo adicional.

La entrega reclama un job de forma atómica y usa idempotencia de Resend; restringe reintentos a 23 horas desde el primer intento (sus claves duran 24h). Fuera de esa ventana se exige revisión. La función de facturación solo procesa SUNAT; Omie/Brasil requiere otro adaptador y configuración fiscal independiente.

## Verificación local

`npm install`, `npm run dev`, `npm run build`, `npm run test`, `npx tsc --noEmit`, `npm run lint`.

Las pruebas PostgreSQL (PGlite) ejecutan la migración con tablas auxiliares de Auth/Storage y verifican RLS, manipulación de estados, cálculo de importes, vencimiento y prevención de doble payout. No sustituyen la prueba con Supabase real, Storage real, proveedor fiscal y correo. Antes de activar, validar una operación por ruta en homologación con su documento auténtico.

Referencias oficiales: [Storage/RLS Supabase](https://supabase.com/docs/guides/storage/security/access-control), [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email), [integración externa Keyfacil](https://keyfacil.com/).

Referencia para acceso sin registro y conversión opcional: [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous).
