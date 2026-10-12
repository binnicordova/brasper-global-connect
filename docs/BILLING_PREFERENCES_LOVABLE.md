> Actualización: para el despliegue actual usar `docs/BIG_UPDATE.md`. La migración 010 genera PDF demo de boletas en beta; las instrucciones históricas de bloqueo de boletas de este documento ya no aplican.

# Factura o boleta en el flujo web

El paso «Tus datos de contacto» solicita un correo obligatorio a invitados y usuarios con cuenta y permite elegir factura o boleta. Factura recoge RUC de 11 dígitos y razón social; boleta usa el nombre/documento del cliente y permite indicar su tipo. Son validaciones de formato, no una consulta de identidad o de estado del RUC.

El resumen previo al pago, el historial, la revisión y el dashboard conservan tipo, correo y receptor fiscal. El receptor del comprobante es independiente del destinatario del dinero y del titular de su cuenta.

## Activar en Lovable

Prompt listo para usar:

> Sincroniza `main` de `jordyalania/brasper-global-connect`. Aplica una sola vez `supabase/migrations/202610100007_billing_preferences.sql` y después `supabase/migrations/202610100008_exchange_validation.sql`, después de las seis migraciones anteriores; no repitas migraciones ni borres datos. Publica el frontend y redespliega `supabase/functions/process-invoices/index.ts` conservando sus secretos y autenticación propios. El formulario debe utilizar `create_validated_transfer` para invitados y cuentas confirmadas. Este RPC guarda la operación y el tipo/correo/datos de comprobante de forma atómica, respetando las tasas y la validación de cuenta receptora existentes. Configura `deposit_accounts.country` (PE o BR), revisa manualmente las cuentas USD antes de activarlas y lee `docs/EXCHANGE_VALIDATIONS.md`. Pide origen de fondos y motivo del cambio para toda operación con Perú, incluso USD, banco de origen, tipo/documento del remitente, teléfono internacional y relación si el destinatario o titular es distinto. Usa `submit_transfer_proof` con número de operación bancaria para la foto/PDF. Prueba factura con RUC y razón social, boleta con documento personal, compra y venta, resumen, foto de ingreso, dashboard, aprobación manual y envío manual con constancia. No uses una actualización directa del cliente para guardar facturación ni permitas que el cliente apruebe su ingreso. No emitas una factura para una solicitud de boleta. El motor SUNAT beta actual solo emite facturas ficticias: boletas beta deben quedar bloqueadas con explicación para el equipo. Para producción, el adaptador debe recibir y devolver el código de documento elegido, y manejar su emisión fiscal real. Mantén privados los documentos y no cambies claves, certificados o emisor productivo por valores de prueba.

Alternativa para un backend Supabase administrado directamente: `supabase db push` y `supabase functions deploy process-invoices --no-verify-jwt`, sobre el proyecto de Brasper ya enlazado. La copia incremental para el migrador Drizzle es `0002_billing_preferences.sql` y `0003_exchange_validation.sql`; usa un solo migrador contra la misma BD.

## Datos y emisión

- Transferencia: `billing_type`, `billing_email`, `billing_email_verified`, `billing_name`, `billing_document`, `billing_document_type`.
- Facturación: `invoices.document_type`, `01` para factura y `03` para boleta. Se fija al crear la solicitud fiscal después del payout; no se crea un documento al rellenar el formulario.
- Las funciones anteriores se conservan como helpers internos, pero la migración 008 revoca su acceso al cliente para que no se salte las nuevas validaciones. Las operaciones existentes retienen factura y el correo previo; no se reemiten documentos.
- El correo elegido se guarda por separado del correo de acceso. Confirmar una cuenta no sobrescribe esa dirección. Si coincide con el correo confirmado de la cuenta, queda verificado; invitados o direcciones distintas permanecen sin verificar. El envío automático de documentos requiere verificar esa dirección. El invitado mantiene acceso privado a su operación sin crear cuenta; vincular su mismo correo para conservar el acceso sigue siendo opcional. No se añadió un servicio independiente de verificación de direcciones alternativas.
- En beta, una boleta pasa a `blocked` sin consumir numeración F902 ni contactar al gateway de facturas. Su emisor de boletas sigue pendiente de configuración; este cambio no implementa envío de resúmenes de boletas a SUNAT.

## Contrato del adaptador productivo

Solicitud adicional al contrato existente:

```json
{
  "operation_id": "UUID",
  "invoice_request_id": "UUID",
  "document_type": "03",
  "billing": {
    "type": "boleta",
    "email": "cliente@example.test",
    "name": "Cliente de ejemplo",
    "document": "12345678",
    "document_type": "1"
  },
  "transfer": "objeto de transferencia con los datos guardados"
}
```

La respuesta aceptada debe incluir `document_type` con el mismo código, además de autoridad SUNAT, estado, CDR y documentos auténticos del contrato existente. Un tipo distinto o ausente requiere conciliación y no se entrega al cliente. El adaptador determina el concepto, base y tratamiento fiscal configurado para Brasper: no usa automáticamente el total del cambio como importe facturable.

Referencias oficiales: [factura en el SEE SOL](https://cpe.sunat.gob.pe/sistema_emision/see_sol), [guía UBL 2.1 de boleta](https://cpe.sunat.gob.pe/sites/default/files/inline-files/guia%2Bxml%2Bboleta%2Bversion%202-1%2B1%2B0_0_0%20%282%29.pdf).

## Verificación

Las pruebas locales cubren el formulario, correo obligatorio, razón social/RUC, datos conservados al volver, creación atómica, invitados, ruta BRL→PEN, RLS, verificación de correo, tipo de documento en la cola, bloqueo de boleta beta, rechazo de respuesta con tipo distinto y destinatario correcto del correo. No acreditan una migración aplicada ni una emisión real en el backend de Lovable.
