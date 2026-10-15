# Brasper × 5.5: omnicanal para vender

## Abrir

- `01 - V1 comercial/index.html`: pitch comercial, 13 diapositivas principales y 6 anexos.
- `02 - V2 con producto/index.html`: el mismo argumento ampliado con 9 diapositivas de producto (8 móviles y 1 escritorio), dentro de diapositivas16:9. 22diapositivas principales y6anexos. Puedes usar el video o el recorrido ampliado según el tiempo disponible.
- Los originales anteriores no se modificaron.
- Navegar con flechas. F: pantalla completa. S: notas del presentador. O o Escape: vista general. El botón Anexos salta al respaldo.
- `03 - Capturas/index.html`: galería de los dos recorridos, escritorio y móvil.
- `modelo-economico.html`: calculadora con supuestos editables. No modifica las cifras estáticas de los decks.

## Video de 1:30

La diapositiva VIDEO reserva el recorrido. No se ha generado ni recibido el video final.
Colocar `proceso.mp4` en la subcarpeta `video` de cada presentación. La diapositiva lo detecta y usa el reproductor.
Pulsa V en esa diapositiva o Pantalla limpia para esconder todo el contenido y proyectar negro. Escape recupera la vista.
Si necesitas más de una pausa, duplica esa sección HTML y cambia sus ids y controles antes de usarla. El espacio actual dura lo que decida el presentador, no avanza automáticamente.
Guion sugerido: WhatsApp IA y cotización (0–20s), registro web/app y destinatario (20–45s), prueba y validación (45–65s), envío registrado y comprobante (65–85s), continuidad del cliente (85–90s).

## Equipo

Conservar identidad 5.5. En `config.js` de cada versión completar `team` con objetos `{name: 'Nombre', role: 'Rol'}`. No se inventaron integrantes.

## Economía: qué se puede defender

Ventas 6 a 3 con sueldo base S/1.700: S/5.100 por mes, S/61.200 por año de capacidad salarial potencial. Si las personas se reasignan, es capacidad liberada y no ahorro de caja. Si se reducen costos de forma efectiva, sí puede convertirse en ahorro, sujeto a transición y obligaciones aplicables.
Contabilidad 3 a 1: sumar 2 × C mensuales, donde C es el sueldo contable real, aún no proporcionado.
Tecnología incremental T: IA, WhatsApp, nube, correo, soporte. No se dispone de cotización real. El anexo ilustra C=1.700 y T=600: 5.100+3.400−600=7.900 al mes, 94.800 al año antes de transición y marketing adicional. No es una cifra empresarial observada.
Recuperación: 64 cotizaciones/día × 10% × 30 días activos =192 transferencias adicionales, suponiendo una por chat recuperado y efecto incremental. Con margen de contribución M=15, son S/2.880 antes de costo incremental de recuperación. La remesa no es ingreso de Brasper. Los 30 días y M son supuestos.
Conversión del escenario: (67+6,4)/131=56,03%, frente a 51,15%, +4,89 puntos porcentuales. Misma inversión: costo por chat convertido cae 1−67/73,4=8,72%. Esto no es CAC: falta identificar clientes nuevos y costo real de adquisición. No confundir una transferencia recurrente con un cliente nuevo.
S/2.550 para marketing ilustra reinvertir 50% del potencial bruto de ventas. Aprobarlo desde ahorro neto real. No sumar como ahorro el valor equivalente de cobertura 24h. No sumar escenarios de retargeting y horario nocturno si recuperan a los mismos clientes.
ROI: (beneficio incremental total−costos totales)/costos totales para el mismo período. Recuperación simple del costo inicial I: I/beneficio neto mensual positivo. No hay ROI numérico real sin I, costos y margen verificados.

## Cómo leer las dos fuentes

SQL: 3.723 registradas, 3.601 no eliminadas, 3.463 completadas no eliminadas. Septiembre completo: 1.355 registradas, 1.347 no eliminadas. Intervalo 21/07–14/10/2026 a las11:56Lima. Agosto1.371 y septiembre1.355: −1,2% en registros totales. Meses julio/octubre parciales.
Tiempo SQL: promedio39h41, mediana23h29, p90 101h31, medido con updated_at−created_at. Puede incluir cambios posteriores. No prueba cuánto tardó el cliente ni cuánto costó el trabajo. No afirmar reducción porcentual a15min usando este proxy. La meta15min es propuesta operativa en casos completos con confirmación bancaria y pago disponibles. El relato2–3días hasta facturación es del equipo, no hallazgo de ese SQL.
WhatsApp: 131chats,67terminanentransferencia,64quedanencotización, promedios declarados sin período ni exportación. Facebookalmenos20%=26,2chats diarios en promedio. No se conoce su conversión propia.
No mezclar67chatsconvertidos/día con43,3registrosSQL/día. Son fuentes con definiciones y períodos distintos. Para conciliarlas: chatId,customerId,operationId,origen/campaña y fechas comunes.
La imagen adjunta es una rúbrica del jurado, no un listado de objetivos funcionales web. Se cubren sus seis criterios en anexo.

## Alcance que conviene explicar en preguntas

El pitch vende la solución omnicanal objetivo. La web y su recorrido existen. WhatsApp IA/Flow se han trabajado en beta, con condiciones externas de Meta pendientes de validar para cada número. App Expo es el canal iOS/Android en consolidación, no prueba de disponibilidad en tiendas. Los canales deben compartir identidad e historial para poder llamarlos omnicanal desplegado.
Las capturas usan el modo local aislado y datos sintéticos. Facturación y correo del recorrido son simulados. No acreditan emisión tributaria ni entrega de correo real. No se transfirió dinero. No se tocaron credenciales ni configuración fiscal.
El cliente deposita y el equipo confirma ingreso, después registra envío. La IA no aprueba fondos por imagen. Conciliación bancaria, pago autónomo, CRM, retargeting y riesgo avanzado son siguientes fases.
El sistema permite recibir solicitudes24/7. No prometer desembolsos24/7 hasta integrar banco/fintech, autorización, idempotencia y manejo de errores.

## Datos que faltan para cerrar el caso de negocio

Sueldo contable real, costo laboral total, minutos activos por etapa, horario y demanda nocturna, margen por operación, costo de captación por origen, clientes nuevos deduplicados, costos de IA/Meta/nube/soporte y costo inicial de implantación. La dotación3+1 requiere prueba de carga y calidad, especialmente cuando crezca el volumen.

## Guion por diapositiva

### equipo

20 s. Presentar integrantes. Identidad del equipo 5.5 preservada. Brasper es la empresa beneficiaria. La nueva propuesta une automatización operativa y ventas omnicanal. Los nombres se completan en config.js.

### oportunidad

25 s. Estos 64 chats sí llegaron a cotización. No llamarlos consultas sin cotizar ni dinero perdido. Son promedios declarados por el equipo, no exportación auditada. No se pueden reconciliar directamente con SQL.

### operacion

25 s. 3723 incluye 122 eliminadas. No eliminadas 3601, completadas 3463. Septiembre 1355 total,1347 no eliminadas. No combinar el promedio de 67 chats convertidos con 43,3 registrosSQL por día. La carga manual proviene del proceso aportado.

### omni

25 s. Presentamos cuatro canales dentro de una sola operación. Omnicanal significa compartir identidad, intención e historial, y no sumar varias veces al mismo cliente. iOS y Android corresponden al canal de la app Expo en consolidación. No afirmamos publicación en tiendas ni sincronización integral desplegada. Firebase almacenará operaciones y Supabase conservará servicios seleccionados. La integración está preparada en el PR 6, aún pendiente de merge y activación.

### ia

30 s. La IA responde preguntas y entiende la intención. Las herramientas aplican esquemas y reglas para calcular y operar. El modelo no inventa tasas, no confirma fondos por una imagen y no autoriza pagos. Flow recoge los datos dentro de WhatsApp mediante componentes nativos, no un iframe. El bot se ha probado en beta. El funcionamiento del Flow debe comprobarse para el número real y su configuración de Meta. Retargeting y CRM son siguientes fases.

### capacidad

25 s. No prometer despidos automáticos ni que toda contabilidad desaparezca. Se automatiza emisión y seguimiento, permanecen revisión, conciliación y cierre. La meta 15 min aplica a casos completos con ingreso confirmado y disponibilidad bancaria. La demora narrada 2–3 días no se valida con updated_at.

### ahorro

30 s. Base comercial 1700 por usuario. 6 a 3 libera 3 puestos,5100 mes,61200 año. No sumar contabilidad con sueldo inventado. Ahorro de caja requiere reducción efectiva de costo. Reasignar equipo libera capacidad, no garantiza ahorro salarial.

### crecimiento

30 s. Recuperar el 10% de 64 cotizaciones equivale a 6,4 chats diarios, o 192 en 30 días activos. Suponemos una transferencia adicional por cada chat recuperado. Con margen de contribución deS/15, seríanS/2.880 antes del costo incremental de recuperación. El monto de la remesa no es ingreso de Brasper. La conversión pasaría de 51,15% a 56,03%, una diferencia de 4,89 puntos. Validar el incremento atribuible con un grupo de control.

### marketing

25 s. Si el gasto y la cohorte son comparables, pasar de 67 a 73,4 chats convertidos reduce su costo unitario 8,72%. Eso no es CAC real. El CAC requiere costo total de adquisición y clientes nuevos únicos con primera operación completada. Facebook aporta al menos 20% de chats, pero no conocemos su propia conversión. S/2.550 representa reinvertir 50% del potencial bruto de ventas, siempre sujeto al ahorro neto disponible.

### 24h

20 s. No se ha proporcionado horario real ni porcentaje nocturno, no monetizarlo como dato observado. Valorar mediante leads fuera de horario×conversión incremental×margen. Banco/fintechAPI, conciliación y pago autorizado 24 h son futuro. No usar supuesto 40 horassemanales como horario real.

### video

90 s reservados al video. Escena 1:agenteWhatsApp entiende y cotiza 0–20. Escena 2:web oapp retoma, datos y cuenta 20–45. Escena 3:comprobante y validación 45–65. Escena 4:envío registrado, comprobante y seguimiento 65–85. Cierreomnicanal 85–90. Usar grabación existente y no simular envío bancario real. PulsaV para pantalla totalmente negra. Si colocas video/proceso.mp 4 se reproduce aquí.

### piloto

25 s. Instrumentar timestamps por evento, no solo updated_at. Piloto controla recuperación con consentimiento. Medir deduplicación porclienteoperación, rol de cada canal y costo de tecnología. Facturación actual permanece simulada. Conectar banco futuro solo con permisos y reglas. No se garantiza plazo de integración externa.

### cierre

15 s. Cierre comercial. Pedir piloto y datos de costos reales. Beneficio potencial sujeto a capacidad, ejecución y costos. No vender ahorro garantizado. Mostrar equipo y pasar a preguntas.

### modelo

El sueldo contable y el costo tecnológico reales están pendientes. El ejemplo usaC=S/1.700 yT=S/600. Así,5.100+3.400−600=S/7.900 por mes, oS/94.800 al año. No es un resultado observado. Si el personal se reasigna, se libera capacidad y no necesariamente caja. Restar transición y marketing adicional. No sumar el valor equivalente de cobertura ni duplicar el costo de recuperación. El retorno requiere una inversión inicial verificada.

### sensibilidad

Cada escenario multiplica 64 cotizaciones por la recuperación y los días activos. Si se atienden 26 días, sustituir 30 por 26. El contacto requiere autorización y una forma sencilla de dejar de recibir mensajes. Medir transferencias adicionales completadas en una ventana comparable. Descontar el costo incremental y evitar duplicar al cliente entre canales.

### tiempos

El indicador SQL mide última actualización menos creación. Una modificación posterior puede alargarlo. La mediana de septiembre 64 h 01 y la de agosto 6 min pueden reflejar diferencias de registro. No concluyen por sí solas que cambió la demora operativa. No calcular una reducción porcentual contra la meta 15 min. Registrar los primeros eventos de confirmación, pago y comprobante para construir una línea base comparable.

### futuro

El crecimiento necesita una operación preparada para riesgo y excepciones. OCR y duplicados ayudan a priorizar revisión, pero una foto no confirma fondos. CRM, conciliación bancaria y pago mediante API son un roadmap. Brasil puede integrarse con Omie o un proveedor fiscal autorizado según sus requisitos. La facturación del recorrido mostrado permanece simulada.

### rubrica

La imagen es una rúbrica de evaluación del pitch, no objetivos funcionales de una web. Se usa para asegurar cobertura.

### fuentes

Los informes adjuntos viajan con la presentación. El SQL contiene conteos observados. WhatsApp tiene promedios informados sin período común. Los sueldos, dotación y metas se distinguen de resultados. No afirmar publicación de apps en tiendas, aprobación general de Meta ni validación tributaria. Los nombres del equipo siguen editables.
