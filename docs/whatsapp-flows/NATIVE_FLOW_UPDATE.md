# WhatsApp nativo con marca Brasper — actualización única

## 1. Lovable: aplicar y desplegar

Aplica `supabase/migrations/202610130015_whatsapp_native_flow.sql` después de la migración 014 ya instalada.

Despliega `whatsapp-flow` y vuelve a desplegar `whatsapp-webhook`, incluyendo las dependencias de `_shared`:

- `transfer-input.ts` (las validaciones/cálculo compartidos también usados por la web).
- `whatsapp-flow-model.ts`, `whatsapp-flow-crypto.ts`.
- `whatsapp-cloud.ts`, `whatsapp-token.ts` existentes.

Conserva `whatsapp-flow/deno.json` (import de Zod) y `verify_jwt=false` de ambas funciones. La función valida firma Meta, descifra RSA/AES y verifica sesión firmada. No cambia el callback de mensajes: sigue siendo `whatsapp-webhook`.

## 2. Secrets

Conserva las claves actuales; renueva `WHATSAPP_ACCESS_TOKEN` si ha vencido, tanto en local como en Lovable.

Añade `WHATSAPP_FLOW_PRIVATE_KEY`: contenido íntegro del archivo LOCAL e ignorado `artifacts/whatsapp-beta/native-flow-private.pem`. Se generó con `node scripts/setup-whatsapp-native-key.mjs`; ya quedó guardado en `.env.local`. Nunca subir ese PEM privado a Git ni al editor JSON de Meta. La clave pública está en `public/whatsapp-flows/brand/flow-public-key.pem`.

Configura:

- `WHATSAPP_FLOW_ID`: ID del Flow de prueba existente, `1746368663111217`.
- `WHATSAPP_FLOW_STATUS=draft`.
- `WHATSAPP_WEB_URL=https://brasper.jordybryan.com`.
- Mantén `WHATSAPP_FLOW_MODE=web` durante el despliegue.

El runtime necesita `SUPABASE_ANON_KEY` o `SUPABASE_PUBLISHABLE_KEY` del mismo backend, además de los Secrets/runtime de Supabase y WhatsApp existentes. La función crea una sesión anónima real, conserva sus tokens cifrados en una tabla privada y llama las RPC financieras con el JWT de ese cliente. No usa service role para crear/aprobar/pagar la transferencia.

## 3. Meta: registrar el borrador

Después de desplegar, con token de acceso local vigente:

```sh
node scripts/configure-whatsapp-native.mjs
```

El comando comprueba el endpoint cifrado, carga `public/whatsapp-flows/brasper-native.json`, configura el endpoint `https://lfjnywpvunfrvkgcfobl.supabase.co/functions/v1/whatsapp-flow` y registra la clave pública del número. Se detiene si el Flow ya está publicado o si hay errores. No publica el Flow.

Comprueba la validación de Meta y la configuración de endpoint/clave. Luego cambia en Lovable `WHATSAPP_FLOW_MODE=native` y prueba `hola → empezar cambio` desde el teléfono autorizado. `abrir web` conserva la ruta web alternativa.

La clave pública es por número, no por Flow. Este archivo debe corresponder a la clave privada guardada en Lovable; regenerarlo sin actualizar ambos rompe el cifrado.

## Prompt corto para Lovable

> Aplica la migración `202610130015_whatsapp_native_flow.sql` y despliega `whatsapp-flow` y el webhook actualizado con todos sus imports de `_shared` y su `deno.json`. Usa el mismo backend, Storage privado y validaciones existentes; conserva firma Meta, cifrado, sesión firmada e identidad anónima real. Configura `WHATSAPP_FLOW_PRIVATE_KEY` mediante Secrets con la clave privada que entregaré por formulario seguro, nunca por Git; verifica que el runtime tenga la clave pública/anon de Supabase para crear sesiones anónimas. Conserva `WHATSAPP_FLOW_MODE=web` hasta registrar y validar el JSON de Meta. Después de la prueba, activa `native` con `WHATSAPP_FLOW_STATUS=draft` y el Flow ID indicado. No rediseñes la web ni cambies facturación. Prueba cuota vigente, reintento sin duplicado, comprobante privado y confirmación al chat. Devuelve el resultado real de cada prueba.

## Recorrido y límites

Vista previa visual: `/whatsapp-flows/native-design.html` (representación del diseño, sin registrar operaciones).

Siete pantallas: cotización → cliente → origen de fondos → destinatario → comprobante fiscal → revisión → pago/adjunto. Cabecera azul Brasper, progreso, textos breves y selección de foto o PDF. WhatsApp controla los estilos de campos/botones; no se ejecutan React ni CSS dentro del Flow.

La tasa y cuentas vienen de BD. Una tasa modificada exige recotizar; un adjunto requiere hashes, HMAC, descifrado, tipo y tamaño válidos. La operación queda en `proof_submitted`, nunca aprobada por la IA. El dashboard y la cola fiscal actuales continúan tras la revisión y el registro del envío por el equipo. La cuenta del canal conserva identidad privada, pero no inicia sesión automáticamente en la web ni vincula cuentas registradas existentes.

El código, pruebas y assets se entregan por Git. La validación final de componentes en Meta y la prueba completa en teléfono/backend desplegado deben confirmarse; el build local no las sustituye. La vista previa estática anterior y los archivos `process-beta.json`/`demo-static.json` son referencias antiguas, no el JSON que debe registrarse ahora.

Fuentes: [componentes de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components/), [endpoint cifrado](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint/), [archivo y validación multimedia](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/media_upload/).
