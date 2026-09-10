# Evidencias postflight: implementación y validación

Estado general: **LISTO en entorno local de validación**. Implementación y pruebas integradas completadas con uploads del controlador real, SQLite en memoria y storage de pruebas. Móvil y Admin visualizaron los mismos tres archivos generados por esos uploads. No se modificaron operaciones reales ni se desplegaron cambios. La validación local usa snapshots del workflow autenticado y sirve los bytes persistidos mediante un servidor de pruebas; no equivale a una sesión de producción.

## Auditoría y contrato

- Fuente persistida: columna JSON `checklist_items.evidence_files`, casteada a array por `ChecklistItem`.
- Relación: `operations.id` → `checklists.operation_id` → `checklist_items.checklist_id` → `evidence_files`.
- `crew_operation_incidents.crew_operation_id` referencia `operations.id`; sus archivos de incidencia son distintos de las evidencias de checklist.
- Slots: `preflight/catering_received` → Catering; `preflight/baggage_secured` → Equipaje; `postflight/cabin_condition` → Cabina final. Mostrar las tres juntas para el cierre no cambia sus fases.
- Archivo persistido: `storage_disk`, `file_path`, `file_type`, `original_name`, `size`, `uploaded_at`, `uploaded_by`. No existe ID independiente obligatorio del archivo; checklist e item aportan su contexto.
- El serializador añade `file_url`. Para S3 usa `temporaryUrl` con vigencia de 30 minutos; devuelve null si no puede firmar. No se construyeron URLs públicas ni se cambió el almacenamiento.
- Workflow móvil: `GET /api/v1/sobrecargo/operations/{operationId}/workflow`.
- Workflow Admin: `GET /api/v1/admin/crew/operations/{operationId}/workflow`.
- Ambos usan `CrewOperationWorkflowService`, que carga `checklists.items`. No hizo falta modificar backend.
- El endpoint Admin existente exige asignación de sobrecargo y rechaza asignaciones canceladas/rechazadas. En esos casos la nueva sección muestra error recuperable, no un falso “Sin evidencia”.

## Cambios móvil

Proyecto `2Movilskyg`:

- `lib/screens/sobrecargo/crew_evidence.dart`.
- `test/screens/sobrecargo/crew_evidence_test.dart`.
- `test/screens/sobrecargo/crew_evidence_backend_integration_test.dart`.

El parser conserva mapas y listas y selecciona el checklist más reciente por fase, igual que Admin; ya no depende del orden de la respuesta. Se conserva el contador de slots con archivos persistidos (path + disk), y la recarga del workflow después del upload. La pantalla recupera el workflow al abrirse; no necesita el archivo local para mostrar evidencia guardada.

El botón **Actualizar evidencias** permite renovar URLs mediante el mismo reload del workflow sin subir archivos. La tarjeta ahora muestra **Completado**, thumbnail, nombre y **Ver evidencia**. El visor modal permite ampliar, volver/cerrar y muestra carga y fallback de red. URL nula o MIME no visualizable produce fallback; el botón se deshabilita sin URL usable. Varios archivos pueden desplazarse dentro de la tarjeta. No se cambiaron selección de cámara/galería, endpoint, multipart, validaciones ni lógica de upload.

## Cambios Admin

- `src/features/admin/AdminIncidenciasPage.vue`: integra la sección con `selectedIncident.crew_operation_id`.
- `src/features/admin/AdminClosureEvidence.vue`: carga workflow, valida `operation_id`, descarta respuestas tardías, reinicia visor al cambiar operación, muestra tres slots y contador, miniaturas, nombres y modal nativo con operación, fecha y cierre. El botón Actualizar evidencias recupera URLs firmadas nuevas. Una imagen fallida muestra fallback y oculta su botón hasta actualizar.
- `src/__tests__/AdminClosureEvidence.spec.js`: contadores, modal/cierre, cambio de operación, respuestas cruzadas, URL nula, MIME no imagen, PNG, varios archivos y recarga.

La sección pertenece a la operación seleccionada, no a cada archivo de incidencia. Pasar entre incidencias de la misma operación conserva esa identidad. CSS define tres columnas, dos hasta 1200 px y una hasta 600 px. Se validaron en Chrome los anchos 1440, 1200, 1024, 900, 768, 600 y 390, con imágenes decodificadas y sin overflow del documento.

## Pruebas ejecutadas

- Backend `php artisan test --filter=CrewEvidenceTest`: **8 PASS / 90 aserciones**, SQLite en memoria. Incluye persistencia, append, errores de storage/metadata y permisos; backend sin cambios.
- `dart format`: aplicado a los dos archivos móviles.
- `flutter analyze`: sin errores nuevos; un aviso informativo existente `avoid_print` en `audit/mi_vuelo/helpers_order.dart:76` hace que el comando reporte una incidencia.
- `flutter test`: **213 PASS**, incluyendo 26 pruebas unitarias de evidencias y una prueba integrada con imágenes del backend (contador 0–3, selección local, upload + refresh, reapertura, reemplazo, modal, fallback y URL nula).
- Admin específico: **13 PASS**.
- `npm run build`: PASS, advertencia de bundles grandes.
- `npm run test --if-present`: ejecución completa final **500 PASS / 7 FAIL**. Los mismos siete fallos se reprodujeron en copia limpia de HEAD: CrewEvidence (3), CrewNotificationCenter (1), PortalClienteVista (1), RegisterView (1), providerFlightNotifications (1). No se modificaron esos módulos fuera de alcance.
- `npm run lint --if-present`: 31 errores en archivos ajenos al cambio; el script se detuvo en oxlint. Oxlint y ESLint ejecutados directamente sobre los tres archivos Admin pasan.
- `git diff --check`: PASS en web y móvil.

Chrome comprobó respuestas HTTP 403 y 404 reales del servidor de pruebas y la recuperación con URLs renovadas. No se esperaron 30 minutos de expiración AWS; se comprobó el mecanismo de refresh. Flutter comprobó decodificación real, visor y persistencia al reabrir.

## Comprobación real

Consulta de solo lectura a la base configurada: operación **46**.

- Catering: 1 archivo persistido; URL con firma AWS; GET parcial respondió **206**.
- Equipaje: 0 archivos.
- Cabina final: 0 archivos.

No se alteró esta operación. El recorrido 0/3 → 3/3 se completó en la operación aislada creada por `scripts/postflight/PostflightIntegrationTest.php`:

1. Login real de prueba para tripulación y Admin.
2. Upload por el controlador existente a storage de pruebas, persistiendo JSON en SQLite.
3. GET de ambos workflows: identidad de `operation_id` y `checklists` verificada, 47 aserciones PASS. Rol crew rechazado por endpoint Admin; operación B sin evidencia de A.
4. AdminIncidenciasPage consume los snapshots del endpoint Admin y las imágenes subidas, mediante servidor local de pruebas. Chrome: imágenes decodificadas, contador 0–3, los tres modales/cierre, siete tamaños, cambio de operación, dos incidencias de una misma operación, 403/404 y recuperación PASS.
5. CrewEvidencePanel consume snapshots del endpoint móvil y las mismas imágenes: contador 0–3, Completado, imágenes decodificadas dentro de los tres visores, cerrar y reabrir con 3/3 PASS.

| Slot | Móvil integrado local | Admin integrado local |
| --- | --- | --- |
| Catering | PASS | PASS |
| Equipaje | PASS | PASS |
| Cabina final | PASS | PASS |

Reproducción: [scripts/postflight/README.md](../scripts/postflight/README.md). Capturas y resultados se generan en `/private/tmp/postflight-browser`; los PNG negros son los archivos generados por Laravel para el test, con decodificación comprobada, no placeholders de error.

## Restricciones verificadas

- Web Crew y `/renta/crew/asignaciones` NO modificados.
- Upload Web NO modificado.
- Lógica de upload móvil NO modificada.
- Backend y BD NO modificados.
- No se creó una segunda fuente, tabla ni copia de archivos de evidencia.
- Móvil y Admin consumen los archivos persistidos en el mismo contrato de backend.
