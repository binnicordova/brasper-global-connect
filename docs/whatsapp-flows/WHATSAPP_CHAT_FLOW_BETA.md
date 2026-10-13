# Beta real de canal: WhatsApp + IA + Flow

## Recorrido actual: misma web dentro del recorrido de WhatsApp

1. El usuario escribe “hola” al número de prueba de Meta.
2. El bot ofrece Empezar cambio, Hacer una pregunta y Hablar con persona.
3. Preguntas abiertas usan OpenAI; preguntas frecuentes conservan reglas deterministas.
4. “Empezar cambio” envía un botón URL al mismo formulario React de Brasper, en una página privada accesible desde el teléfono. Es una web abierta desde WhatsApp, no un iframe dentro de un Flow nativo.
5. El enlace tiene un token aleatorio, vinculado al teléfono, que caduca en dos horas. La página reutiliza cotización, datos, destino, revisión y comprobante de `transferencias.tsx`.
6. El servidor revalida datos, declaración, ruta y comprobante, calcula importes y guarda la solicitud/archivo privados en el almacén de la beta local. Reenvíos no crean otra operación.
7. El bot confirma recepción en WhatsApp y continúa conversando. No confirma ingreso bancario ni envío. El usuario regresa al chat con un botón.
8. Pedir una persona pausa IA y conserva contexto. No hay asesor asignado automáticamente.

El Flow nativo anterior sigue disponible mediante el comando de prueba `native_flow`; conserva formularios sintéticos y validación de finalización. La ruta principal es ahora la misma web, según la preferencia del usuario.

## Activación concreta

Abrir http://127.0.0.1:8692/whatsapp-flows/whatsapp-setup.html.

- Copiar el token temporal de Cloud API del panel de pruebas de la app Brasper Flows Beta.
- Copiar el secreto de la app desde configuración básica. Ambos campos tienen entrada oculta; se guardan en `.env.local`, ignorado por Git.
- El número de prueba del usuario debe figurar como destinatario autorizado en Meta. Mantener el Phone Number ID y Flow ID precargados.
- La página muestra callback y token de verificación generado. En Meta, configurar ese callback y suscribir `messages`.
- Abrir http://127.0.0.1:8692/whatsapp-flows/whatsapp-inbox.html. Pulsar Enviar saludo de prueba una vez. Es el template de prueba `hello_world`; su aceptación por Meta no garantiza entrega. Responder “hola” desde el teléfono para abrir la ventana de conversación.
- Probar pregunta abierta → Empezar cambio → completar Flow → respuesta del bot → opción humana → reanudar.

El token de acceso y el secreto de app NO se pegan en el chat ni se incluyen en el repositorio. El token de verificación es otro valor; se muestra únicamente en la configuración local para copiarlo a Meta.

## Servidores y URL temporal

El servidor Vite existente corre en 127.0.0.1:8692. El proxy exclusivo se inicia con:

```sh
node scripts/whatsapp-webhook-proxy.mjs
```

Escucha en 127.0.0.1:8695 y permite el webhook firmado y, para enlaces privados válidos, únicamente el formulario, assets compilados y envío de solicitud. Dashboard, configuración, claves, módulos de desarrollo y otros endpoints están bloqueados. Un túnel HTTPS debe apuntar a este proxy, NUNCA al servidor Vite en 8692. La web móvil se renderiza desde el build compilado, sin exponer módulos fuente ni filesystem. El webhook verifica firma `x-hub-signature-256` con HMAC SHA256 sobre el cuerpo original antes de encolar cualquier mensaje.

En esta sesión se preparó un Quick Tunnel temporal con el cliente oficial de Cloudflare. La URL aparece en la configuración local. Solo existe mientras sigan abiertos el proxy y el túnel. Cuando cambie el hostname, actualizar `WHATSAPP_CALLBACK_URL` y el callback en Meta. No es un despliegue permanente ni una función en Lovable.

## Datos y límites

- Solo el destinatario configurado puede usar esta beta; otros remitentes se ignoran.
- Solo se aceptan eventos del Phone Number ID configurado. Se ignoran estados ajenos y mensajes fuera de ventana de 24h.
- Duplicados por ID se conservan en el almacén privado. Se procesa por cola; aceptación del webhook no significa envío de respuesta terminado.
- Los errores de Graph API se marcan como fallidos en la bandeja. No se reintenta a ciegas un envío incierto ni se guarda el error sensible del proveedor.
- Formulario actual: datos y cuentas sintéticos de la beta previamente validada por Meta; no es todavía el formulario financiero productivo.
- La solicitud de Flow se guarda privada en `artifacts/whatsapp-beta/state.json` (ignorado por Git, permisos 0600), no en la BD de transferencias. Pendiente de revisión no crea ni aprueba una transferencia. Se necesita integrar el adaptador autorizado a la BD en el big update.
- El DocumentPicker devuelve referencias del adjunto, registradas como conteo. Esta beta todavía NO descarga ni valida el documento del Flow. Fotos/documentos enviados como mensaje separado tampoco se descargan: el bot lo explica. No afirmar evidencia privada completa hasta implementar el almacenamiento de medios.
- Los archivos y datos del Flow no se envían al modelo. La conversación textual sí utiliza OpenAI. No hay herramientas financieras para la IA.
- Sesión conversacional IA en memoria del servidor; al reiniciar se pierde. Historial, solicitud y trabajos del canal se conservan en archivo local. Trabajos que quedaron en processing tras una caída requieren conciliación manual. Es una beta de un único proceso, sin cola distribuida ni recuperación productiva.
- Revisión bancaria, envío y facturación automática de la web se mantienen independientes. Este puente no mueve dinero ni emite por sí solo.

## Pruebas y estado

`npx vitest run src/lib/whatsapp/bridge.server.test.ts src/lib/assistant/chat.server.test.ts`

20 pruebas: firma, challenge, remitente, deduplicación, payload Flow draft, llamada a IA, pausa, nonce/campos y error. La IA local ya fue probada con una llamada real. El 13/10/2026 se validaron las credenciales, callback activo, campo messages y suscripción WABA. Meta aceptó el saludo, el usuario confirmó recepción y luego confirmó menú, respuestas de IA y seguimiento del flujo. La finalización completa web→archivo→confirmación no debe darse por probada solo por esa confirmación; se validó por pruebas automatizadas y revisión local.

Referencias primarias:

- https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/webhook/nodejs/flows-webhook
- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

## Actualización de pruebas

27 pruebas pasan: conversación, bridge y sesión web privada, caducidad, cálculo en servidor, archivos, ruta e idempotencia. TypeScript y compilación verificados. La app de Meta muestra un aviso sobre webhooks de apps sin publicar; sin embargo, esta cuenta de pruebas recibió mensajes tras completar `/{WABA-ID}/subscribed_apps`. No se publicó la app ni se habilitó el canal para clientes reales.

## Datos de la web

El comprobante de la web sí se guarda en `artifacts/whatsapp-beta/proofs`, privado, fuera de Git. El adaptador vincula el envío al chat y guarda todos los campos validados. Esto sigue siendo almacenamiento de beta local, no la BD financiera desplegada. La descarga de DocumentPicker del Flow nativo y de imágenes enviadas separadamente continúa pendiente.

## Corrección de disponibilidad — 13/10/2026

Se observó error 522 por pérdida de ruta IPv6 en QUIC. Se cambió el túnel de pruebas a `--protocol http2 --edge-ip-version 4` y se actualizó el callback activo de Meta. El bot comprueba `/healthz` sin enviar tokens privados antes de emitir el botón web. Si no está disponible, informa el problema en el chat. Solicitar de nuevo Empezar cambio conserva la sesión vigente y sin enviar, evitando invalidar enlaces previos. La URL sigue siendo temporal; para un despliegue permanente se requiere un host estable. Se mantiene temporalmente el origen previo permitido para formularios ya abiertos.
