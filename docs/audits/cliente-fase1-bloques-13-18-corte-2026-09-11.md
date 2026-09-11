# BLOQUES 13–18 — CORTE PREVIO A IMPLEMENTACIÓN

Se inició auditoría de backend, web y móvil. **No se implementaron cambios funcionales en esta etapa.** Se activó la regla de corte del bloque 16 tras contrastar migraciones con las FKs y conteos reales. El cierre de los bloques 9/10/12 no implica cierre de estos seis bloques.

## Motivo concreto de detención

Instrucción del usuario: **«Si cambiar una FK afectaría datos existentes o requiere migración delicada: DETENTE y reporta antes de ejecutar.»**

La consulta a PostgreSQL, en transacción `READ ONLY` con rollback, confirmó:

- **2 reservas y 2 contratos** existentes.
- Las cinco FKs de reservas hacia users/providers/aircraft/flight_requests/quotes siguen en **CASCADE**.
- `reservation_contracts.reservation_id → reservations.id` sigue en **CASCADE**.
- `operations.flight_request_id → flight_requests.id` sigue en **CASCADE**.
- `payments.reservation_id`, `payments.flight_request_id` y `payments.user_id` ya son **SET NULL**: los pagos no se borran por estas FKs, pero pueden perder su vínculo con la evidencia comercial.

Cerrar el bloque 16 exige revisar ALTER CONSTRAINT sobre tablas con historial y la compatibilidad de borrados existentes. No se preparó ni ejecutó una migración que lo cambiara. No se puede afirmar que todas las eliminaciones atraviesen la cadena completa: otras FKs RESTRICT pueden bloquearlas; las cascadas peligrosas sí están vigentes.

Además, existen dos flujos de aceptación activos con efectos comerciales diferentes; no se decidió silenciosamente cuándo crear una operación.

# BLOQUE 13 — PRIVACIDAD PROVEEDOR

**Estado: 🟡 PARCIAL — hallazgos estáticos, corrección y tests pendientes.**

**Campos públicos propuestos:** id de proveedor para relaciones existentes, commercial_name/company_name si el flujo lo necesita; aeronave y características mediante lista explícita. El web utiliza IDs y nombres de proveedor; no necesita su usuario interno completo. Confirmar visibilidad comercial por etapa antes de permitir contactos.

**Campos que deben bloquearse:** rfc, legal_name cuando sea innecesario, curp, datos de representante, teléfonos/correos directos, document_type/number/expiration, documentos internos, admin_notes/admin_validation_notes, revisión/rechazo/onboarding, credenciales y temporary_password_visible. No se aplicó todavía la lista.

**Puntos confirmados:**

| Endpoint / origen | Hallazgo |
| --- | --- |
| GET /cliente/cotizaciones | CotizacionControlador@index carga provider.user y devuelve paginator Eloquent completo |
| GET /cliente/cotizaciones/{quote} | show carga provider completo |
| GET /cliente/reservas | ReservaControlador@index carga provider.user |
| GET /cliente/reservas/{reservation} | show carga provider completo |
| POST /cliente/solicitudes | store devuelve matches.aircraft.provider completo |
| Solicitudes/historial/contratos | Existen serializaciones Eloquent y relaciones anidadas; cobertura exhaustiva pendiente |
| Catálogo moderno | ClienteControlador ya tiene arrays de provider con id/company_name/commercial_name; otra representación agrega jet_a_price. Reutilizar y restringir de forma consistente |

Proveedor contiene campos fiscales, contactos y notas administrativas sin una representación pública común. Usuario oculta password y remember_token, pero **no temporary_password_visible**. Aeronave incluye dispatch_notes/security_notes y relación documents: su exposición debe probarse por endpoint, no asumirse solo por estar en fillable.

**Tests:** no ejecutados en esta etapa; no se acredita protección ni compatibilidad web/móvil con una representación nueva.

# BLOQUE 14 — PASSWORDS

**Estado: 🟡 PARCIAL — riesgo confirmado, sin limpieza ni cambios.**

**Flujo actual:** AdminControlador@storeUser y @resetUserPassword persisten `temporary_password_visible`; serializeAdminUserSummary lo devuelve explícitamente. El reset además retorna `temporary_password`. Web AdminUsersSection normaliza varias variantes de password recuperable y muestra el temporal en un toast.

**Flujo seguro propuesto:** reutilizar Password::broker y las notificaciones de reset existentes, con enlace enviado al correo, no contraseña recuperable. El reset existente usa token y email, cambia el hash, revoca tokens API y dispara PasswordReset. Usuario ya tiene cast `password => hashed`. Falta probar consumo único y expiración; no se inventó otro sistema.

**Datos históricos:** **1 usuario** con temporary_password_visible no nulo ni vacío. Se obtuvo solo COUNT; no se leyeron valores ni identidades y no se modificó ese registro. No se solicitó ni se realizó limpieza automática.

**Tests:** pendientes: altas sin persistencia visible, serialización, hash, broker/reset y no reutilización. Hay consumidores web que deben migrarse conjuntamente; no se localizó consumidor móvil del campo temporal.

# BLOQUE 15 — ACEPTACIÓN PROVEEDOR

**Estado: 🟡 PARCIAL — dos implementaciones distintas; sin corrección ni prueba concurrente.**

**Idempotencia:** OperadorControlador@accept actualiza match/asignación y usa Operacion::create y timeline()->create en cada llamada, sin transacción ni bloqueo en el método. Repetirlo puede duplicar operaciones y permitir que otra aceptación sobrescriba proveedor.

**Diferencia comercial activa:**

| Ruta | Efecto actual | Consumidor |
| --- | --- | --- |
| POST /operator/requests/{flightRequest}/accept | Asigna proveedor/aeronave y crea operación confirmada + timeline | Web: familia operator de portalOperador.nucleo.js |
| POST /proveedor/solicitudes/{flightRequest}/aceptar | Asigna proveedor/aeronave, status matched y acepta **para cotizar**, sin operación | Web: familia proveedor del mismo módulo |

**Operación única:** 0 grupos actuales de operations con flight_request_id duplicado, consulta agregada. Esto no demuestra idempotencia.

**Concurrencia:** no ejecutada. Antes de unificar ambos handlers hay que decidir si aceptar para cotizar y confirmar una operación son el mismo paso. El código actual no los trata igual. El diseño propuesto es bloquear la solicitud, verificar ganador/estado y reutilizar la operación existente, con una constraint solo después de confirmar su cardinalidad y revisar historial.

**Web:** updateRequestStatus almacena el ID en curso, pero no tiene guard de entrada en esa función; debe comprobarse también el disabled de controles y un test de doble clic. No se afirma que exista ya un envío duplicado demostrado.

**Móvil:** no se localizó invocación HTTP directa de esas dos rutas; existen acciones locales de workflow. Auditoría estática sin cambios, no garantía sobre consumidores desplegados.

**Tests:** pendientes; no reutilizar el resultado de concurrencia de reservas/DocuSign como evidencia de aceptación.

# BLOQUE 16 — INTEGRIDAD HISTÓRICA

**Estado: 🟡 PARCIAL — auditoría de FKs realizada, implementación DETENIDA por regla de corte.**

**FKs revisadas:** 113 FKs vigentes cuyo padre o hija está entre users/providers/aircraft/flight_requests/quotes/reservations/reservation_contracts/payments/operations. Se guardaron todas las FKs públicas para revisar las cadenas transitivas. [Tabla hija, padre, regla actual, riesgo y propuesta](./cliente-fase1-bloques-13-18-corte-2026-09-11/foreign-keys.md).

**Cambios:** ninguno. Propuesta para las cinco referencias padre de reservations y para reservation_contracts→reservations: RESTRICT y desactivación de entidades con historial. operations→flight_requests y quotes→flight_requests necesitan el mismo análisis. No se propone SET NULL masivo que pierda trazabilidad sin snapshots.

**Riesgos concretos:** AeronaveControlador@destroy llama delete() después de autorizar proveedor; AdminControlador@destroyUser comprueba historial de sobrecargo, pero no reservas del cliente/proveedor antes de delete(). No se invocaron esos endpoints.

La migración histórica de tripulación de julio ya convirtió algunas cascadas a RESTRICT/SET NULL: se usó **pg_constraint vigente**, no una cuenta textual que incluyera down() obsoletos.

**Tests:** no se borraron fixtures ni datos reales en esta etapa. Pruebas de borrado controlado y conservación de evidencia pendientes del diseño aprobado.

# BLOQUE 17 — CSRF / CORS

**Estado: 🟡 PARCIAL — mezcla de mecanismos confirmada; sin cambios.**

**Estrategia auth actual:** TokenApiIntermediario acepta bearerToken() o cookie ambiental. AutenticacionControlador emite ambos. El resolvedor opcional del controlador cliente también acepta cookie. Web construye Authorization Bearer y permite credentials configurable; móvil usa Bearer.

**CSRF:** authCookieSameSite devuelve lax para local y tiene default none fuera de local. No se encontró validación equivalente CSRF en TokenApiIntermediario. Falta probar explotación/rechazo con requests mutantes; no se atribuye protección a CORS por sí sola.

**Estrategia propuesta:** alinear APIs con Bearer explícito, retirar dependencia ambiental solo después de comprobar consumidores de descargas/retornos; si se conserva cookie, implementar y probar un mecanismo CSRF completo. No se retiró la cookie sin acreditar compatibilidad.

**CORS:** existen tres fuentes: CorsIntermediario, HandleCors/config/cors.php y helper de errores en bootstrap/app.php. Las listas de orígenes por defecto no son idénticas. Config permite headers '*' y credentials=true, pero middleware y helper enumeran headers sin Idempotency-Key. Una preflight puede terminar en CorsIntermediario antes del otro handler.

**Idempotency-Key:** falta unificar su inclusión en preflight y errores. No se observó combinación literal Allow-Origin:* con credentials en los dos handlers explícitos; se debe prohibir también en configuración.

**Tests:** pendientes: origen permitido/rechazado, preflight, cookie mutante y Bearer web/móvil.

# BLOQUE 18 — RUTAS LEGACY

**Estado: 🟡 PARCIAL — inventario inicial, sin retiradas nuevas.**

[Inventario METHOD/ENDPOINT/CONTROLADOR/COMPORTAMIENTO/CANÓNICA/CONSUMIDORES/DECISIÓN](./cliente-fase1-bloques-13-18-corte-2026-09-11/legacy-routes.md). [Búsqueda de consumidores](./cliente-fase1-bloques-13-18-corte-2026-09-11/consumers.txt). [route:list completo](./cliente-fase1-bloques-13-18-corte-2026-09-11/routes.json).

**Divergencia confirmada:** POST /cliente/solicitudes crea directamente y hace matching; POST /client/flight-requests usa otro controlador con idempotencia, transacción y flujo moderno. Móvil aún tiene fallback activo hacia /cliente/solicitudes para creación y listado; retirarlo antes de migrar y probar rompería compatibilidad potencial.

**Rutas retiradas/migradas en esta etapa:** ninguna. Se mantienen los 410 de contratos del bloque 12 y el 410 previo de SuscripcionControlador@subscribe. Los aliases ingleses de contrato tienen consumidores de fallback y mismo handler; su mera existencia no los hace equivalentes a los flujos de solicitudes divergentes.

**Pagos/Stripe:** solo inventario de rutas y referencias; no se modificó lógica, historial ni integración. No se acreditó equivalencia de todos los aliases y no se retiraron. El móvil contiene candidatos de confirmación de pago bajo solicitudes/flight-requests que no aparecen registrados: no confundir 404 candidatos con aliases operativos.

**Tests:** pendientes después de migración de consumidores y decisión sobre aceptación.

# ARCHIVOS MODIFICADOS

Solo se creó este informe y sus anexos en docs/audits/cliente-fase1-bloques-13-18-corte-2026-09-11/. **Ningún archivo funcional de backend, web o móvil fue modificado en esta etapa.** Los cambios previos de los tres proyectos se preservan.

# MIGRACIONES

Ninguna creada ni ejecutada. No se limpió temporary_password_visible, no se alteraron FKs, pagos ni datos históricos. No se desplegó.

# PRUEBAS

- Ejecutado: php artisan route:list --json con APP_ENV=testing, DB_URL vacío y SQLite :memory:.
- Ejecutado: consulta READ ONLY de metadatos y conteos sobre la base configurada (reporta production), con timeout y rollback. [Evidencia agregada sin valores de contraseñas](./cliente-fase1-bloques-13-18-corte-2026-09-11/database-readonly.json).
- git diff --check: verificado en los tres proyectos al cerrar el informe.
- Tests focales, npm run build, dart format, flutter analyze y flutter test: **no ejecutados en esta etapa por la detención previa a implementación**. Los resultados anteriores de 9/10/12 no se presentan como validación de 13–18.
- Móvil auditado estáticamente, sin cambios por la regla de corte; **no** se declara «sin cambios requeridos», porque quedan fallbacks activos por migrar.

# FALLOS PREEXISTENTES

No se ejecutó una suite para catalogar fallos preexistentes en esta etapa. Hay modificaciones previas ajenas al alcance y no se revirtieron. Los hallazgos anteriores son de auditoría, no tests fallidos ni arreglos completados.

# RIESGOS RESTANTES

Privacidad sin lista pública uniforme; escritura/serialización de password temporal; aceptación repetible y reasignable; cascadas sobre historial; cookie ambiental sin defensa CSRF acreditada; CORS inconsistente; legacy de solicitudes con consumidor móvil activo.

## Decisiones necesarias antes de reanudar implementación

1. Revisar la propuesta concreta de RESTRICT para las FKs identificadas sobre reservas/contratos y la adaptación de borrados a desactivación. La preparación y validación deben hacerse en una base local desechable; ejecutar en producción seguiría fuera de autorización.
2. Precisar si «aceptar para cotizar» crea una operación o si la operación solo nace al confirmar la asignación. Mantener exclusividad sobre la solicitud; no convertir dos acciones distintas en aliases sin esta decisión.
3. Mantener intacto el único valor histórico de contraseña; cortar nuevas escrituras y serialización con el flujo de reset existente cuando se reanude, sin limpieza histórica implícita.

No se inició membresía anual.

VEREDICTO:

B) FASE 1 TODAVÍA NO CERRADA
