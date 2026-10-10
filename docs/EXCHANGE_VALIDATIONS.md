# Validaciones de cambio y declaración de fondos

## Comparación y adaptación a Brasper

La [ayuda oficial de Kambista](https://kambista.com/ayuda/) describe banco de origen, cuenta de destino y número de operación bancaria; exige validación de identidad y limita el destino a cuentas propias. Los [términos de Cambista.com](https://cambista.com/condiciones-para-el-uso-de-la-plataforma-cambista/) describen identificación del cliente, cuentas y controles sobre la recepción de fondos. Son referencias de proceso, no comprobaciones realizadas por Brasper.

| Control                | Comportamiento en Brasper                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identificación         | Tipo y número de documento del remitente. DNI: 8 dígitos; RUC/CPF: 11; CNPJ: 14; otros: 2–20 caracteres alfanuméricos o guion. Formato solamente, sin consulta RENIEC/SUNAT ni verificación biométrica.    |
| Contacto               | Teléfono con `+`, código de país y 8–15 dígitos; correo obligatorio para comprobante.                                                                                                                      |
| Banco origen / destino | Banco de origen y país de ambas cuentas. CCI: 20 dígitos, solo PEN; PIX, solo BRL. Cuenta, titular y documento receptor quedan disponibles al equipo.                                                      |
| País                   | PEN se opera con Perú y BRL con Brasil; USD obliga a elegir Perú o Brasil. La cuenta oficial de ingreso debe estar configurada para esa moneda y país. Estas son las rutas soportadas por este formulario. |
| Declaración de fondos  | Si origen o destino es Perú, se exige origen del dinero y motivo del cambio. «Otro origen» exige explicación de al menos 5 caracteres. También aplica al USD en Perú.                                      |
| Envíos a otra persona  | Se conserva el caso de remesas de Brasper. Si documento del destinatario o titular difiere del remitente, se exige indicar su relación. No se aprueba automáticamente.                                     |
| Titularidad            | Declaración explícita de que los fondos salen de la cuenta del remitente y que sus datos son correctos. Se guarda fecha de declaración.                                                                    |
| Prueba bancaria        | Imagen/PDF privado y número de operación de 2–100 caracteres. La referencia se exige al adjuntar el pago, no antes de pagar.                                                                               |
| Aprobación             | Continúa manual: el equipo coteja identidad, titularidad, importe, banco, número de operación y declaración antes de confirmar el ingreso. El archivo por sí solo no acredita fondos recibidos.            |
| Facturación            | Correo y selección factura/boleta, con datos propios del receptor fiscal. Emisión solo después de registrar envío con constancia.                                                                          |

La declaración se añadió por solicitud de Brasper. No se introducen umbrales regulatorios ni se afirma que capturar estos campos acredita cumplimiento de todas las obligaciones de la empresa.

## Backend y activación

1. Sincronizar `main` y aplicar las migraciones pendientes hasta `202610100008_exchange_validation.sql`, en orden y una sola vez. Para Drizzle, los incrementales son `0002_billing_preferences.sql` y `0003_exchange_validation.sql`; no ejecutar ambos migradores sobre la misma base.
2. `deposit_accounts.country`: la migración asigna PE a PEN y BR a BRL; revisar esas asignaciones contra las cuentas oficiales. USD permanece sin país hasta que administración configure el banco real en SQL. Una cuenta USD sin país no se presenta como cuenta habilitada para una solicitud nueva.
3. Publicar el frontend y redesplegar el worker de facturación según [BILLING_PREFERENCES_LOVABLE.md](BILLING_PREFERENCES_LOVABLE.md). El frontend nuevo exige que ambas migraciones estén aplicadas antes de su activación.
4. Crear mediante `create_validated_transfer`, que valida y llama al helper de facturación en la misma transacción. Adjuntar mediante `submit_transfer_proof`, que bloquea la operación, comprueba propiedad/estado/archivo privado y guarda la referencia con el pago. Los RPC anteriores quedan sin permiso de ejecución al cliente; pantallas antiguas deben actualizarse.
5. Revisar en el dashboard «Ingreso bancario y declaración de fondos». Todas las declaraciones son datos del cliente, pendientes de comprobación por el equipo. No se hizo una integración de KYC, acceso bancario ni lectura OCR.

Las operaciones históricas quedan intactas, sin inventarles declaraciones retroactivas. Las declaraciones y referencias permanecen bajo el RLS de su transferencia. No se exponen en la landing ni en enlaces públicos. Comparar documentos detecta diferencias exactas del número, pero no reemplaza cotejar identidad: un número sin tipo y país no demuestra que sea la misma persona. La operación sigue requiriendo revisión humana.

## Pruebas

Se cubren creación atómica, formato de identidad/teléfono, datos bancarios, origen/motivo para Perú incluso USD, motivo «Otro», relación con terceros, consentimiento, filtros de bancos por país, invitado sin registro, aislamiento RLS, referencia bancaria obligatoria y bloqueo de los endpoints antiguos. Las pruebas locales no acreditan despliegue ni una verificación externa del documento o banco.
