# Recorrido visual en el editor de Meta

Flow visual: `1423467889980844`, nombre **Brasper - Recorrido visual IA y Flow**.

[Editor de la vista previa](https://business.facebook.com/latest/whatsapp_manager/flow_edit/?business_id=2089147141630010&tab=flow-edit&id=1423467889980844&nav_ref=whatsapp_manager&asset_id=1742357390150422)

Fuente: `public/whatsapp-flows/brasper-native-preview.json`. Guardado como borrador, sin publicar. Meta valida el JSON con cero errores. Se comprobó en el editor: monto 300, botón «Ver mi cotización», navegación a «Tus datos».

Para probarlo: Configuración de Vista previa → Modo interactivo → Primera pantalla QUOTE → OK. Completa los campos obligatorios y avanza. Este recorrido usa navegación nativa entre pantallas, datos de ejemplo y un cierre explícito de vista previa. No consulta cotizaciones reales, no recibe archivos bancarios ni registra transferencias.

El Flow operativo sigue siendo `1746368663111217`, con `data_exchange` y endpoint cifrado. El editor de Meta propone un token `flows-builder-…` que no representa una sesión del cliente: el servidor sólo acepta tokens firmados del bot vinculados a una sesión nativa vigente. No se debe desactivar esta validación para hacer avanzar una vista previa.

Los bloqueos 139000 del envío al teléfono son independientes del recorrido visual. El token local de Graph expiró durante la preparación; renovar únicamente `WHATSAPP_ACCESS_TOKEN` mediante el configurador local y, cuando corresponda, el Secret de Lovable. No confundirlo con la clave privada ni el token de verificación.

## Configuración interactiva del Flow operativo

Usa el endpoint `https://lfjnywpvunfrvkgcfobl.supabase.co/functions/v1/whatsapp-flow`, el número de prueba que tiene la clave pública registrada y **Solicitar datos** para inicializar la pantalla mediante `INIT`. El **Token del Flow** es un token de sesión firmado por el servidor para un cliente, no `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` ni la clave RSA privada. El valor `flows-builder-…` de Meta no representa una sesión válida en nuestra BD.

**No hay datos** sólo abre la primera pantalla sin consultar el endpoint. Un Flow cuyos textos o listas dependen de datos dinámicos puede mostrar campos vacíos o errores de renderizado. Los valores de respaldo no reemplazan una cotización válida ni habilitan el registro. Para recorrer visualmente usa el borrador separado; para probar el backend necesitas una sesión nativa vigente del bot.

Corrección de TextBody: los ejemplos de todos los textos dinámicos ahora tienen valores no vacíos. El aviso visible ya no enlaza `TextBody.text` a `data.error_message`; ese campo se conserva para el mensaje del protocolo, vacío cuando no hay error. El texto del aviso es literal y su visibilidad depende de `has_error`. El servidor también explica cuándo el token de sesión no es válido. Redespliega `whatsapp-flow` con `_shared/whatsapp-flow-model.ts` actualizado para aplicar esta última parte.

Prueba directa en modo interactivo del editor: `INIT` devolvió HTTP 200 y pantalla `QUOTE`, con mensaje de sesión inválida para el token de ejemplo. Esto acredita la conexión cifrada, no un registro completo.

Prueba de la corrección de TextBody en Meta: después de guardar el JSON operativo, el modo interactivo volvió a mostrar `INIT / 200 / QUOTE`; ya no apareció el error de propiedad `text`. El aviso literal se renderizó y Meta mostró el mensaje de error del endpoint por separado. El token de ejemplo se rechazó y no se registró una operación.

Prompt mínimo para Lovable: «Sincroniza Git y redespliega sólo `whatsapp-flow`. Conserva Secrets y BD. Incluye el cambio que informa que una sesión inválida o vencida debe renovarse desde el chat. El JSON de Meta ya quedó corregido y guardado.»
