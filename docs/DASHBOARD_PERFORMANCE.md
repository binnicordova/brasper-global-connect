# Carga del dashboard

Hallazgos: enlaces internos recargaban la aplicación; `invoices(*)` arrastraba XML/PDF/CDR codificados; el resumen se consultaba nuevamente al filtrar. Se reemplazaron enlaces por navegación SPA, se seleccionan únicamente metadatos fiscales y se separaron las consultas con caché de 15 segundos. Se mantienen paginación de 50, control de acceso y actualización por eventos con debounce de 500 ms. Al cambiar identidad se elimina la caché del usuario anterior.

Observación del sitio publicado antes de estos cambios: TTFB de entrada fría aproximadamente 2,67 s y navegación caliente 77 ms. Son muestras, no un benchmark ni prueba de la latencia con datos protegidos. La variación también apunta a arranque del servidor. No se garantiza una cifra de mejora sin medir el despliegue final.

La migración 011 añade índices para estados y búsquedas por documento. Aplicarlos en el big update. Revisar después latencia de RPC/resumen, tamaño de respuesta y arranque del servidor con datos reales. No se desplegaron BD ni funciones durante esta preparación.
