# Chat híbrido Brasper — beta local

## Abrir

Servidor de desarrollo: `npm run dev -- --host 127.0.0.1 --port 8692`.

- Chat: http://127.0.0.1:8692/whatsapp-flows/preview-beta.html
- Guardar clave propia con entrada oculta: http://127.0.0.1:8692/whatsapp-flows/local-key.html

La clave se guarda en `.env.local`, ignorado por Git y con permisos 0600. No se devuelve al navegador. El modelo predeterminado es `gpt-4.1-mini`; puede configurarse `OPENAI_MODEL` en el mismo archivo. No se necesita reiniciar para leer una clave guardada por este menú.

## Funciona ahora

- Preguntas abiertas con OpenAI Responses API desde el servidor; `store:false`.
- Memoria limitada: últimas 16 intervenciones por sesión, en RAM, con cookie HttpOnly y SameSite Strict. Caduca a los 30 minutos y se pierde al reiniciar el servidor.
- Respuestas frecuentes sin consumir IA: datos requeridos, comprobantes, cotización, horario, cuenta y seguimiento.
- “Empezar mi cambio” abre el formulario web en su paso actual, sin saltar validaciones.
- Contexto de paso/canal y registro local informado desde el iframe. Los archivos y campos del formulario no se envían al modelo.
- “Prefiero hablar con una persona” pausa la IA en servidor; permite copiar el resumen. No asigna un asesor ni envía el resumen a nadie. Reanudación explícita.
- Conversación nueva borra la memoria del chat, sin borrar el formulario.
- Errores de clave, cuota, proveedor y timeout muestran mensajes claros. El formulario sigue operativo.
- Respuestas renderizadas como texto; no se ejecuta HTML devuelto por la IA.

## Parte determinista

El formulario existente mantiene cotización PEN/BRL, remitente, declaración de fondos, destinatario, cuenta, elección fiscal, resumen, adjunto y referencia. Sus reglas de cliente/servidor siguen siendo autoridad. El chat no crea ni aprueba operaciones, no cancela, no paga ni emite; no dispone de herramientas financieras. La confirmación bancaria y salida permanecen en el dashboard humano. El recorrido `?demo=1` continúa guardando datos sintéticos en el navegador.

## Límites locales

Las rutas se bloquean en producción y para URLs ajenas a loopback. Mantener el servidor enlazado a 127.0.0.1, no publicarlo mediante túnel. POST exige Origin del mismo servidor. Entrada limitada, 20 solicitudes/minuto/sesión; llamadas a IA limitadas a 10/minuto, 100/día y 2 simultáneas por proceso. El presupuesto se reinicia al reiniciar el proceso: no es control de gasto productivo. Timeout 25s. Preguntas y conversación del chat se envían al proveedor cuando se utiliza IA; usar datos de prueba, no secretos.

## WhatsApp / Flows

La pestaña Flow conserva el borrador nativo y la página híbrida combina chat con formulario. Aún faltan webhook de Cloud API, envío al teléfono, recepción de finalización/archivos, sesiones de canal persistentes y asignación de asesor. No llamar a esta beta un chatbot ya instalado en WhatsApp. El endpoint actual es exclusivo para pruebas locales, no es una Edge Function productiva.

## Verificación

`npx vitest run src/lib/assistant/chat.server.test.ts` verifica aislamiento de origen, entradas, historial en servidor, pausa/reanudación, rechazo de acciones financieras, respuestas deterministas y errores sin filtración. Se probó una respuesta real de OpenAI desde la interfaz local y la transición al formulario.

Referencia de implementación: https://developers.openai.com/api/docs/guides/text
