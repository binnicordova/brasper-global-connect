# Agente Brasper: activación posterior

## Estado actual

La beta local ya dispone de chat con OpenAI, memoria de sesión en el servidor, respuestas deterministas, inicio del formulario y pausa/reanudación de IA para atención humana. Se probó una respuesta real con la clave local autorizada por el usuario. El chat no está conectado al canal WhatsApp ni asigna un asesor real. El formulario conserva el registro sintético local y sus validaciones; la vista previa de Meta continúa independiente de la BD.

Consulta [BETA_CHAT_LOCAL.md](BETA_CHAT_LOCAL.md) para uso, límites y pruebas. Esta actualización no despliega cambios de BD ni funciones en Lovable.

## Diseño propuesto para la actualización grande

Usar un mismo servicio de conversación para la web y WhatsApp Cloud API. Guardar la sesión, el canal, los mensajes, la modalidad IA/humano y la operación asociada en el backend. La identidad del visitante debe resolverse con una sesión autorizada: conocer un ID de operación o un teléfono no concede acceso a sus datos. Las claves del modelo y de Meta permanecen en secretos de servidor.

El agente puede explicar requisitos, consultar las tasas del sistema, preparar campos del formulario, interpretar un comprobante como borrador y consultar el estado de una operación autorizada. Antes de registrar, mostrar un resumen y pedir la confirmación del usuario. La creación debe ejecutar las mismas validaciones del servidor y una clave de idempotencia para evitar duplicados. Los importes y tasas se calculan con la lógica existente, no con texto generado por el modelo.

Una captura no acredita un ingreso. La confirmación bancaria y el registro del envío siguen en el dashboard humano. El agente no dispone de herramientas para aprobar ingresos, enviar dinero, cancelar operaciones ni emitir documentos por su propia decisión. La facturación continúa disparándose tras el envío confirmado por el equipo, con el mecanismo existente de reintentos y auditoría.

Para atención humana, guardar la modalidad `human`, detener las respuestas automáticas y mostrar el caso a un asesor. Conservar el resumen y los datos ya entregados. El retorno a IA requiere una acción explícita; no afirmar que una persona ha atendido hasta que exista una asignación real.

## Voz y marca

Presentarse como «Soy el asistente virtual de Brasper». Hablar con frases breves y cálidas, preguntar un dato por vez, explicar por qué se necesita y permitir corregirlo. Responder a partir del estado real. No inventar plazos, tasas, números de comprobante, aprobación bancaria o envío. En caso de duda, ofrecer atención humana.

En la web podemos personalizar colores, tipografía, avatar, conversación y recorrido completo. Un Flow nativo usa los componentes y estilos de Meta: podemos mejorar títulos, textos e imágenes compatibles, pero no incrustar nuestro HTML/CSS como una pantalla de Flow. El iframe de esta demo existe en nuestra página web. Un enlace a ella desde WhatsApp puede abrir el navegador integrado, según el cliente; no convierte la página en un Flow nativo.

## Proveedor de IA y costos

[Lovable AI](https://docs.lovable.dev/features/ai) permite añadir asistentes y análisis de imágenes con credenciales gestionadas y llamadas desde el backend. Su uso en la aplicación consume créditos de ejecución, distintos de los del editor. Otra opción es una API de modelo con clave propia y cobro del proveedor. Elegir el proveedor y establecer cuotas antes de activar tráfico real. La beta de chat local llama a OpenAI desde el servidor por autorización explícita del usuario; el registro financiero sigue siendo local. Nunca exponer claves en HTML, variables públicas o Git.

## Prompt para la futura actualización en Lovable

> Revisa primero el repositorio y las migraciones existentes. Implementa un agente Brasper compartido entre web y WhatsApp Cloud API, reutilizando las validaciones, las tasas y la creación de transferencias existentes. Añade sesiones autorizadas, memoria limitada, modalidad IA/humano, auditoría, idempotencia, límites de uso y una función de conversación con secretos de servidor. Identifica qué migraciones y funciones faltan desplegar y prepara un único plan de actualización; no marques como conectado nada que no se haya probado. El agente puede consultar y preparar una solicitud, pero debe pedir confirmación antes de registrarla. No debe aprobar ingresos, enviar dinero, cancelar ni emitir facturas por decisión del modelo. Conserva la revisión humana y la facturación posterior al envío. Integra la lectura de comprobantes solamente como extracción propuesta, nunca como prueba de ingreso. En WhatsApp, valida el webhook y procesa mensajes y respuestas del Flow con deduplicación; vincula los archivos a una sesión autorizada y guárdalos privados. Añade el traspaso humano con pausa de IA. Mantén `?demo=1` completamente local y sin llamadas pagadas. Usa la marca de la web y presenta siempre al agente como asistente virtual.

## Verificación antes de activar

Probar acceso entre sesiones, reenvíos y solicitudes duplicadas, corrección de datos, documentos inválidos, fallos del proveedor y traspaso humano. Verificar que instrucciones escritas en un mensaje o documento no cambien permisos ni ejecuten acciones financieras. Probar registro, evidencia privada, revisión humana, envío y facturación en beta de extremo a extremo. Después habilitar el canal y su presupuesto de uso.
