# BLOQUE 9 — RESERVA ÚNICA

Estado: ✅ CERRADO.

**Regla:** una reserva canónica por `flight_request_id`. La vía por cotización también busca por solicitud; reutilizar una reserva existente devuelve 201 compatible con el consumidor y no repite efectos de creación. El bloqueo de la solicitud y la transacción del servicio de idempotencia serializan la operación completa.

**Concurrencia:** dos procesos PHP, conexiones PostgreSQL independientes y kernel HTTP real. Pasaron tanto peticiones sin cabecera Idempotency-Key (clave derivada compartida) como dos claves diferentes. Ambas respuestas fueron 201 con el mismo ID; retry posterior recuperó la misma reserva.

**Constraint:** se mantiene UNIQUE(reservations.flight_request_id). Prueba de inserción duplicada aprobada.

**Side effects:** cada escenario creó exactamente una reserva, un contrato, una comisión, un `contract_hold` de aeronave y una auditoría. Pagos, operaciones, notificaciones, trabajos, timeline y demás tablas: delta 0. Eventos `App\Events\*` y `App\Eventos\*`: 0. Con claves diferentes hay dos registros técnicos de idempotencia; no duplican entidades de negocio. El retry tampoco agregó registros de negocio.

**Tests:** CanonicalReservationLinksTest, ClientPaymentSecurityTest, ContractAircraftLockingTest y dos escenarios PostgreSQL.

# BLOQUE 10 — DOCUSIGN

Estado: ✅ CERRADO dentro del alcance de concurrencia y estados solicitado.

| Estado | regenerate=false | regenerate=true |
| --- | --- | --- |
| created / sent / delivered / signing | Reutiliza envelope; 200 | Reutiliza envelope; 200; no reconstruye contrato/PDF |
| completed o completed_at presente | 422 CONTRACT_ALREADY_COMPLETED; sin cambios | Mismo rechazo; conserva evidencia y PDF firmado |
| expired / voided / declined / error | 422 CONTRACT_REGENERATION_REQUIRED; sin envelope nuevo | Crea uno; repetir la petición reutiliza el nuevo |
| draft sin envelope | Crea uno | Crea uno |

`draft` es el default real del esquema; los demás estados ya eran contemplados por el controlador. No se agregaron estados. `completed` se probó con ambos valores de regenerate y señales de finalización incompletas; se compararon todos los atributos y los bytes del PDF firmado.

**Ventana crítica:** el endpoint bloquea `reservations` antes de leer el contrato; cubre contrato ausente, estado actual, decisión, generación PDF, llamada fake/real y persistencia. También se bloquea `reservation_contracts`. Los otros puntos que construyen contrato usan el mismo bloqueo del padre. No hay reintento automático de la transacción con creación externa.

**Concurrencia:** dos requests HTTP simultáneos con contrato sin envelope, sin contrato previo y con expired + regenerate=true. En cada caso: dos respuestas 200, un envelope persistido, contador interproceso de `crearEnvelopeParaFirmaEmbebida()` exactamente 1 y retry reutilizado.

**Fallo recipient-view:** se conserva el envelope creado si falla la URL embebida; un retry no vuelve a crear el envelope. Regresión explícita aprobada.

**Constraints:** se conservan UNIQUE(reservation_contracts.reservation_id) y UNIQUE(docusign_envelope_id); ambas pruebas de duplicación pasan.

**Bloque 11:** no se modificó el webhook en esta sesión; sus tres regresiones pasaron. Los cambios que ya tenía al iniciar permanecen.

# BLOQUE 12 — IDs Y RUTAS

Estado: ✅ CERRADO en los consumidores accesibles del workspace.

**Rutas canónicas:** reservas usan `reservations.id`; solicitudes usan `flight_requests.id`; estado y PDF firmado usan `reservation_contracts.id`. Los nombres reales de parámetros Laravel siguen siendo `reservation`, `flightRequest` y `contract`; la semántica no depende de renombrarlos.

**Aliases retirados:** diez aliases de contrato bajo solicitudes/flight-requests devuelven 410 (ya preparados antes de esta sesión); se completa la retirada del alias `GET /cliente/solicitudes/{reservation}/payment-availability`. Once tests verifican 410.

**Consumidores migrados:**

- Web: se eliminó el fallback de disponibilidad bajo solicitudes y los fallbacks inexistentes de detalle de reserva; la firma usa reservation_id explícito. El servicio envía solo campos de firma aceptados por el backend, omitiendo HTML/snapshots prohibidos.
- Móvil `2Movilskyg/lib/core/cliente_api.dart`: consulta, firma y PDF dejan de probar aliases de contrato bajo solicitudes/flight-requests; nunca prueban un ID de solicitud en una ruta de reservas. Si solo hay solicitud, la consulta obtiene su relación reservation mediante GET canónico; no crea una reserva como efecto de lectura. El envío de firma resuelve explícitamente la reserva antes de enviar. El body no puede sobrescribir el ID canónico con campos antiguos.
- Documentación backend: aliases marcados como retirados.

Se buscaron consumidores en src, router, servicios, helpers, `.env`/`.env.example`, backend app/routes/resources/scripts/tests/docs y móvil lib/test. Las variables de rutas de contrato configuradas apuntan a rutas canónicas. `MOVIL` no contiene código; `2Movilskyg` sí fue auditado y probado. Después de migrar no quedan referencias ejecutables a los once aliases en web/móvil; quedan declaraciones 410, pruebas y documentación de retirada.

**Tests:** fixture con `reservations.id=900001` distinto de la solicitud; detalle canónico correcto y 404 en el dominio equivocado. Web verifica reservation_id y flight_request_id distintos en el evento Vue y petición HTTP. Móvil comprueba resolución de la relación, rechazo cuando falta y fallback que conserva el dominio.

# CONCURRENCIA

Base: **uberaviones_phase1_concurrency_test_20260911**, PostgreSQL local vía `/tmp`, usuario local `redaviation`, `APP_ENV=testing`, DB_URL vacío. Se creó una base nueva para esta tarea y se migró únicamente esa base. No se ejecutó concurrencia ni migración sobre producción.

1. El coordinador crea fixtures de prueba y toma `FOR UPDATE` sobre flight_requests (reserva) o reservations (firma).
2. Arranca dos `proc_open` independientes, con PHP y conexión propios, token válido y kernel HTTP completo.
3. Cada worker publica `pg_backend_pid()`. El coordinador consulta `pg_stat_activity` y exige **dos sesiones con wait_event_type=Lock** antes de liberar la fila. Esto demuestra solapamiento real, no dos requests secuenciales. Una petición puede esperar en el registro de idempotencia bloqueado por la otra.
4. Libera el bloqueo; espera resultados; verifica estados 200/201, IDs compartidos y contador de envelopes con `flock`.
5. Compara conteos antes/después de todas las tablas públicas y ejecuta un tercer proceso para el retry. Captura eventos de dominio sin sustituir sus listeners.

| Escenario | HTTP A/B | Resultado | Evidencia |
| --- | --- | --- | --- |
| Reserva sin cabecera | 201 / 201 | 1 reserva; sin efectos duplicados | [JSON](./cliente-fase1-bloques-9-10-12-2026-09-11/reservation-default.json) |
| Reserva con claves distintas | 201 / 201 | 1 reserva; sin efectos duplicados | [JSON](./cliente-fase1-bloques-9-10-12-2026-09-11/reservation-different-keys.json) |
| DocuSign contrato sin envelope | 200 / 200 | 1 creación de envelope | [JSON](./cliente-fase1-bloques-9-10-12-2026-09-11/docusign-default.json) |
| DocuSign sin contrato | 200 / 200 | 1 contrato y 1 envelope | [JSON](./cliente-fase1-bloques-9-10-12-2026-09-11/docusign-missing-contract.json) |
| DocuSign expired + regenerate | 200 / 200 | 1 envelope nuevo | [JSON](./cliente-fase1-bloques-9-10-12-2026-09-11/docusign-regenerate.json) |

Los JSON contienen los PID PostgreSQL, bloqueadores, respuestas, retry y deltas de todas las tablas. Todos tienen `failures: []`. DocuSign y generación PDF fueron fakes; nunca se llamó a DocuSign real.

Reproducción desde backend (base exclusiva ya creada y migrada):

```sh
export APP_ENV=testing DB_URL= DB_CONNECTION=pgsql DB_HOST=/tmp DB_PORT=5432
export DB_DATABASE=uberaviones_phase1_concurrency_test_20260911 DB_USERNAME=redaviation DB_PASSWORD=
export DB_CONNECT_TIMEOUT=0 DB_PERSISTENT=false LOG_CHANNEL=stderr CACHE_STORE=array SESSION_DRIVER=array
php scripts/concurrency/reservation_concurrency_test.php default
php scripts/concurrency/reservation_concurrency_test.php different-keys
php scripts/concurrency/docusign_concurrency_test.php default
php scripts/concurrency/docusign_concurrency_test.php missing-contract
php scripts/concurrency/docusign_concurrency_test.php regenerate
```

La guía backend `scripts/concurrency/README.md` explica la preparación de una base NUEVA. Los entrypoints usan `http_worker.php`; no usan los antiguos workers que invocaban el controlador directamente. La protección rechaza producción, hosts no locales, DB_URL y nombres fuera del patrón permitido. Deadline de coordinación: 12s; statement_timeout: 20s; excepciones y aserciones fallidas devuelven exit 1.

# ENDPOINTS FINALES

Prefijo `/api/v1` en todos los siguientes:

| Method | Endpoint | ID esperado | Consumidor |
| --- | --- | --- | --- |
| POST | /cliente/reservas | Body flight_request_id o quote_id | Web y móvil |
| GET | /cliente/reservas/{reservation} | reservations.id | Web y móvil |
| GET | /cliente/reservas/{reservation}/contrato | reservations.id | Web y móvil |
| GET | /cliente/reservas/{reservation}/contrato/pdf | reservations.id | Web y móvil |
| POST | /cliente/reservas/{reservation}/contrato/generar | reservations.id | Backend/tests |
| POST | /cliente/reservas/{reservation}/contrato/docusign | reservations.id | Web y móvil |
| GET/POST | /client/reservations/{reservation}/contract[/*] | reservations.id | Fallback inglés; ver inventario |
| GET | /client/flight-requests/{flightRequest} | flight_requests.id | Web y móvil |
| GET | /cliente/solicitudes/{flightRequest} | flight_requests.id | API legacy semánticamente correcta |
| GET | /cliente/contratos/{contract}/estado | reservation_contracts.id | Web y móvil |
| GET | /cliente/contratos/{contract}/pdf-firmado | reservation_contracts.id | Web |

## Inventario obligatorio de rutas registradas

Fuente: `php artisan route:list --json`; [salida completa](./cliente-fase1-bloques-9-10-12-2026-09-11/routes.json). El uso se refiere a referencias de código accesible, no a telemetría de clientes desplegados. Las rutas de pago se inventarían sin alterar su implementación.

| METHOD | ENDPOINT | NOMBRE DEL PARÁMETRO | ID REAL QUE ESPERA | CONTROLADOR | CONSUMIDOR | USO ACTIVO | DECISIÓN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET|HEAD | `/api/v1/admin/contracts` | — | — | `RedAviation\AdminControlador@contracts` | AdminContractsSection | Sí | Conservar; dominio correcto |
| POST | `/api/v1/client/flight-requests` | — | — | `RedAviation\ClienteControlador@storeFlightRequest` | clientBookingImplementation; cliente_api.dart; tests | Sí | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/client/flight-requests` | — | — | `RedAviation\ClienteControlador@indexFlightRequests` | clientBookingImplementation; cliente_api.dart; tests | Sí | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/client/flight-requests/{flightRequest}` | flightRequest | flight_requests.id | `RedAviation\ClienteControlador@showFlightRequest` | clientBookingImplementation; cliente_api.dart; tests | Sí | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/client/flight-requests/{flightRequest}/flight-brief` | flightRequest | flight_requests.id | `RedAviation\ClienteControlador@flightBrief` | clientBookingImplementation; cliente_api.dart; tests | Sí | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/client/flight-requests/{reservation}/contract` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| POST | `/api/v1/client/flight-requests/{reservation}/contract/docusign` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| POST | `/api/v1/client/flight-requests/{reservation}/contract/generate` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| GET|HEAD | `/api/v1/client/flight-requests/{reservation}/contract/pdf` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| POST | `/api/v1/client/flight-requests/{reservation}/contract/sign` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| GET|HEAD | `/api/v1/client/reservations/{reservation}/contract` | reservation | reservations.id | `ReservaControlador@showContract` | contractApi.js / cliente_api.dart según acción; fallback inglés | Sí para firma/consulta/PDF; generar sin llamada localizada | Conservar; dominio correcto |
| POST | `/api/v1/client/reservations/{reservation}/contract/docusign` | reservation | reservations.id | `ReservaControlador@startEmbeddedSigning` | contractApi.js / cliente_api.dart según acción; fallback inglés | Sí para firma/consulta/PDF; generar sin llamada localizada | Conservar; dominio correcto |
| POST | `/api/v1/client/reservations/{reservation}/contract/generate` | reservation | reservations.id | `ReservaControlador@generateContract` | contractApi.js / cliente_api.dart según acción; fallback inglés | Sí para firma/consulta/PDF; generar sin llamada localizada | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/client/reservations/{reservation}/contract/pdf` | reservation | reservations.id | `ReservaControlador@downloadContractPdf` | contractApi.js / cliente_api.dart según acción; fallback inglés | Sí para firma/consulta/PDF; generar sin llamada localizada | Conservar; dominio correcto |
| POST | `/api/v1/client/reservations/{reservation}/contract/sign` | reservation | reservations.id | `ReservaControlador@signContract` | contractApi.js / cliente_api.dart según acción; fallback inglés | Sí para firma/consulta/PDF; generar sin llamada localizada | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/contratos/{contract}/estado` | contract | reservation_contracts.id | `ReservaControlador@showContractStatusById` | contractApi.js; móvil getClientContractStatus; callbacks | Sí | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/contratos/{contract}/pdf-firmado` | contract | reservation_contracts.id | `ReservaControlador@downloadSignedContractPdf` | contractApi.js; móvil getClientContractStatus; callbacks | Sí | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas` | — | — | `ReservaControlador@index` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas` | — | Body flight_request_id → flight_requests.id; quote_id → quotes.id | `ReservaControlador@store` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas/{reservation}` | reservation | reservations.id | `ReservaControlador@show` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas/{reservation}/autorizacion-pago` | reservation | reservations.id | `ReservaControlador@paymentAuthorization` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/calificar` | reservation | reservations.id | `ReservaControlador@rateService` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/cancel` | reservation | reservations.id | `ReservaControlador@cancel` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas/{reservation}/contrato` | reservation | reservations.id | `ReservaControlador@showContract` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/contrato/docusign` | reservation | reservations.id | `ReservaControlador@startEmbeddedSigning` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/contrato/firmar` | reservation | reservations.id | `ReservaControlador@signContract` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/contrato/generar` | reservation | reservations.id | `ReservaControlador@generateContract` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas/{reservation}/contrato/pdf` | reservation | reservations.id | `ReservaControlador@downloadContractPdf` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas/{reservation}/operacion` | reservation | reservations.id | `ReservaControlador@operation` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/pagar` | reservation | reservations.id | `PagoControlador@storeReservaPago` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/pago/confirmar` | reservation | reservations.id | `StripePagoControlador@confirmReservationPayment` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas/{reservation}/payment-authorization` | reservation | reservations.id | `ReservaControlador@paymentAuthorization` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/reservas/{reservation}/payment-availability` | reservation | reservations.id | `ReservaControlador@paymentAvailability` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| POST | `/api/v1/cliente/reservas/{reservation}/reintentar-pago` | reservation | reservations.id | `PagoControlador@retryReservaPago` | clientBookingImplementation / portal cliente; cliente_api.dart; tests | Sí (según operación) | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/solicitudes` | — | — | `SolicitudVueloControlador@index` | API legacy de solicitudes; tests backend | Ruta vigente; sin consumidor web/móvil directo localizado | Conservar; dominio correcto |
| POST | `/api/v1/cliente/solicitudes` | — | — | `SolicitudVueloControlador@store` | API legacy de solicitudes; tests backend | Ruta vigente; sin consumidor web/móvil directo localizado | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/solicitudes/{flightRequest}` | flightRequest | flight_requests.id | `SolicitudVueloControlador@show` | API legacy de solicitudes; tests backend | Ruta vigente; sin consumidor web/móvil directo localizado | Conservar; dominio correcto |
| GET|HEAD | `/api/v1/cliente/solicitudes/{reservation}/contrato` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| POST | `/api/v1/cliente/solicitudes/{reservation}/contrato/docusign` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| POST | `/api/v1/cliente/solicitudes/{reservation}/contrato/firmar` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| POST | `/api/v1/cliente/solicitudes/{reservation}/contrato/generar` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| GET|HEAD | `/api/v1/cliente/solicitudes/{reservation}/contrato/pdf` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Móvil legacy migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| GET|HEAD | `/api/v1/cliente/solicitudes/{reservation}/payment-availability` | reservation | Ninguno: 410; antes reservations.id | `ReservaControlador@contractAliasRetired` | Web fallback migrado; CanonicalIdRoutingTest | No en código actual; test 410 | 410; consumidor migrado |
| POST | `/api/v1/public/docusign/webhook` | — | Body envelopeId → docusign_envelope_id | `DocuSignWebhookControlador@handle` | DocuSign Connect; tests HMAC | Integración configurada; regresión probada | Conservar; dominio correcto |

Los fallbacks restantes a endpoints no registrados (por ejemplo `/contract/download`, `/contracts/{id}/status` y alternativas de pago) no son aliases backend: responden 404. No mezclan por sí mismos el dominio de IDs. Las alternativas de pago permanecieron fuera del alcance de cambios.

# MIGRACIONES

No se agregó ni se modificó ninguna migración en esta sesión. Se conserva `2026_09_11_120000_enforce_canonical_reservation_and_contract_links.php`, existente al inicio, con los tres UNIQUE requeridos.

`php artisan migrate:fresh --env=testing` pasó sobre la base PostgreSQL local nueva. Tras las pruebas se ejecutó también con `DB_CONNECTION=sqlite DB_DATABASE=:memory: DB_URL=`; [log](./cliente-fase1-bloques-9-10-12-2026-09-11/migrate-fresh-testing.log). No se ejecutó migrate:fresh usando la conexión normal de `.env`.

## Duplicados actuales

La conexión normal del proyecto reportó `environment=production`, PostgreSQL. Se ejecutaron exclusivamente tres SELECT agrupados, dentro de una transacción marcada **READ ONLY** y terminada con rollback. No se modificaron datos ni se hicieron pruebas contra esa base.

| Columna | Grupos duplicados |
| --- | ---: |
| reservations.flight_request_id | 0 |
| reservation_contracts.reservation_id | 0 |
| reservation_contracts.docusign_envelope_id | 0 |

Conteo excluye NULL, igual que la semántica UNIQUE de PostgreSQL. Resultado observado el 2026-09-11 durante esta sesión; no implica garantía permanente sobre escrituras futuras fuera de las constraints.

# PRUEBAS

- Backend: **56 tests, 215 assertions**, todos aprobados. Filtro: CanonicalReservationLinksTest, CanonicalIdRoutingTest, DocuSignEnvelopeLifecycleTest, ClientPaymentSecurityTest, DocuSignWebhookSecurityTest y ContractAircraftLockingTest.
- Concurrencia PostgreSQL: **5 escenarios aprobados**, todos con solapamiento observado y retry.
- Web: **88 tests en 6 archivos**, aprobados: contractApi, VistaContratoCliente, clientBookingApi, PortalClienteReservationScreen, PortalClienteTripsScreen y ContractResultView.
- Móvil: **8 tests**, aprobados: client_contract_ids_test.dart y cliente_api_fallback_test.dart.
- `npm run build`: aprobado; [log](./cliente-fase1-bloques-9-10-12-2026-09-11/frontend-build.log).
- `php artisan route:list`: aprobado; JSON adjunto.
- `php artisan migrate:fresh --env=testing`: aprobado con conexiones explícitas de pruebas.
- `git diff --check`: aprobado en backend, frontend y móvil.

Los fallos encontrados durante implementación se corrigieron antes del resultado final: fixture ID descartado por mass assignment, compatibilidad 201, hold omitido en conteo esperado y fixture DocuSign NULL cuando el esquema exige draft. El script también se endureció para que una excepción no termine con código 0.

# FALLOS PREEXISTENTES

No quedaron tests focalizados fallidos. Build informa chunks mayores de 500 kB; Vitest muestra aviso de `--localstorage-file`. No se abordaron ajustes de bundling ni avisos ajenos al alcance. No se ejecutó ni se afirma haber validado la suite completa del repositorio.

Los tres repositorios ya tenían modificaciones ajenas a estos bloques (registro/KYC, roles, pagos y otras). Se preservaron. El diff global incluye esos cambios previos; no deben atribuirse a esta sesión.

# RIESGOS RESTANTES

- El cierre acredita la concurrencia y los estados especificados. No demuestra atomicidad distribuida ante un crash entre la creación externa del envelope y el commit PostgreSQL, ni ante un timeout remoto con resultado desconocido. Resolver ese escenario requiere reconciliación/idempotencia del proveedor; no se probó con DocuSign real.
- Se mantiene la transacción mientras responde DocuSign para serializar los clics. Esto puede prolongar la espera del segundo request si el proveedor es lento.
- La migración de consumidores está hecha y validada en código local. No se desplegó backend/web ni se publicó una app móvil. Coordinar la distribución de la versión móvil antes de retirar compatibilidad en entornos desplegados; no se verificó telemetría de versiones históricas externas al workspace.
- La lectura de duplicados fue puntual y de solo lectura; no se aplicaron constraints nuevas ni cambios históricos en producción.

No se inició bloque 13 ni membresía anual.

VEREDICTO:

A) BLOQUES 9, 10 Y 12 CERRADOS — LISTO PARA BLOQUE 13
