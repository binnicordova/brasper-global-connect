# Probar WhatsApp Flows reutilizando Brasper

## Qué se entrega

`public/whatsapp-flows/demo-static.json` es un borrador de tres pantallas para importar en el editor de Flows de Meta. Permite elegir atención, escenario sintético e importe de ejemplo, factura/boleta y revisar el resumen. Al finalizar devuelve un payload de demostración. No registra una transferencia, asigna un asesor, emite un comprobante ni envía correo.

Es estático: la primera prueba no requiere backend, claves, criptografía ni acceso al banco. Solo contiene opciones y datos ficticios, sin formularios para cuentas o documentos de identidad. Usa Flow JSON 7.3 como versión declarada de este borrador, no como afirmación sobre la última versión disponible. La validación definitiva de componentes y versión debe hacerse en el editor de Meta.

## Primera prueba en Meta

1. Entrar en WhatsApp Manager con la cuenta empresarial de pruebas; abrir herramientas de cuenta / Flows o el [editor de Flows](https://business.facebook.com/wa/manage/flows).
2. Crear un Flow de prueba y mantenerlo en borrador. Abrir su editor JSON y pegar el contenido del archivo.
3. Revisar los errores de validación del editor antes de continuar. Las etiquetas del panel pueden variar según la cuenta. No se ha importado ni validado este borrador en tu cuenta Meta desde esta sesión.
4. Abrir la vista previa. Elegir una modalidad de atención, un escenario de ejemplo, el importe y factura/boleta. Revisar el resumen, volver atrás y cambiar las opciones.
5. Finalizar y comprobar el payload en las herramientas disponibles. Este archivo no configura el webhook que lo recibiría en nuestro backend.
6. Para probar en un teléfono, usar la función de prueba disponible en la cuenta o Cloud API con el `FLOW_ID`, número de pruebas y destinatario autorizado. Un Flow sin publicar debe enviarse explícitamente en modo `draft`; revisar la versión Graph y el formato actual en la documentación de la cuenta. No publicar ni enviarlo a clientes reales para esta prueba.

Este borrador no necesita Lovable para mostrar sus pantallas. Tras publicar los archivos de este repositorio, Lovable podrá servir el JSON como descarga en `/whatsapp-flows/demo-static.json`. Servir el archivo en esa URL **no lo registra en Meta ni convierte la web en un Flow**.

## Reutilización de lo que ya existe

| Parte actual                             | Reutilización                         | Adaptación necesaria                                                                                                            |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Pasos de `src/routes/transferencias.tsx` | Mismo orden funcional                 | Crear pantallas nativas con Flow JSON                                                                                           |
| React, JSX, CSS y componentes Radix      | Se mantienen en web                   | No se ejecutan dentro del Flow                                                                                                  |
| `quoteAmounts` en `src/lib/transfers.ts` | Lógica pura reutilizable              | Invocarla en backend con tasa vigente, nunca considerar autoritativo el valor enviado por el cliente                            |
| `recipientDetailsInput`                  | Reglas de formato y campos del modelo | Separarlas en un módulo compartido con imports compatibles con el runtime de Edge Functions; revalidar siempre en servidor      |
| Validaciones de las funciones PostgreSQL | Mismas reglas de negocio              | Adaptador autenticado que conserve identidad y permisos                                                                         |
| `create_validated_transfer`              | Creación de la misma operación        | No llamar con un service role esperando que `auth.uid()` represente al cliente; definir identidad, sesión y acceso del canal    |
| `submit_transfer_proof` y Storage        | Evidencia ligada a la operación       | Autorización de carga y propiedad; datos sensibles por web privada                                                              |
| `review_transfer`, dashboard y auditoría | Misma revisión interna                | No conceder al Flow ni a la IA permisos de aprobar o pagar                                                                      |
| Cola `process-invoices`                  | Mismo comprobante posterior al envío  | Mantener configuración fiscal, verificación de correo e idempotencia existentes                                                 |
| Demo `localStorage`/IndexedDB            | Sigue siendo útil para probar la web  | Meta y Edge Functions no pueden leer esos datos del navegador; un ensayo integrado necesita almacenamiento sintético en backend |

La clave es compartir el **modelo, reglas y backend**, con dos interfaces: web y pantallas WhatsApp. No existe una conversión automática de nuestro formulario React a Flow JSON.

Si ya tienes Flows reales en Meta, exporta su JSON para revisar pantallas, versiones y referencias. Los mockups anteriores de Brasper son imágenes y una simulación web, no Flows registrados que se puedan importar directamente. Para cambiar un Flow publicado, seguir el procedimiento de clonación/versionado disponible en Meta; no asumir que puede editarse como un borrador.

## Qué puede alojar Lovable

| Superficie                          | Dónde se ejecuta o guarda                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Pantallas nativas del Flow          | WhatsApp, a partir del Flow registrado en Meta                                     |
| Copia del JSON y documentación      | Archivos del repositorio; el JSON público puede descargarse desde la web publicada |
| Web de registro, resumen y cargas   | Frontend de Lovable existente                                                      |
| Endpoint dinámico de Flows          | Edge Function en el backend Cloud de Lovable o Supabase conectado                  |
| Webhook de mensajes/finalización    | Otra Edge Function, con validación propia de Meta                                  |
| Transferencias, archivos y revisión | Base de datos, Storage y dashboard existentes                                      |
| Tokens y clave privada del endpoint | Secrets del backend, nunca variables `VITE_*` ni archivos públicos                 |

**Sí es técnicamente factible alojar el puente en Lovable.** La documentación oficial confirma Edge Functions, Secrets y backend integrado. No se ha confirmado qué backend está activado ni qué funciones están desplegadas en tu proyecto concreto. Si el proyecto usa Supabase externo, las funciones y secretos se administran allí; no crear otra base separada.

Un endpoint de Flows dinámico no es una URL que devuelve HTML. Recibe datos cifrados, los valida y responde con la siguiente pantalla y sus datos usando el protocolo de Meta. La clave pública se configura con Meta y la privada permanece en Secrets. El ejemplo oficial usa RSA-OAEP/SHA-256 y AES-GCM para intercambio cifrado. Deben comprobarse compatibilidad de la biblioteca/runtime, protocolo y requisitos de autenticación al desplegar.

Meta no manda el JWT de Supabase de nuestro cliente. Por eso no basta con dejar protegida la función únicamente por ese JWT, ni con hacerla pública sin controles: endpoint y webhook requieren verificación de origen, firma cuando corresponda, token de sesión validado y autorización propia. El webhook de mensajes y el endpoint cifrado de datos cumplen tareas distintas.

## Segundo ensayo: reutilización real del backend

Una vez que funcione la vista previa estática, añadir un entorno sintético separado en el mismo backend. El Flow consultaría escenarios y recibiría un enlace temporal para completar los pasos web. Usar datos ficticios de extremo a extremo. El formulario reutiliza reglas y funciones existentes mediante un adaptador, y el dashboard muestra esas operaciones demo. Los modos IA/humano mantienen un estado conversacional separado del financiero.

Ese ensayo necesita `flow_sessions`, asociación de identidad de canal, enlaces temporales, recepción de finalizaciones y una cola de notificaciones. No se han creado estas tablas ni desplegado funciones en esta entrega. No usar un número público de operación como token de acceso.

## Prompt para Lovable

> Revisa el proyecto Brasper ya conectado a este repositorio. Quiero un ensayo de WhatsApp Flows con datos sintéticos, sin publicar el canal para clientes ni activar bancos, SUNAT o correos reales. Empieza por el archivo `public/whatsapp-flows/demo-static.json` y esta guía. Confirma si el proyecto utiliza Lovable Cloud o Supabase externo y usa el backend existente, sin crear una segunda base. Mantén el registro web, permisos y revisión manual actuales. Separa la validación pura y el cálculo de `src/lib/transfers.ts` en módulos compartidos compatibles con web y Edge Functions, conservando las pruebas. Diseña una Edge Function para el endpoint cifrado de Flows y otra para el webhook de finalización/mensajes con validación propia de Meta; no expongas secretos en frontend ni implementes un endpoint sin controles de origen y sesión. Añade sesiones demo y enlaces privados con caducidad para reutilizar la web de registro. Las solicitudes del canal deben conservar identidad y autorización al usar `create_validated_transfer` y `submit_transfer_proof`; no usar service role para saltar RLS ni asumir que su `auth.uid()` corresponde al cliente. Mantén separados los datos sintéticos y las operaciones reales. El equipo sigue confirmando ingreso y registrando envío; Flow/IA no pueden aprobar, cancelar ni pagar. El resultado demo debe generar PDF ficticio y correo simulado como el flujo actual. Para pruebas cifradas, solicita tokens, clave privada y configuración mediante Secrets; no reemplaces credenciales fiscales existentes. Entrega URLs de funciones, pasos para registrar la clave pública y probar un Flow draft, y resultados de pruebas de aislamiento y repetición de eventos. No publiques el caso de cambio en WhatsApp hasta resolver su elegibilidad con Meta.

El prompt solicita implementar la segunda fase. El JSON que acompaña esta entrega prueba únicamente pantallas y navegación.

## Restricción del canal

La elegibilidad del servicio de cambio sigue pendiente: la política de Meta restringe facilitar intercambio de moneda e identificadores sensibles. Una prueba privada con opciones sintéticas no acredita autorización para activar el mismo flujo con clientes. Trasladar datos a la web no evita la restricción sobre el servicio.

## Fuentes oficiales consultadas

- [Lovable Cloud](https://docs.lovable.dev/features/cloud).
- [Edge Functions de Lovable](https://docs.lovable.dev/features/edge-functions).
- [Secrets y diferencia con variables VITE](https://docs.lovable.dev/features/secrets).
- [Herramientas y ejemplos oficiales de Flows](https://github.com/WhatsApp/WhatsApp-Flows-Tools).
- [Formulario de conexión con asesor, ejemplo oficial](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/articles/llama-chatbot-flows/agent-connect.json).
- [Cifrado del endpoint, ejemplo oficial](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/nodejs/basic/src/encryption.js).
- [Configuración del endpoint de citas](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/nodejs/book-appointment/README.md).
- [Política de WhatsApp Business](https://whatsappbusiness.com/policy/).

Consulta: 12 de octubre de 2026. Se revisó el código local y documentación oficial. La referencia técnica completa de Flow JSON devolvió HTTP 429; el JSON entregado necesita validación final en el editor de Meta. No se inspeccionó ni modificó el proyecto Lovable o la cuenta Meta en esta sesión.
