# Prompt para activar el flujo en Lovable

Copia el siguiente texto en el proyecto Lovable conectado a `jordyalania/brasper-global-connect`. Los archivos están en la rama `codex/transfer-workflow`, PR #1. Primero integra esos cambios en la rama que Lovable sincroniza o importa los archivos; no asumas que Lovable ya ve el PR.

---

Activa el flujo de transferencias de Brasper usando el código existente. Conserva la landing y el diseño actual, e integra `/transferencias` con el backend de Supabase de este proyecto. Antes de modificar, lee `AGENTS.md` y `docs/TRANSFER_WORKFLOW.md`.

**Archivos existentes que debes usar:**

- `supabase/migrations/202610100001_transfer_workflow.sql`: tablas, RLS, Storage privado y funciones PostgreSQL.
- `supabase/functions/process-invoices/index.ts`: worker de facturación y correo.
- `supabase/config.toml`: configuración del worker.
- `supabase/manual-setup.example.sql`: plantilla comentada para configurar manualmente equipo, cuentas bancarias y tasas.
- `src/lib/supabase.ts`, `src/lib/transfers.ts` y `src/routes/transferencias.tsx`: conexión, validaciones y portal.
- `.env.example`: variables públicas del frontend.

**Backend y autenticación:**

1. Identifica el backend conectado a este proyecto. Inspecciona esquema e historial de migraciones; aplica la migración pendiente una sola vez, sin borrar datos ni duplicar tablas o políticas. Si hay conflictos, crea una migración incremental compatible. Mantén Auth y Storage reales, sin datos simulados.
2. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` o adapta el cliente a la clave pública equivalente del entorno. Nunca expongas `service_role` ni secretos fiscales en VITE o en el navegador.
3. Habilita registro, login, confirmación de correo y redirects a `/transferencias`. El administrador asigna `staff_members` desde BD usando un UUID real; ningún cliente puede asignarse permisos.
4. Mantén `transfer-proofs` e `invoice-documents` privados, PDF/JPG/PNG para pruebas, máximo 5 MB y enlaces temporales firmados. Respeta las políticas de aislamiento de cada cliente.

**Flujo requerido:**

Cliente elige una cotización vigente, introduce datos del destinatario y crea solicitud. La BD calcula comisión, tasa y monto a recibir, conserva la cotización y las instrucciones de la cuenta de ingreso. El cliente realiza el depósito fuera del sitio y sube su prueba.

Subir prueba NO confirma el ingreso. El equipo revisa el banco manualmente y confirma mediante `review_transfer`. Luego realiza el envío bancario fuera de la plataforma y registra referencia y constancia. Solo ese registro crea una solicitud única de facturación. El cliente consulta sus estados y descarga su comprobante cuando esté disponible.

Usa los RPC existentes `create_transfer`, `submit_proof` y `review_transfer`. Conserva auditoría y transiciones; no permitas actualizaciones directas del cliente, saltar verificaciones, duplicar envíos o duplicar documentos. Las tasas y cuentas oficiales se cargan manualmente por ahora. Si faltan, informa que no hay una cotización o cuenta habilitada; no inventes valores.

**Automatización fiscal:**

Despliega `process-invoices` con `verify_jwt=false`; conserva su autenticación propia por `BILLING_WORKER_SECRET`. Configura un scheduler de backend que invoque POST cada minuto con el secreto almacenado de forma segura. Nunca llames a ese worker desde el frontend.

Solicita en el gestor de secretos `BILLING_WORKER_SECRET`, `BILLING_GATEWAY_URL`, `BILLING_GATEWAY_TOKEN`, `BILLING_ALLOWED_ROUTES`, `RESEND_API_KEY` y `BILLING_FROM_EMAIL` cuando correspondan. Supabase proporciona las credenciales internas de la función. No pidas pegar secretos en el chat, no los muestres ni los guardes en Git o SQL público.

El gateway documentado es un contrato interno del proyecto: todavía NO es una integración real con SUNAT o Keyfacil. Implementa el adaptador únicamente con documentación y credenciales oficiales del proveedor. Si no están disponibles, completa el portal y la revisión manual, y conserva la facturación bloqueada con un mensaje honesto. No generes facturas ficticias, CDR falsos, endpoints inventados ni calcules IGV sobre toda la remesa por defecto. El tratamiento fiscal, emisor, series y receptor deben estar configurados con el responsable de Brasper.

Tras aceptación fiscal auténtica, conserva PDF/XML/CDR y envía el PDF por correo desde un remitente verificado. Respeta idempotencia, ventanas de reintento y conciliación de `processing`, `sending` o `reconciliation_required`; no reemitas automáticamente ante timeout. Omie/Brasil queda fuera de esta activación inicial de SUNAT.

**Verificación y entrega:**

Ejecuta las pruebas del repositorio y una prueba integral en el backend real: dos clientes aislados, cuenta del equipo, carga privada, verificación, registro de envío y prevención de duplicados. Prueba facturación en homologación solo cuando exista el proveedor configurado. Comprueba que los secretos no llegan al cliente y revisa la interfaz móvil.

Entrega un resumen de migraciones aplicadas, funciones desplegadas, scheduler y variables configuradas (solo nombres). Indica por separado qué funciona realmente y qué depende de datos o credenciales pendientes. No publiques ni habilites emisión fiscal en producción durante pruebas de homologación.
