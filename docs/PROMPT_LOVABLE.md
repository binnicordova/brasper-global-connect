# Prompt para activar el flujo en Lovable

Para proyectos ya activados, aplica además la migración de revisión segura y sigue [FIX_REVIEW_LOVABLE.md](FIX_REVIEW_LOVABLE.md). Cancelar requiere `cancel_transfer`, fuera del desplegable de revisión, con confirmación explícita y estado esperado. `review_transfer` rechaza cancelaciones de pantallas antiguas.

Copia el siguiente texto en el proyecto Lovable conectado a `jordyalania/brasper-global-connect`. Los archivos están en `main`; sincroniza esa rama y comprueba las migraciones pendientes antes de publicar.

---

Activa el flujo de transferencias de Brasper usando el código existente. Conserva la landing y el diseño actual, e integra `/transferencias` con el backend de Supabase de este proyecto. Antes de modificar, lee `AGENTS.md` y `docs/TRANSFER_WORKFLOW.md` y `docs/SUNAT_BETA.md`.

**Archivos existentes que debes usar:**

- `supabase/migrations/202610100001_transfer_workflow.sql`: tablas, RLS, Storage privado y funciones PostgreSQL.
- `supabase/migrations/202610100002_staff_dashboard.sql`: resumen global protegido para el equipo.
- `supabase/migrations/202610100003_recipient_details.sql`: cuenta receptora completa y actualización del dashboard por Realtime.
- `supabase/migrations/202610100004_sunat_beta.sql`: ensayos SUNAT beta aislados y envío único.
- `src/routes/api.billing-beta.ts` y `src/lib/sunat/`: gateway de servidor, XML firmado, PDF de prueba y transporte SUNAT beta.
- `supabase/migrations/202610100005_guest_exchange.sql`: solicitudes sin registro, contacto sin verificar, límites y acceso privado.
- `supabase/functions/process-invoices/index.ts`: worker de facturación y correo.
- `supabase/config.toml`: configuración del worker.
- `supabase/manual-setup.example.sql`: plantilla comentada para configurar manualmente equipo, cuentas bancarias y tasas.
- `src/lib/supabase.ts`, `src/lib/transfers.ts` y `src/routes/transferencias.tsx`: conexión, validaciones y portal.
- `.env.example`: variables públicas del frontend.
- `src/routes/index.tsx`: página principal, seguimiento y preguntas frecuentes.
- `src/routes/dashboard.tsx` y `MASTER_PLAN.json`: dashboard interno y plan de activación.

**Primero la página principal y el dashboard:**

Conserva la página principal en `/` y su diseño. El botón principal de la calculadora «Hacer mi cambio desde la web» lleva a `/transferencias?from=MONEDA&to=MONEDA&amount=MONTO`; conserva esa intención tras login/confirmación de correo. WhatsApp queda disponible para atención. Explica cotización, carga de prueba, revisión de ingreso, envío y comprobante. Mantén el cálculo público como ilustrativo y las preguntas frecuentes desplegables. No añadas cifras comerciales, alianzas bancarias ni tiempos garantizados sin evidencia oficial.

Activa `/dashboard` para cuentas presentes en `staff_members`: pagos por revisar, listas para enviar, envíos registrados y facturación bloqueada o por conciliar. Los totales deben venir del RPC `staff_dashboard_summary`, sobre todo el historial; no derivarlos solo de la página de 50 filas. Separa los importes por moneda y aclara que no son saldos bancarios. Mantén filtros por estado y cliente, paginación y enlaces a la operación exacta en la bandeja de revisión. Ningún cliente debe poder consultar agregados globales ni datos ajenos, incluso invocando el RPC directamente.

La sección «Puesta en marcha» muestra fases, objetivos y módulos de `MASTER_PLAN.json`. Actualiza los hitos solo después de verificar su activación; el avance técnico del repositorio no acredita que el entorno de producción esté configurado. Sin backend conectado, muestra el estado pendiente de conexión y no inventes métricas.

**Backend y autenticación:**

1. Identifica el backend conectado a este proyecto. Inspecciona esquema e historial de migraciones; aplica la migración pendiente una sola vez, sin borrar datos ni duplicar tablas o políticas. Si hay conflictos, crea una migración incremental compatible. Mantén Auth y Storage reales, sin datos simulados.
2. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` o adapta el cliente a la clave pública equivalente del entorno. Nunca expongas `service_role` ni secretos fiscales en VITE o en el navegador.
3. Habilita **Anonymous sign-ins** y **manual identity linking**, registro opcional, login, confirmación de correo y redirects a `/transferencias`. El botón principal del portal es «Continuar sin cuenta»: inicia una sesión anónima sin pedir contraseña ni confirmar correo. El administrador asigna `staff_members` desde BD usando un UUID real; ningún cliente puede asignarse permisos.
4. Mantén `transfer-proofs` e `invoice-documents` privados, PDF/JPG/PNG para pruebas, máximo 5 MB y enlaces temporales firmados. Respeta las políticas de aislamiento de cada cliente.

**Flujo requerido:**

Cliente continúa sin cuenta o usa una cuenta opcional; elige una cotización vigente, introduce datos del destinatario y crea solicitud. La BD calcula comisión, tasa y monto a recibir, conserva la cotización y las instrucciones de la cuenta de ingreso. El cliente realiza el depósito fuera del sitio y sube su prueba.

Subir prueba NO confirma el ingreso. El equipo revisa el banco manualmente y confirma mediante `review_transfer`. Luego realiza el envío bancario fuera de la plataforma y registra referencia y constancia. Solo ese registro crea una solicitud única de facturación. El cliente consulta sus estados y descarga su comprobante cuando esté disponible.

Aplica también `202610100006_safe_transfer_review.sql` `202610100007_billing_preferences.sql` y `202610100008_exchange_validation.sql`. Usa `create_validated_transfer` para invitados y cuentas confirmadas; pide correo obligatorio y elección factura/boleta, recoge RUC/razón social para factura y tipo de documento para boleta, y conserva todo en resumen, historial y dashboard; registra la operación completa, `submit_transfer_proof` con número de operación para enlazar el comprobante y `review_transfer` para la revisión del equipo. Conserva auditoría y transiciones; no permitas actualizaciones directas del cliente, saltar verificaciones, duplicar envíos o duplicar documentos. Las tasas y cuentas oficiales se cargan manualmente por ahora. Si faltan, informa que no hay una cotización o cuenta habilitada; no inventes valores.

El invitado conserva acceso privado en el mismo navegador. «Guardar acceso con una cuenta (opcional)» usa `auth.updateUser`, confirma correo y mantiene el UUID; no crear un usuario distinto ni perder sus operaciones. `verify_transfer_contact` valida el correo desde Auth antes de permitir entrega productiva por email. No hacer público ningún bucket ni desactivar RLS para permitir invitados.

El cliente completa el asistente de cuatro pasos: cotización, sus datos, cuenta de destino, revisión y pago. Valida cada paso antes de continuar, conserva valores al volver, muestra resumen de importes/cuenta antes de confirmar y exige consentimiento. La intención de la landing nunca sustituye la tasa de BD: si no hay esa ruta, el usuario debe elegir explícitamente otra. El cliente debe poder completar el formulario y adjuntar una foto/PDF desde la web. Recoge nombre, documento y teléfono del remitente; destinatario y documento; titular y documento de la cuenta receptora; banco, cuenta/CCI/PIX, agencia, teléfono opcional y observaciones. Muestra vista previa antes de enviar. Si no pagó todavía, guarda los datos y muestra las instrucciones para luego adjuntar la prueba en esa misma operación. Si ya pagó, registra solicitud y archivo y pasa a revisión. Si falla la carga, conserva la solicitud y permite reintentar su comprobante sin volver a crearla.

En `/dashboard`, el equipo debe abrir la imagen/PDF y todos los datos en el diálogo de la operación, sin convertir el bucket en público. Activa Realtime para actualizar la cola cuando lleguen solicitudes/pruebas; verifica que un cliente no pueda obtener archivos ni datos de otros. Conserva Actualizar como respaldo. Los componentes existentes `receipt-upload`, `evidence-preview` y `transfer-details` implementan estos pasos.

**Automatización fiscal:**

Despliega `process-invoices` con `verify_jwt=false`; conserva su autenticación propia por `BILLING_WORKER_SECRET`. Configura un scheduler de backend que invoque POST cada minuto con el secreto almacenado de forma segura. Nunca llames a ese worker desde el frontend.

Solicita en el gestor de secretos `BILLING_WORKER_SECRET`, `BILLING_GATEWAY_URL`, `BILLING_GATEWAY_TOKEN`, `BILLING_ALLOWED_ROUTES`, `RESEND_API_KEY` y `BILLING_FROM_EMAIL` cuando correspondan. Supabase proporciona las credenciales internas de la función. No pidas pegar secretos en el chat, no los muestres ni los guardes en Git o SQL público.

Para esta etapa usa SUNAT beta: el motor directo ya está implementado en `/api/billing-beta`. Aplica también la cuarta y quinta migraciones. Configura los secretos del servidor `BILLING_BETA_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` del backend de Brasper y `BILLING_GATEWAY_TOKEN`. En el worker configura `BILLING_ENVIRONMENT=beta`, `BILLING_GATEWAY_URL=https://DOMINIO/api/billing-beta`, `BILLING_GATEWAY_TOKEN` y `BILLING_WORKER_SECRET`. Reutiliza la clave beta autorizada del archivo local privado `.env.billing-beta` mediante el gestor de secretos; el archivo no está en Git. No pidas mostrarla en el chat. No copies la BD ni credenciales SOL de producción de HOTEL JB.

Conserva los ensayos con serie F902 y valores ficticios fijos; la serie F903 es para smoke tests independientes. No envíes datos personales de operaciones al entorno beta. Al aceptar SUNAT guarda XML/PDF/CDR privados y marca `beta_accepted`, sin email automático y sin completar la operación real. La interfaz debe mostrar «PRUEBA BETA - SIN VALIDEZ TRIBUTARIA». Nunca confundir un CDR beta con aceptación fiscal de producción. Ante timeout conserva el resultado y exige conciliación antes de reenviar.

Para producción el gateway genérico sigue siendo un contrato interno pendiente del adaptador oficial. Configura emisor, SOL, certificado, series, receptor fiscal, concepto y tratamiento tributario propios de Brasper. No calcules IGV sobre toda la remesa por defecto ni uses la tasa hotelera.
Tras aceptación fiscal auténtica, conserva PDF/XML/CDR y envía el PDF por correo desde un remitente verificado. Respeta idempotencia, ventanas de reintento y conciliación de `processing`, `sending` o `reconciliation_required`; no reemitas automáticamente ante timeout. Omie/Brasil queda fuera de esta activación inicial de SUNAT.

**Verificación y entrega:**

Ejecuta las pruebas del repositorio y una prueba integral en el backend real: dos clientes aislados, cuenta del equipo, carga privada, verificación, registro de envío y prevención de duplicados. Prueba facturación en homologación solo cuando exista el proveedor configurado. Comprueba que los secretos no llegan al cliente y revisa la interfaz móvil.

Entrega un resumen de migraciones aplicadas, funciones desplegadas, scheduler y variables configuradas (solo nombres). Indica por separado qué funciona realmente y qué depende de datos o credenciales pendientes. No publiques ni habilites emisión fiscal en producción durante pruebas de homologación.

La activación de factura/boleta y el contrato actualizado del worker están en [BILLING_PREFERENCES_LOVABLE.md](BILLING_PREFERENCES_LOVABLE.md). Una boleta debe quedar bloqueada en beta hasta configurar su emisor; nunca generar una factura en su lugar.

**Validaciones de cambio:** sigue `docs/EXCHANGE_VALIDATIONS.md`: pide tipo/documento y teléfono internacional, banco/país de origen y país de destino. Para Perú exige origen de los fondos y motivo del cambio, también en USD. Si el destinatario o titular es distinto del remitente, pide su relación y conserva el envío a terceros bajo revisión manual. Usa declaración explícita de titularidad de fondos. Configura `deposit_accounts.country`, especialmente cuentas USD; no inventes bancos ni países para esas cuentas. Mantén deshabilitados los RPC antiguos de creación para impedir eludir controles y verifica RLS para invitados.
