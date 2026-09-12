# BLOQUE 13 — PRIVACIDAD

Estado: 🟡 PARCIAL.

Aplicado: ClientPublicRepresentation con allowlist de proveedor y aeronave; ApiResponsePrivacy filtra respuestas cliente y passwords recuperables en JSON API. Campos bloqueados: usuario interno del proveedor, RFC/contactos/documentos/notas/onboarding, dispatch/security notes y contraseñas. Proveedor público: id, name, company_name, commercial_name.

Tests de reservas y datos privados pasan; falta ampliar evidencia de todas las serializaciones, documentos y contactos anidados. Web y móvil compilan/prueban con los cambios, pero eso no demuestra por sí solo cobertura exhaustiva de privacidad.

# BLOQUE 14 — PASSWORDS

Estado: ✅ CERRADO para nuevas escrituras y serialización del flujo revisado.

Nuevas altas: no guardan temporary_password_visible; password permanece hash. Alta sin password usa Password::broker; reset administrativo envía enlace sin revelar ni cambiar una contraseña temporal recuperable. Modelo rechaza forceFill del campo; JSON API lo elimina. Web no muestra passwords antiguas y presenta recuperación.

Históricos: último conteo autorizado anterior = **1 registro**, sin revelar su valor. No se volvió a consultar producción en esta ejecución ni se limpió ese registro. El test demuestra que ocultar el campo no modifica su valor histórico.

Tests: alta proveedor, hash, enlace broker, reset y rechazo de reutilización, bloqueo de escritura y ausencia en respuestas aprobados; ClientAuthSecurityTest aprobado.

# BLOQUE 15 — PROVEEDOR

Estado: 🟡 PARCIAL; backend concurrente validado, cobertura de consumidor por completar.

Aplicado ProviderAcceptanceService: transacción, lock de flight_requests y match, proveedor exclusivo, rechazo de match no vigente, reutilización de operación. Conserva dos acciones documentadas: proveedor acepta para cotizar sin crear operación; operador crea operación una sola vez. Se añadió UNIQUE operations.flight_request_id en migración local. Web tiene guard de acción en curso; falta test específico de doble clic sobre ese handler.

**Concurrencia REAL aprobada:** coordinador bloquea la solicitud y exige dos PID PostgreSQL con wait_event_type=Lock antes de liberarla. Dos procesos PHP ejecutan kernel HTTP completo con tokens.

| Escenario | HTTP | Operaciones | Timeline | Retry |
| --- | --- | ---: | ---: | --- |
| Mismo proveedor | 200 / 200 | 1 | 1 | 200, mismo ID |
| Dos proveedores | 200 / 409 | 1 | 1 | 200 para ganador, mismo ID |

[JSON con PID y bloqueos](./accept-concurrency.json). [Script reproducible](./accept-concurrency.php), actualmente referencia el bootstrap local del backend. Ninguna llamada real a integraciones.

# BLOQUE 16 — HISTORIAL

Estado: 🟡 PARCIAL — protección aplicada y pruebas locales parciales.

Migración nueva 2026_09_12_120000_preserve_client_commercial_history.php: 11 referencias concretas pasan a RESTRICT en PostgreSQL (reservas→usuarios/proveedores/aeronaves/solicitudes/cotizaciones, contrato→reserva, operación→solicitud, cotización→solicitud, solicitud→usuario, proveedor→usuario, aeronave→proveedor). Añade unique de operación por solicitud y detiene ante duplicados; no limpia filas. Guardas de borrado devuelven 409 para usuario/aeronave con historial.

SQLite encontró un error al reconstruir defaults del esquema antiguo; la vía SQLite usa triggers BEFORE DELETE equivalentes, sin reconstruir tablas. Tests de conservación de reserva/contrato al intentar borrar padres aprobados. Falta evidencia explícita de conservación completa de pagos y detalles financieros bajo PostgreSQL; no cerrar todo el inventario por estos tests limitados.

**DB usada: uberaviones_phase1_concurrency_test_20260912. ENTORNO: testing. HOST: /tmp. NO PRODUCCIÓN.** Base nueva, migraciones con APP_ENV=testing, DB_URL vacío y DB_CONNECTION=pgsql explícitos. [Log migración](./postgres-migration.log). No se ejecutó migrate:fresh sobre datos reales. Down rechaza revertir a cascadas sin revisión explícita.

# BLOQUE 17 — AUTH / CSRF / CORS

Estado: 🟡 PARCIAL — **1 test CORS fallido**.

Auth canónica aplicada: Authorization Bearer. TokenApiIntermediario y resolvedor opcional cliente ya no autentican por cookie; login devuelve token y expira cookie antigua. Web usa credentials=omit. Móvil ya envía Bearer.

Tests backend de cookie incapaz de mutar perfil y Bearer válido aprobados. Web valida token explícito, omisión de cookies, 401, sesión y store auth. Móvil pasó suite completa, incluidos reingreso con Bearer y limpieza ante token inválido. No hay evidencia nueva suficiente para declarar cada ruta de descargas y retorno autenticadas completamente revisada.

CORS: configuración tiene origins explícitos, Authorization/Content-Type/Idempotency-Key, supports_credentials=false. Persisten HandleCors y CorsIntermediario y el helper de errores. La prueba de origen no autorizado falla porque encuentra Access-Control-Allow-Origin inesperado después de varias preflights. Falta aislar/solucionar la inconsistencia y dejar verde la regresión; no se ha demostrado aquí una explotación real.

Se intentó consolidar CORS en el middleware explícito y configuración común, pero **el comando no se ejecutó**: revisión automática bloqueada por límite de uso. No se aplicó por otra vía.

# BLOQUE 18 — LEGACY

Estado: 🟡 PARCIAL.

| METHOD | LEGACY ENDPOINT | CONSUMIDOR ANTIGUO | CANÓNICA | MIGRADO | RESULTADO |
| --- | --- | --- | --- | --- | --- |
| GET | /cliente/solicitudes | cliente_api.dart listado | /client/flight-requests | Sí | 410 y test aprobado |
| POST | /cliente/solicitudes | cliente_api.dart creación | /client/flight-requests | Sí | 410 y test aprobado |
| GET | /cliente/solicitudes/{flightRequest} | API legacy | /client/flight-requests/{flightRequest} | Sin llamada directa localizada | 410 y test aprobado |

Hallazgo restante: lib/services/servicio_cotizaciones.dart contiene POST /cliente/solicitudes con itinerario PENDING; búsqueda de QuoteService/createQuote no localizó consumidores en lib/test. Se conserva pendiente porque el comando para retirarlo fue rechazado. No afirmar cero referencias legacy. También quedan candidatos móviles de confirmación de pagos bajo solicitudes; no se modificaron pagos para limpiar esos fallbacks.

Los 410 de contratos del bloque 12 permanecen. Aliases de contrato con mismo handler y consumidores activos no se retiraron. Auditoría completa de aliases de pagos/suscripciones y la retirada restante no concluida.

# COMPATIBILIDAD

BACKEND: 68 tests focalizados aprobados, 1 fallo CORS. No se ocultó el fallo.
WEB: 107 tests en 10 archivos aprobados; build aprobado.
MÓVIL: dart format .: 196 archivos, 2 cambiados; flutter analyze: sin problemas; flutter test: 217 aprobados y 1 omitido. El omitido no se cuenta como aprobado.

# ARCHIVOS MODIFICADOS

Backend: ClientPublicRepresentation, ApiResponsePrivacy, bootstrap/app.php, Usuario, AdminControlador, TokenApiIntermediario, ClienteControlador, AutenticacionControlador, config/cors.php, CorsIntermediario, LegacyClientRoutesControlador, api_v1_cliente.php, ProviderAcceptanceService, OperadorControlador, ProveedorControlador, CommercialHistoryGuard, AeronaveControlador, ClientPhaseOneHardeningTest y migración 2026_09_12_120000.

Web: AdminUsersSection.vue, api.js, portalOperador.nucleo.js, AdminUsersSection.spec.js, apiBearerCredentials.spec.js.
Móvil: cliente_api.dart y formato de client_contract_ids_test.dart.
Documentación/evidencia: esta carpeta. Los repositorios tenían cambios previos ajenos a estos bloques; se preservaron.

backend-movil-pendiente.patch es la propuesta ORIGINAL archivada: ya se aplicó con ajustes posteriores; no reutilizarla sobre el árbol actual.

# MIGRACIONES

Una migración nueva, aplicada únicamente en PostgreSQL local nuevo y en SQLite de tests. No hubo despliegue, conexión a producción en esta ejecución, cambios reales ni limpieza histórica de contraseñas. La migración necesita revisión operativa antes de cualquier despliegue futuro, no autorizado.

# PRUEBAS

- [Backend: 68 aprobados, 1 fallo](./backend-tests.log).
- [Concurrencia: ambos escenarios aprobados](./accept-concurrency.json).
- [Web: 107 aprobados](./web-tests.log).
- [Build web aprobado](./web-build.log).
- [Dart format](./dart-format.log).
- [Flutter analyze sin problemas](./flutter-analyze.log).
- [Flutter test: 217 aprobados, 1 omitido](./flutter-test.log).
- [route:list final aprobado](./routes-final.json); git diff --check aprobado en backend, web y móvil.

Fallos corregidos de esta implementación: defaults SQLite al reconstruir FKs y SELECT * con GROUP BY en precondición PostgreSQL. Fallo CORS todavía presente. No atribuirlo a un problema preexistente.

# FALLOS PREEXISTENTES

Build advierte chunks >500 kB; Vitest avisa --localstorage-file; la suite móvil contiene un omitido. No se corrigieron avisos ajenos al alcance. No se ejecutó suite backend completa.

# RIESGOS RESTANTES

CORS sin cierre; privacidad sin cobertura exhaustiva; falta prueba del guard web de doble clic; integridad de pagos/detalles sin validación exhaustiva PostgreSQL; helper móvil con endpoint retirado y aliases de pago pendientes de revisión. No desplegar este conjunto como una FASE 1 cerrada.

## Bloqueo de herramienta

El último intento de corrección focal fue rechazado por revisión automática: **“You've hit your usage limit”**, con indicación de reintentar a las 2:39 PM o ampliar cuota. Esto no es falta de autorización del usuario: la autorización local ya está otorgada. No se intentó eludir el bloqueo. La corrección de CORS sigue sin aplicar.

VEREDICTO:

B) FASE 1 TODAVÍA NO CERRADA
