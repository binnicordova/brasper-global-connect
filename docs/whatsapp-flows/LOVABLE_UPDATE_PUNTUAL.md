# WhatsApp + la web de Lovable: actualización puntual

El pull ya incluye los cambios de Lovable hasta `a93366d`. El túnel/local Node no es necesario para esta versión. No se ha desplegado esta integración desde Codex.

## 1. BD

Ejecutar una vez `supabase/migrations/202610130014_whatsapp_cloud.sql`, después de las migraciones financieras existentes. Añade canales privados, sesiones firmadas y deduplicación. La creación vinculada llama a `create_validated_transfer`, con identidad del cliente, sin saltar permisos ni validaciones. Los adjuntos siguen en el Storage privado existente.

## 2. Edge Functions

Subir/deploy:

- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-session/index.ts`
- Dependencias compartidas de ambas: `supabase/functions/_shared/whatsapp-cloud.ts` y `supabase/functions/_shared/whatsapp-token.ts`

En ambas: `verify_jwt=false`, como indica `supabase/config.toml`. El webhook verifica firma de Meta. La función de sesión verifica Origin, token firmado y JWT real del visitante (también usuario anónimo). No dejar de ejecutar esas validaciones.

## 3. Secrets del mismo backend

Configurar sin poner valores en Git:

- `OPENAI_API_KEY` (la clave autorizada; la local no se copia automáticamente a Lovable).
- `WHATSAPP_ACCESS_TOKEN`
- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID` = el ID ya configurado en la prueba.
- `WHATSAPP_SESSION_SECRET` = nuevo secreto aleatorio de al menos 32 caracteres.
- `WHATSAPP_WEB_URL` = `https://brasper-connect-flow.lovable.app` (o el dominio publicado actual).
- `WHATSAPP_TEST_RECIPIENT` = tu teléfono autorizado, sin +.
- `WHATSAPP_TEST_MODE` = `true`.
- Opcional: `OPENAI_MODEL=gpt-4.1-mini`, `WHATSAPP_GRAPH_VERSION=v25.0`.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son valores de runtime del backend, no claves públicas del navegador. No usar credenciales service role en frontend.

## 4. Meta

Cambiar callback a la URL pública exacta de la función desplegada `whatsapp-webhook`, usar el mismo verify token y conservar el campo `messages` y la suscripción de la WABA a la app. No cambiar el callback al dominio de Lovable `/api/...`: el callback debe ser la URL real de Edge Function.

## 5. Publicar frontend

Sincronizar los cambios de `src/routes/transferencias.tsx`, `src/lib/hosted-whatsapp.ts`, `src/lib/supabase.ts` y `src/routes/login.tsx`. Se conserva el cliente de producción corregido por Lovable.

El bot enviará `https://brasper-connect-flow.lovable.app/transferencias?wa=<token-firmado>`. Es la misma web, abierta desde WhatsApp. No usa iframe en Meta ni el túnel. El cliente abre su acceso privado de invitado si no está logueado, llena el formulario y adjunta. El enlace se vincula a esa identidad; otra sesión no puede tomarlo. La creación es idempotente y el dashboard financiero actual recibe la operación. Tras adjuntar la prueba, se solicita la confirmación al chat. Un fallo de notificación no vuelve a crear la transferencia.

## Prompt único y corto para Lovable

> Integra solo los archivos de WhatsApp de este repositorio. Aplica `supabase/migrations/202610130014_whatsapp_cloud.sql` y despliega `whatsapp-webhook` y `whatsapp-session`, incluyendo `_shared/whatsapp-cloud.ts` y `_shared/whatsapp-token.ts`, con `verify_jwt=false` y conservando las verificaciones internas de firma, JWT, Origin y sesión. Usa la misma BD/Storage actuales. Configura los Secrets listados en esta guía mediante el formulario seguro; no inventes claves ni pongas service role en el navegador. Mantén `WHATSAPP_TEST_MODE=true` y el destinatario autorizado. Sincroniza/publica el frontend actualizado; no rediseñes la web ni cambies la facturación. Devuelve la URL exacta del webhook y los pasos mínimos para sustituir el callback en Meta. Prueba invitado, creación sin duplicados, adjunto privado y confirmación en WhatsApp. No declares activado lo que no se haya desplegado o probado.

## Estado y límites

El código y SQL fueron preparados localmente. Despliegue, Secrets, callback de Edge y prueba completa en Lovable siguen pendientes. El mensaje aceptado por Meta no acredita entrega leída. Los fallos inciertos quedan para revisión, no para reenvío ciego. La IA no aprueba ni paga. Los mensajes dirigidos a atención humana quedan con IA pausada; la asignación/CRM aún es una fase posterior. Los eventos fallidos se conservan privados, pero no hay un worker distribuido de recuperación automática en esta entrega.
