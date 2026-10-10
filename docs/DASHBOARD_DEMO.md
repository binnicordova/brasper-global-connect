# Dashboard Brasper: rediseño y demo sintética

La interfaz sigue las referencias aportadas: navegación lateral, tabla de operaciones y detalle agrupado en participantes, importes, cuenta de destino, condiciones y fechas. Los nombres, números de operación y correos de las capturas no se importan como clientes.

## Abrir y probar

Después de sincronizar `main` y publicar el frontend, abrir:

- `/dashboard?demo=1`: seis operaciones sintéticas, métricas, estados, filtros y ficha de detalle.
- `/transferencias?demo=1`: formulario real, con el almacenamiento de demostración. No requiere claves de Supabase.

En local: `npm run dev`, abrir las rutas anteriores. El aviso identifica la simulación y permite ir al registro/dashboard, descargar un comprobante de ejemplo, reiniciar los datos o salir de demo. Abrir otra pestaña requiere también `?demo=1` para activar explícitamente ese contexto.

1. Registrar datos, origen/motivo de fondos para Perú y factura o boleta, con correo de ejemplo. Elegir el PDF descargado o una imagen propia y escribir `DEMO-12345` como operación bancaria. La solicitud queda en «Pago en revisión».
2. Ir al dashboard. Abrir la solicitud con «Abrir» para entrar a la bandeja del equipo. Elegir «Confirmar ingreso bancario» y escribir una observación. La selección se limpia tras guardar.
3. Elegir «Registrar dinero enviado», indicar referencia y subir una constancia. Puede usarse el mismo PDF de ejemplo.
4. Al guardar se genera automáticamente un PDF demo del tipo elegido y se registra el correo simulado dirigido al email declarado. La operación se completa una sola vez.
5. Consultar el dashboard, seleccionar todos los estados y abrir la operación: «Resumen» muestra importes, condiciones, participantes y fechas; «Datos y fondos» contiene declaraciones y receptor fiscal; «Archivos» muestra ambas evidencias, PDF y destinatario/fecha del correo simulado. El cliente también puede consultar y abrir su PDF desde el historial.

Los datos se guardan en `localStorage` y los archivos en IndexedDB de este navegador. Es una demo local: no sincroniza las operaciones entre dispositivos. Cliente y equipo se simulan según la página; no representan la autenticación real de producción. En modo normal se mantiene Supabase y su RLS. No se llama al worker productivo, SUNAT, bancos ni proveedor de correo, y no se usa ninguna credencial real. El correo automático demo es un evento visible, no un email entregado a una bandeja externa. En producción siguen vigentes las migraciones, la aprobación manual, el worker y la verificación del correo documentados en `BILLING_PREFERENCES_LOVABLE.md`.

## Campos comparados con el dashboard actual

| Campo / función de las capturas                           | Estado en esta entrega                                              | Pendiente para datos reales                                                                     | Prioridad                       |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------- |
| Código comercial tipo PXB                                 | Código de demo / UUID corto en modo normal                          | Secuencia comercial e importación del identificador original                                    | Media                           |
| Estado y verificada                                       | Estado, fecha de confirmación y estado de ingreso                   | Identificar quién verificó directamente en la ficha; hoy está en auditoría                      | Media                           |
| Ventas / asesor                                           | Asesor sintético en demo                                            | Asignación a usuario real y permisos del asesor                                                 | Alta                            |
| Cliente / documento / contacto                            | Implementado                                                        | Maestro independiente de clientes y gestión de cuentas guardadas                                | Media                           |
| Razón social del receptor                                 | Factura: razón social/RUC; boleta: datos del cliente                | Dirección fiscal opcional                                                                       | Media                           |
| Empresa emisora / RUC / serie                             | Emisor ficticio en demo; configuración fiscal fuera de la operación | Catálogo de emisores, reglas de selección y snapshot por comprobante                            | Alta antes de producción fiscal |
| Cuenta origen del cliente                                 | Banco y país; declaración de titularidad                            | Identificador de cuenta de origen y titular para conciliación                                   | Alta                            |
| Cuentas destino y reparto                                 | Una cuenta, titular, documento, banco/CCI/PIX                       | Destinos múltiples y suma de asignaciones consistente                                           | Media                           |
| Importe enviado / recibido                                | Implementado, con moneda                                            | Ninguno para el flujo de una cuenta                                                             | Disponible                      |
| Tasa / comisión aplicada                                  | Implementado y visible                                              | Snapshot de reglas comerciales más completo                                                     | Media                           |
| Comisión base / descuento variable / calculadora especial | No se deducen a partir de una imagen                                | Guardar cada componente, origen del ajuste y aprobación; no alterar la cotización ya registrada | Alta si se usarán descuentos    |
| Comisión interna / impuesto / venta final                 | No se aplica IGV por defecto                                        | Definir base imponible, concepto y tratamiento fiscal por emisor con las reglas aprobadas       | Alta antes de producción fiscal |
| Fecha de envío / pago / creado / actualizado              | Creación, ingreso confirmado, envío registrado y actualización      | Fecha efectiva bancaria independiente, si difiere de la fecha de registro                       | Media                           |
| Número de operación bancaria                              | Ingreso y envío registrados                                         | Detección de duplicados por banco/cuenta/fecha sin falsos positivos                             | Alta                            |
| Comprobante SUNAT / PDF / XML / CDR                       | Archivos disponibles en modo real; PDF y correo simulados en demo   | Emisor productivo, boletas reales y seguimiento del correo                                      | Alta antes de producción        |
| Captura ingreso / envío                                   | Implementado                                                        | OCR puede apoyar; aprobación bancaria sigue manual                                              | Disponible                      |
| Usuarios y roles / importar y exportar Excel              | Fuera de este rediseño                                              | Módulo con permisos, validación de importación y exportación de todos los resultados            | Media                           |
| Origen de fondos y motivo del cambio                      | Obligatorios para Perú; visibles en detalle                         | Protocolo humano de revisión, identidad y soporte documental cuando corresponda                 | Alta en la operación real       |

La demo conserva el flujo de registro y aprobaciones acordado. Los campos sintéticos adicionales sirven para mostrar el diseño; no crean reglas fiscales o comerciales para la operación real.
