# Brasil en esta entrega

Regla comercial solicitada: país según la moneda recibida por el destinatario. PEN → Perú; BRL → Brasil. El país se guarda al crear la operación; comprobantes históricos ya emitidos conservan su emisor.

Brasil solicita correo, nombre fiscal y CPF, CNPJ o documento extranjero. En beta/demo se genera un PDF NFS-e demo en BRL por la comisión del servicio, convertido con la tasa guardada cuando corresponda. No calcula impuestos brasileños ni atribuye autorización fiscal. La adecuación fiscal del documento y el emisor deberán confirmarse antes de producción.

Producción Brasil queda en revisión de configuración: no invoca SUNAT ni inventa una emisión autorizada. La conexión real con Omie todavía no está implementada.

Omie publica APIs de órdenes de servicio, consulta NFS-e y documentos fiscales: [catálogo oficial](https://developer.omie.com.br/service-list/) y [documentos de servicios / ObterNFSe](https://app.omie.com.br/api/v1/servicos/osdocs/). Para conectar emisión faltan acceso autorizado de la empresa, emisor/CNPJ, municipio, servicio aprobado y su tratamiento fiscal. El adaptador deberá guardar identificadores externos, consultar resultados inciertos antes de reintentar y obtener el PDF/XML autorizado; correo será una etapa independiente con reintentos sin reemitir.

SUNAT beta real y envío de email siguen sujetos al servidor gateway y configuración detallada en BIG_UPDATE.md. Los cuatro secretos de la Edge Function no activan por sí solos el servidor web.
