# Brasper Proceso Beta en Meta

Configuración creada el 12 de octubre de 2026 mediante BrowserOS neo, en el portfolio **Jbdevs Studio** elegido por el usuario.

| Recurso                             | Valor                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| App                                 | Brasper Flows Beta                                     |
| App ID                              | `2190725181540988`                                     |
| Portfolio ID                        | `2089147141630010`                                     |
| Cuenta de prueba                    | Test WhatsApp Business Account                         |
| Identificador de cuenta de mensajes | `1742357390150422`                                     |
| Número de prueba de Meta            | `+1 555 196 8909`                                      |
| Phone Number ID                     | `1287260894478658`                                     |
| Flow                                | Brasper Proceso Beta                                   |
| Flow ID                             | `1746368663111217`                                     |
| Estado                              | Borrador / DRAFT                                       |
| Flow JSON                           | `public/whatsapp-flows/process-beta.json`, versión 7.3 |

No se generó ni guardó un token de acceso de Graph API. No se configuraron pagos, un número productivo, webhooks, un endpoint de datos, SUNAT ni correo. Los IDs son identificadores de recursos, no credenciales.

- [App creada](https://developers.facebook.com/apps/2190725181540988/dashboard/?business_id=2089147141630010).
- [Editar Flow](https://business.facebook.com/latest/whatsapp_manager/flow_edit/?business_id=2089147141630010&tab=flow-edit&id=1746368663111217&nav_ref=whatsapp_manager&asset_id=1742357390150422).
- [Configuración de pruebas de WhatsApp](https://developers.facebook.com/apps/2190725181540988/use_cases/customize/api-testing-v2/?use_case_enum=WHATSAPP_BUSINESS_MESSAGING&selected_tab=api-testing-v2&product_route=whatsapp-business&business_id=2089147141630010).

## Qué contiene el Flow

1. **START:** elección IA o asesor, como modalidad de demostración. No inicia una IA ni asigna una persona.
2. **REQUEST:** ruta e importe sintéticos y factura/boleta ficticia. No calcula una cotización vinculante.
3. **CONTACT:** nombre y correo de prueba, origen y motivo de fondos.
4. **DESTINATION:** destinatario y cuenta ficticios. No pide identificadores de personas ni números reales de cuenta.
5. **REVIEW:** resumen con los datos conservados entre pantallas.
6. **PROOF:** DocumentPicker nativo, un archivo de hasta 5 MB, y finalización. En la vista previa la carga es opcional.

Los formularios incluyen valores ficticios precargados para poder recorrerlos rápidamente. Se pueden editar, pero se deben usar únicamente datos de ejemplo. En la operación real seguirían las validaciones existentes y la recopilación privada autorizada de datos del receptor fiscal y bancario.

Meta ejecutó y guardó el JSON con **0 errores** en su editor. En la vista previa interactiva se verificó la secuencia `START → REQUEST → CONTACT → DESTINATION → REVIEW → PROOF → complete`, conservando `Cliente Demo`, `demo@example.test`, `300`, `PEN_BRL` y `boleta`. Esto verifica la interfaz y su finalización, no una operación registrada en la base de Brasper.

## Documentos: lo comprobado y lo pendiente

El selector se representa como componente nativo. Al pulsarlo, el emulador web generó un archivo de muestra ZIP, sin usar el PDF local. La revisión automática rechazó finalizar con ese archivo porque no se había verificado su contenido. Se retiró el archivo generado y se completó la prueba sin adjuntos. No se descargó ni procesó ese ZIP.

La versión demo permite finalizar sin archivo para probar las respuestas y navegación. **La carga del PDF sintético en WhatsApp móvil, su recepción por webhook y su almacenamiento privado todavía no se han probado.** Esta configuración opcional del borrador no cambia la exigencia de evidencia del flujo financiero web.

Para una prueba móvil usar `public/demo/comprobante-ejemplo.pdf`. Validar tamaño, tipo y recepción en el backend antes de atribuir la carga a una operación. El widget de esta beta no limita los archivos a PDF: esa restricción y la validación del servidor deberán configurarse cuando se conecte el canal.

## Vista previa interactiva e iframe en Lovable

`public/whatsapp-flows/preview-beta.html` contiene una página con marca Brasper y dos pestañas. La principal reutiliza el formulario web en `/transferencias?demo=1&embed=1`, con cuatro pasos y una guía contextual. La segunda muestra la vista previa nativa de Meta. Cambiar de pestaña conserva el formulario. La guía actual usa respuestas predefinidas; no llama a un modelo de IA ni asigna un asesor real. Después de sincronizar y publicar Lovable, estará disponible en:

`/whatsapp-flows/preview-beta.html`

El enlace de vista previa es público, permite ver la demo y no es un token de Graph API ni de acceso a la BD. Meta indica que caduca a los 30 días o si se invalida. No incluir datos personales en este Flow público. Si caduca, generar otra URL desde «Compartir» en Meta y actualizar el `data-src` del iframe `native-frame`.

La vista previa usa `interactive=true`, `flow_action=navigate` y `flow_action_payload` con `{ "screen": "START", "data": {} }` codificado en la URL. Añadir `debug=true` muestra el registro de acciones. No iniciar directamente una pantalla intermedia: el emulador rechazó `PROOF` como pantalla inicial porque tiene conexiones entrantes.

El iframe **nativo de Meta** sirve para mostrar y probar el diseño en la web de Lovable. **No enlaza la finalización con nuestra BD ni sustituye el envío del Flow dentro de una conversación de WhatsApp.** No acredita recepción bancaria, transferencia, emisión SUNAT ni entrega de correo.

## Para probar en un teléfono

En la app creada, abrir «Paso 1. Pruébalo», añadir el teléfono propio como destinatario de pruebas y completar la verificación que solicite Meta. Después configurar el token de pruebas en un secreto del backend y enviar el Flow al destinatario autorizado en modo `draft`. No publicar el Flow para esa prueba.

El teléfono destinatario no se eligió ni se verificó en esta sesión, y no se envió ningún mensaje. El formato API y la versión deben tomarse de la documentación vigente de la cuenta (la pantalla actual de Meta mostró Graph API v25.0). El JSON estático se envía con acción `navigate` e inicio `START`; no utilizar `data_exchange` mientras no exista un endpoint.

El próximo desarrollo es el puente de Lovable/Supabase descrito en `PRUEBA_Y_REUSO_LOVABLE.md`: sesión de canal, webhook autenticado, evidencia privada, creación autorizada y notificaciones. El equipo continúa confirmando ingreso y registrando envío; la facturación sigue después del envío. El modo IA/humano y la operación financiera tienen estados independientes.

## Fuentes y límites

- [Documentación oficial de la API de Flows y vista previa](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowsapi#preview): explica parámetros interactivos, iframe y caducidad de la URL.
- Recursos y estado verificados directamente en el editor y panel de Meta mediante BrowserOS neo.

Esta entrega crea una app y un Flow de demostración. No activa una operación de cambio real ni un agente de IA conectado.

## Estado de la entrega y actualización manual

La pestaña web registra operaciones sintéticas en el almacenamiento local de este navegador y permite revisarlas en el dashboard demo. La guía recibe solamente el paso y la señal de creación mediante mensajes del iframe; valida el origen y la ventana emisora. No recibe los documentos ni los datos bancarios. El formulario conserva sus validaciones existentes.

Por decisión del usuario, no se aplican migraciones, no se despliegan funciones y no se usa el editor de Lovable durante esta entrega. La sincronización de Git puede publicar el frontend; no demuestra que la BD, SUNAT, correo o WhatsApp estén conectados. La activación del agente queda descrita en `AGENTE_IA_ACTIVACION.md` para una actualización manual posterior.
