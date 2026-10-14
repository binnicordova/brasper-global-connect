# Recorrido visual en el editor de Meta

Flow visual: `1423467889980844`, nombre **Brasper - Recorrido visual IA y Flow**.

[Editor de la vista previa](https://business.facebook.com/latest/whatsapp_manager/flow_edit/?business_id=2089147141630010&tab=flow-edit&id=1423467889980844&nav_ref=whatsapp_manager&asset_id=1742357390150422)

Fuente: `public/whatsapp-flows/brasper-native-preview.json`. Guardado como borrador, sin publicar. Meta valida el JSON con cero errores. Se comprobó en el editor: monto 300, botón «Ver mi cotización», navegación a «Tus datos».

Para probarlo: Configuración de Vista previa → Modo interactivo → Primera pantalla QUOTE → OK. Completa los campos obligatorios y avanza. Este recorrido usa navegación nativa entre pantallas, datos de ejemplo y un cierre explícito de vista previa. No consulta cotizaciones reales, no recibe archivos bancarios ni registra transferencias.

El Flow operativo sigue siendo `1746368663111217`, con `data_exchange` y endpoint cifrado. El editor de Meta propone un token `flows-builder-…` que no representa una sesión del cliente: el servidor sólo acepta tokens firmados del bot vinculados a una sesión nativa vigente. No se debe desactivar esta validación para hacer avanzar una vista previa.

Los bloqueos 139000 del envío al teléfono son independientes del recorrido visual. El token local de Graph expiró durante la preparación; renovar únicamente `WHATSAPP_ACCESS_TOKEN` mediante el configurador local y, cuando corresponda, el Secret de Lovable. No confundirlo con la clave privada ni el token de verificación.
