# Estado de bloques 2 y 3 — 2026-09-11

Estado: cambios aplicados en backend, web y móvil; cierre de validación pendiente. No desplegado, sin migraciones ni cambios a usuarios o datos reales. Los bloques 4–18 no se han ejecutado.

## Bloque 2 — KYC

**Causa raíz:** el registro persistía identidad y puntuaciones enviadas por el cliente. La detección de un rostro de buena calidad devolvía identidad aprobada. Web y móvil dependían de esa aprobación para avanzar.

**Backend:** las nuevas altas quedan `pending`, con `identity_verified=false` y validación requerida. Se descartan puntuaciones y decisiones biométricas enviadas por el cliente. La respuesta distingue `user_created`, `registration_status` e `identity.status`. La detección devuelve `captureAccepted` separado de identidad. Documentos y selfie conservan almacenamiento privado.

**Web:** permite continuar con captura aceptable e identidad pendiente, elimina el envío de puntuaciones y decisiones de identidad y distingue pendiente/aprobada/rechazada al registrar.

**Móvil:** deja de exigir `approved` al recibir una selfie guardada; acepta `pending`, `review_required`, `approved` y `rejected`. Conserva comprobaciones de usuario, documento y referencia del archivo. Muestra el estado de identidad separado del resultado de registro.

**Tests:** pasan las pruebas nuevas de registro sin selfie, con selfie e inyección de identidad/roles. Pasa la nueva prueba web y las ocho pruebas móviles de autenticación.

**Estado:** falta aplicar y ejecutar el parche final de pruebas de detección facial y actualizar la expectativa anterior de aprobación automática en PlataformaVuelosApiTest. Ese fallo esperado por cambio de contrato no es preexistente.

## Bloque 3 — Roles

**Causa raíz:** el móvil registraba sobrecargo como `provider` con `operational_role=sobrecargo`, evitando la validación AFAC. La unión PHP de atributos también permitía prevalecer al rol del payload.

**Backend:** nuevo endpoint público `/api/v1/crew/register`; crea cliente con solicitud pendiente en `profile.tax_data.crew_application`, sin rol operacional. Conserva comprobación de número, OCR y estado AFAC, y guarda licencia privada cuando se adjunta. La normalización deja de convertir licencias en INE. `/auth/register` rechaza provider/admin/operator y no otorga roles por `operational_role` ni `roles`. El registro proveedor conserva su endpoint específico.

**Web y móvil:** sobrecargo utiliza `/crew/register` y recibe mensaje de solicitud pendiente. El rol efectivo queda cliente hasta autorización administrativa.

**Tests:** pasa candidatura AFAC válida sin permisos y rechazo sin evidencia AFAC; pasan intentos de inyección de roles.

**Estado:** falta terminar la comprobación integral de revisión administrativa, conservación de la licencia y prueba móvil específica de candidatura. No se ha acreditado un flujo completo de aprobación KYC administrativa; no se debe presentar como finalizado.

## Compatibilidad

- Cliente: cuenta creada con identidad pendiente, sin permisos operacionales.
- Selfie: guardar archivo permite completar registro, no aprueba identidad.
- Pendiente y rechazada: no convierten una creación de cuenta exitosa en fallo de registro.
- Aprobada: los clientes pueden representar ese resultado emitido por el backend; no lo deciden.
- Sobrecargo: candidatura pendiente; no acceso operacional automático.
- Apps antiguas que dependan de `approved` o usen provider + operational_role requieren actualización coordinada. No se ha desplegado.

## Archivos modificados

Backend:
- app/Http/Controladores/AutenticacionControlador.php
- app/Http/Controladores/BiometricControlador.php
- routes/api_v1_publico.php
- tests/Feature/RegistrationIdentitySecurityTest.php
- Bloque 1 anterior: app/Http/Controladores/SuscripcionControlador.php y tests/Feature/ClientLegacySubscriptionSecurityTest.php

Web:
- src/views/RegisterView.vue
- src/features/register/RegisterIneStep.vue
- src/__tests__/RegisterView.spec.js
- Este informe.

Móvil:
- lib/core/cliente_api.dart
- lib/providers/proveedor_autenticacion.dart
- lib/screens/auth/pantalla_registro_cliente.dart
- lib/screens/auth/pantalla_registro_sobrecargo.dart
- test/providers/auth_provider_test.dart

## Validación ejecutada

- Backend focal bloques 1–3: 5 pruebas, 32 aserciones, todas pasan; SQLite en memoria y Storage::fake.
- Backend route:list: ejecutado antes de los cambios 2–3; repetición con nuevas rutas bloqueada.
- Web build: pasa (advertencia de tamaño de chunks).
- Web suite: 521 pasan, 7 fallan, 528 total. Nueva prueba pendiente pasa.
- Web focal final registro pendiente: 1 pasa, 1 omitida por filtro.
- Oxlint sin --fix: 31 errores preexistentes, mismos diagnósticos (orden variable).
- ESLint sin --fix: 22 errores preexistentes, mismos diagnósticos (cambian números de línea).
- Se usaron equivalentes no mutantes de lint: npm run lint activa --fix sobre todo el repositorio y causaría limpieza fuera de alcance.
- Flutter analyze: sin problemas.
- Flutter test: 213 pasan, 1 omitida.
- Dart format: archivos modificados formateados; comprobación global sin escritura, 195 archivos, 0 cambios.
- git diff --check: pasa en los tres repositorios.

## Fallos preexistentes web

Se compararon los registros de la ejecución anterior a cualquier cambio web con la ejecución actual. Coinciden exactamente:

- CrewEvidence.spec.js: tres casos de selección/subida/persistencia.
- CrewNotificationCenter.spec.js: notificaciones críticas sin leer.
- PortalClienteVista.spec.js: salida del pago con acceso ya activo.
- RegisterView.spec.js: texto del error de correo del proveedor.
- providerFlightNotifications.spec.js: reconciliación Echo y HTTP duplicados.

No se corrigieron estos fallos ni los diagnósticos de lint ajenos al cambio.

## Pendientes y bloqueo

La revisión automática rechazó aplicar `/private/tmp/registration-tests2.patch` y ejecutar la validación ampliada del backend por límite de uso. El parche está preparado, pero NO aplicado. Contiene la actualización de expectativas KYC anteriores, la comprobación de conservación de licencia y una prueba de AWS simulado que garantiza que una buena detección no aprueba identidad.

Falta aplicar ese parche con autorización de ejecución disponible, ejecutar la validación focal ampliada, revisar rutas y completar los puntos de revisión administrativa/candidatura citados arriba. No se deben iniciar los bloques 4–18 como si 2–3 estuvieran cerrados.

No hubo cambios a roles existentes ni a estados KYC históricos. La evidencia OCR AFAC existente sigue siendo entrada del solicitante; por eso no concede autorización operacional.

---

# Cierre formal solicitado — revisión final del 11 de septiembre

Esta sección sustituye el estado provisional y el bloqueo por límite de uso descritos arriba. La ejecución volvió a estar disponible y el parche pendiente fue aplicado. No se implementaron los bloques 4–18 ni se construyó un flujo administrativo nuevo.

## CIERRE BLOQUE 2 — KYC

**Estado: 🟡 PARCIAL.** La protección del registro está validada; el ciclo de aprobación final no está completo.

**Evidencia:** `AutenticacionControlador::register` decide `pending` y `identity_verified=false`; descarta `identity_verified=true`, `identity_verification_status=approved`, `face_match_score` y `liveness_score` del solicitante. Los resultados se guardan en `users` y `identity_verifications`; `profiles.identity_validation_required` queda verdadero. Los scores de comparación y liveness quedan nulos: actualmente no hay un verificador confiable implementado que los calcule en este flujo. No significan cero ni una validación fallida.

`BiometricControlador::detectFace` usa AWS Rekognition para detectar rostro y evaluar calidad/pose. `captureAccepted=true` no cambia la identidad a aprobada. Esa respuesta de captura no equivale a comparación documental ni prueba de vida. El registro tampoco considera confiables los valores que el navegador reenvía.

**Fuente de aprobación final:** no se encontró un endpoint implementado de aprobación/rechazo de identidad para este nuevo flujo. Los endpoints administrativos consultan la identidad, pero no completan esa transición. No debe afirmarse que existe una validación KYC final solo porque se almacenaron archivos o se detectó un rostro.

**Tests:** registro sin selfie y con selfie, claims de aprobación y puntuaciones manipuladas, persistencia privada, rollback de almacenamiento, enlaces firmados y detección facial de buena calidad sin aprobación. Pasan dentro de las 26 pruebas focalizadas. Web: prueba existente de registro pendiente pasa. Móvil: las ocho pruebas de autenticación pasan, incluida identidad pendiente con selfie guardada.

**Riesgos restantes:** falta definir e implementar la decisión confiable de aprobación/rechazo, sus permisos, evidencia y trazabilidad. La suite completa no terminó por memoria; el punto exacto se documenta abajo.

## CIERRE BLOQUE 3 — ROLES

**Estado: 🟡 PARCIAL.** La no escalación pública está validada; falta la gestión completa de candidaturas.

**Evidencia y tests:**

- `role=client`, `operational_role=sobrecargo`, `roles=[admin,provider]`: crea cliente sin permisos operacionales.
- `operational_role=admin` y `operational_role=operator`: respuesta 422.
- `role=admin`, `role=operator` y `role=provider` en `/auth/register`: respuesta 422; proveedor tiene endpoint separado.
- `role=sobrecargo`, con AFAC y `roles` privilegiados: crea candidato cliente, sin privilegios.
- `/crew/register` sin AFAC: 422; con evidencia AFAC: cuenta cliente, candidatura pendiente y licencia privada conservada.
- Candidato intenta `PUT /api/v1/admin/users/{id}` para asignar sobrecargo: 403.
- Administrador realiza la misma asignación: 200 y rol efectivo sobrecargo. La prueba demuestra que la candidatura queda `pending` y el KYC no aprobado: es una caracterización de la brecha, no un flujo completo validado.

**Riesgos restantes:** no hay bandeja de candidaturas ni transición de solicitud aprobada/rechazada conectada al rol; la asignación administrativa genérica no exige AFAC/KYC. No se implementó una solución grande porque la instrucción fue reportar este faltante.

## FLUJO ADMIN SOBRECARGO

```text
POST /api/v1/crew/register
  ↓ AFAC: tipo licencia, número, marcadores OCR y estado scanned/partial
Cuenta cliente + profiles.tax_data.crew_application.status=pending
  ↓
REVISIÓN ESPECÍFICA DE CANDIDATURA: FALTA
  ↓
APROBACIÓN / RECHAZO DE SOLICITUD: FALTA
  ↓
Existe asignación genérica de rol por Admin, pero no completa las etapas anteriores
```

### Qué puede ver Admin

El usuario existe en la administración general de usuarios. `GET /api/v1/admin/users/{id}` resuelve efectivamente a `AdministradorControlador::showUsuario` y devuelve el perfil completo: `tax_data.crew_application`, tipo/número de documento, OCR/estado del escaneo, referencias de licencia y datos KYC/biométricos. La vista `src/features/admin/AdminUsersSection.vue` consulta este detalle y presenta información de identidad. No se encontró una presentación específica de la candidatura ni descarga administrativa dedicada de `crew_application.license_path`.

El directorio `GET /api/v1/admin/sobrecargos` y su alias `/admin/crew` usan `RedAviation/AdminControlador::sobrecargos` (línea 1289). Filtran por rol sobrecargo ya asignado: **el candidato pendiente no aparece**. La prueba confirma su exclusión.

### Aprobación y rechazo visibles en el directorio

`src/features/admin/AdminPortal.vue:2680` implementa `updateCrewValidation`; `approveCrew` (2708) y `rejectCrew` (2728) llaman a `PUT /admin/sobrecargos/{id}` y aliases con `profile_state`, `validation_status`, `status` y notas.

`RedAviation/AdminControlador::updateSobrecargo` (1312) exige que el usuario ya sea sobrecargo. Para el candidato devuelve 422, confirmado por prueba. Actualiza estado de usuario y metadatos generales del expediente, **no** `crew_application.status`. Por tanto, esas acciones no son aprobación/rechazo de una candidatura nueva.

Además, el frontend captura errores de esa petición y continúa actualizando estado local y mostrando éxito. Este comportamiento impide tratar el mensaje de aprobación de la UI como prueba de persistencia. Se reporta y no se modifica fuera del alcance de esta revisión.

### Camino real de asignación de rol existente

`AdminUsersSection.vue:1985` envía un cambio de rol a `PUT /admin/users/{id}`. La ruta efectiva, comprobada con `route:list`, es `AdministradorControlador::updateUsuario` (174), registrada en `routes/api_v1_admin.php:17` con `auth.token` y `role:admin`.

**Atención a rutas duplicadas:** también existe una declaración en `api_v1_red_aviation.php` hacia `RedAviation/AdminControlador::updateUser`, pero no es la acción efectiva mostrada por el router para esta URI. La conclusión y la prueba corresponden a la ruta efectiva.

`updateUsuario` llama a `Usuario::syncRoles`: asigna `client` y `sobrecargo`, marca sobrecargo como primario en la relación de roles y sincroniza `users.role=client` y `users.operational_role=sobrecargo`. El rol efectivo queda sobrecargo. Solo un administrador autenticado puede ejecutar esta ruta; no comprueba el estado AFAC/KYC ni registra aprobación/rechazo de la candidatura. No se cambió ningún usuario real para demostrarlo: las pruebas usan SQLite en memoria.

### Qué falta exactamente

1. Listar y distinguir candidatos pendientes, con expediente AFAC y acceso seguro a la licencia.
2. Resolver la identidad mediante una decisión confiable; hoy faltan aprobación/rechazo y resultados de comparación/liveness.
3. Conectar una acción administrativa de aprobar/rechazar candidatura al estado persistido, con autor, fecha y motivo.
4. Conceder rol operacional únicamente como consecuencia de aprobación; rechazo conserva cuenta sin ese permiso.
5. Hacer que la UI refleje el resultado real del servidor y no muestre aprobación tras una petición fallida.
6. Cubrir el recorrido de candidatura en web/móvil y administración de extremo a extremo. No hay pruebas existentes específicas de `registerCrew` en los tests móviles ni de envío web de la candidatura; se confirmó la conexión al endpoint por código y el registro AFAC por prueba backend, no por una prueba UI completa.

## VALIDACIONES EJECUTADAS

| Comando | Resultado |
| --- | --- |
| `php artisan test --filter='RegistrationIdentitySecurityTest\|IdentityStorageFlowTest\|ClientAuthSecurityTest\|test_client_registration\|test_passport_registration'` | 26 pasan, 159 aserciones. SQLite en memoria, almacenamiento simulado. |
| `php artisan route:list` | Completado; incluye `/crew/register`, rutas de identidad y rutas administrativas. |
| `php artisan test` | No completado: memoria 128 MB agotada; detalle abajo. |
| `npx vitest run src/__tests__/RegisterView.spec.js -t 'completes client registration'` | 1 pasa, 1 omitida por filtro. |
| `flutter test test/providers/auth_provider_test.dart` | 8 pasan. |
| `git diff --check` en backend, web y móvil | Sin errores. |

No se aumentó memoria ni se cambió configuración del proyecto. Para las pruebas se usaron variables de proceso: `APP_ENV=testing DB_CONNECTION=sqlite DB_DATABASE=:memory: DB_URL= IDENTITY_FILESYSTEM_DISK=private CACHE_STORE=array MAIL_MAILER=array QUEUE_CONNECTION=sync LOG_CHANNEL=stderr`; en la suite completa además `FILESYSTEM_DISK=local AWS_EC2_METADATA_DISABLED=true`.

**Punto exacto de fallo completo:** `vendor/aws/aws-sdk-php/src/data/endpoints.json.php:3`, al cargar el catálogo de endpoints AWS durante la construcción de `RekognitionClient` en `tests/Feature/RegistrationIdentitySecurityTest.php:102`, método `test_good_face_detection_is_not_identity_approval`. Se intentó asignar 20.480 bytes con límite de 134.217.728 bytes. El último grupo completado fue `QuotePreviewAvailabilityBatchTest`.

**Relación con el cambio:** en esta ejecución el agotamiento se dispara dentro de una prueba nueva; no debe etiquetarse este punto como ajeno a los cambios. Esa misma prueba pasa en la ejecución focalizada. Ya había antecedentes de agotamiento de memoria de la suite, pero no se ha aislado cuánto corresponde al consumo acumulado frente al coste del nuevo cliente AWS simulado. No se afirma que la suite completa pase. Antes del agotamiento también se reportaron grupos fallidos: AircraftHoldFlowTest, AircraftRepositioningServiceTest, CrewWorkflowHardeningTest, ModeloRelacionesYNormalizacionTest, OperatorDynamicRegistrationTest y PlataformaVuelosApiTest. No se clasifican todos como baseline sin un análisis individual; la suite abortada no proporciona un cierre completo de fallos.

Los fallos iniciales de la nueva prueba administrativa por fixture de email de administrador fueron corregidos creando un administrador exclusivo de prueba. El resultado final es 26/26. Se actualizó la expectativa antigua de autoaprobación en `PlataformaVuelosApiTest` a identidad pendiente, directamente relacionada con el cambio de contrato.

## BASELINE PREEXISTENTE

- Tests web: los mismos 7 fallos descritos arriba, confirmados contra la ejecución anterior a cambios web. No corregidos.
- Oxlint: los mismos 31 errores; comparación independiente del orden de salida.
- ESLint: los mismos 22 errores; solo cambian números de línea.
- No se reejecutó ni modificó la suite completa web o lint en este cierre; se reutiliza la evidencia de la ejecución anterior y se repitió la prueba de compatibilidad pertinente.

## VEREDICTO

**B) NO AVANZAR A BLOQUE 4.**

La protección de nuevas altas contra autoverificación y escalación pública está comprobada. Los bloques completos no pueden marcarse cerrados: falta el ciclo confiable de aprobación KYC y la revisión/aprobación/rechazo de candidaturas conectada a la concesión del rol. Existe asignación manual administrativa, pero no satisface la cadena requerida. Estos pendientes se reportan sin ampliar la implementación, según la instrucción expresa del usuario.

---

# BLOQUE 2 — KYC

Estado: ✅ CERRADO

Fuente de verdad: `users.identity_verification_status` (`pending`, `approved`, `rejected`) y el último `identity_verifications.status`, actualizados juntos únicamente por revisión administrativa. Los claims de registro y captura facial no aprueban identidad.

Endpoints: `POST /api/v1/admin/users/{user}/identity-review` para aprobar o rechazar; `POST /api/v1/admin/users/{user}/identity-evidence` para completar evidencia pendiente.

Autorización: las rutas están protegidas por `auth.token` y `role:admin`; las pruebas confirman `403` para un cliente.

Trazabilidad: `profiles.tax_data.identity_review` conserva `status`, `reviewed_by`, `reviewed_at` y `rejection_reason`; `registro_auditorias` conserva el evento. La aprobación exige usuario, perfil, expediente de identidad, INE frente/reverso y selfie accesibles en storage privado.

Tests: cliente no autorizado, aprobación con expediente completo, bloqueo individual por falta de frente/reverso/selfie, rechazo con motivo y conservación de trazabilidad.

# BLOQUE 3 — ROLES

Estado: ✅ CERRADO

Flujo candidatura: `/api/v1/crew/register` crea un cliente con `profiles.tax_data.crew_application.status=pending`; `POST /api/v1/admin/users/{user}/crew-review` decide aprobación o rechazo. El detalle administrativo muestra la candidatura y usa este endpoint, refrescando la respuesta real del servidor.

Regla KYC: aprobar candidatura exige `identity_verification_status=approved` e `identity_verified=true`; `pending` y `rejected` devuelven `409` con mensaje claro.

Regla AFAC: se preservan tipo de licencia, formato de número, marcadores OCR AFAC, estado de escaneo y archivo privado. Evidencia inválida bloquea la aprobación con `409`.

Asignación del rol: solo la aprobación de candidatura pendiente ejecuta `syncRoles(['client', 'sobrecargo'], 'sobrecargo')`. El endpoint genérico devuelve `409` si intenta asignar sobrecargo sin revisión. Reintentar una candidatura aprobada devuelve `already_reviewed` y no duplica roles.

Tests: KYC pendiente/rechazado bloquea, KYC aprobado y AFAC válido concede rol, cliente recibe `403`, AFAC inválido bloquea, rechazo no concede rol e idempotencia no duplica.

# FLUJO FINAL

Registro
↓
Identidad pendiente
↓
Revisión Admin
↓
Aprobación KYC
↓
Candidatura operacional
↓
Aprobación Admin
↓
Rol activo

# ARCHIVOS MODIFICADOS

Backend: `app/Http/Controladores/AdminIdentityReviewControlador.php`, `app/Http/Controladores/AdministradorControlador.php`, `routes/api_v1_admin.php`, `tests/Feature/RegistrationIdentitySecurityTest.php`.

Web: `src/features/admin/AdminUsersSection.vue`, `src/__tests__/AdminUsersSection.spec.js` y este informe.

# MIGRACIONES

Ninguna. La trazabilidad se conserva sin destrucción en `profiles.tax_data` y `registro_auditorias`; no se modificaron datos existentes.

# PRUEBAS

- Backend focal: `28` pasan, `388` aserciones (`RegistrationIdentitySecurityTest`, `IdentityStorageFlowTest`, `CrewCanonicalWorkflowTest`), con SQLite en memoria y `Storage::fake`.
- Rutas: `php artisan route:list --path=api/v1/admin/users` confirma `identity-review`, `identity-evidence`, `crew-review` y `crew-license`.
- Web: `npx vitest run src/__tests__/AdminUsersSection.spec.js`: `6` pasan.
- Web: `npm run build`: pasa.
- `git diff --check`: pasa en backend y web.

# FALLOS PREEXISTENTES

No se tocaron los 7 fallos web ni los diagnósticos de Oxlint (31) y ESLint (22) ya documentados. La suite completa de backend no se ejecutó: conserva el límite de 128 MB y puede agotarse al cargar el catálogo AWS; las pruebas focalizadas usan storage falso y no aumentan memoria.

# RIESGOS RESTANTES

No se revisaron ni modificaron usuarios o roles históricos. La revisión gobierna únicamente aprobaciones administrativas futuras. El directorio histórico de sobrecargos no es una fuente de candidatos pendientes; la revisión se realiza desde el detalle administrativo de usuario, donde se expone el expediente real.

VEREDICTO:

A) BLOQUES 2 Y 3 CERRADOS — LISTO PARA BLOQUE 4
