# Notificación de vuelo confirmado del proveedor

## Implementación

Se reutilizan `notifications`, Echo/Pusher, el canal privado `provider.{providerId}`, el polling de 10 segundos y los estilos del portal. No se añaden migraciones ni se cambia la semántica de Archivadas o Flight Queue.

`ProviderFlightNotificationService::updateConfirmedPayment()` bloquea y lee la solicitud dentro de la transacción del pago. Solo una transición de no pagado a `paid`, con workflow `vuelo confirmado`/`flight_confirmed`, crea `flight.confirmed`. Los dos handlers del webhook y `finalizeSuccessfulPayment()` convergen ahí. Un Checkout completado pero no liquidado no confirma el vuelo.

La fila y su payload se guardan antes de registrar `DB::afterCommit`. El callback se ejecuta después de la transacción exterior del webhook. Un rollback elimina también la notificación y el callback. Si Pusher falla después del commit, el error queda reportado y la fila sigue disponible por HTTP; no se revierte un pago ya confirmado.

## Identidad y destinatario

- `provider:{providerId}:flight:{flightRequestId}:request-created`
- `provider:{providerId}:flight:{flightRequestId}:flight-confirmed`

La misma clave viaja en `idempotency_key` y `payload.event_key`, tanto en BD como en Echo. `createOrFirst` utiliza el índice único ya existente y protege los reintentos concurrentes mediante el comportamiento del framework. El payload incluye `notification_id` después de persistir.

Hay una sola fila nueva por proveedor/solicitud/tipo. **La lectura es compartida por proveedor**: cualquier usuario cuyo proveedor resuelto coincida puede leerla. Las notificaciones personales/legacy mantienen el acceso por usuario. La columna `user_id` conserva la referencia al propietario cuando existe, pero no define la autorización de estos eventos compartidos.

Para confirmación se prioriza asignación, luego reserva, luego un único proveedor con match aceptado. Se excluyen proveedores con matches rechazados sin aceptación vigente. Una discrepancia de reserva queda registrada. Si no existe destinatario definitivo, se rechaza esa actualización transaccional con error explícito; requiere corregir los datos, no enviar a un proveedor histórico.

El rematching excluye proveedores que ya participaron y despacha el aviso existente después del commit para los nuevos elegibles. Los reintentos no crean otra fila para el mismo destinatario.

## Frontend

El centro `PortalOperadorAlertas` se comparte entre dashboard y Solicitudes. La confirmación tiene banner propio con ruta y enlace al detalle. Abrir utiliza el endpoint de detalle autorizado; la query `request` se hidrata aunque la solicitud no esté en la primera página. Desde el detalle se continúa por el flujo habitual a Liberación.

HTTP carga todas las páginas de los dos tipos soportados. El contador corresponde a los eventos lógicos soportados no leídos, incluyendo aquellos cuyo aviso inicial ya no se muestra por haber salido de Pendientes. `flight.confirmed` permanece en el centro independientemente de Coordinación/Tracking. Leer reduce el contador y retira el banner de confirmación.

Echo y HTTP se mezclan por clave lógica; HTTP enriquece la entrada existente, no dispara efectos. Los registros recuperados tienen `source: http`; los eventos en vivo `source: echo`. La lectura solo se refleja como exitosa después de la respuesta del servidor. Se conservan datos ante un error de refresco y se reintenta con el polling.

La coordinación de efectos usa memoria, localStorage y Web Locks cuando están disponibles. La notificación nativa utiliza tag estable, captura excepciones y abre el vuelo al hacer clic. Sin permiso del navegador no falla el portal. El sonido requiere una interacción previa.

## Endpoints de lectura

- `PATCH /api/v1/notifications/{id}/read`
- `PATCH /api/v1/notifications/read-all`, con `types` para limitar la operación a los dos tipos.
- `GET /api/v1/proveedor/notificaciones?types[0]=flight.request.created&types[1]=flight.confirmed&per_page=100&page=1`

El servidor aplica el mismo ámbito de autorización a listado, contador y lectura. No se creó una ruta duplicada.

## Seguridad

`ProveedorControlador::acceptRequest()` y `rejectRequest()` devuelven 403 cuando no hay asignación al proveedor ni match válido suyo (`pending`, `sent_to_provider`, `accepted`). Las pruebas verifican rechazo entre proveedores y aceptación con match pendiente.

## Validación manual completa (procedimiento; no ejecutado contra Stripe/Pusher desplegados)

Usar un entorno de pruebas con las migraciones existentes aplicadas, Pusher configurado y Stripe en modo test. Si la cola no es síncrona, debe estar atendida por un worker.

1. Crear cliente y una solicitud con aeronave/proveedor elegibles.
2. Abrir el dashboard del proveedor. Confirmar una alerta `flight.request.created`; recuperar la misma por polling y comprobar que no se duplica.
3. Aceptar la solicitud, obtener la reserva y completar contrato/firma mediante el flujo actual de DocuSign de pruebas.
4. Abrir dashboard y Solicitudes en dos pestañas; permitir notificaciones e interactuar con la página para habilitar audio.
5. Pagar con Stripe de pruebas y entregar el webhook firmado al entorno.
6. Consultar `flight_requests`: `payment_status=paid`, `workflow_status=vuelo confirmado`.
7. Consultar `notifications` por la clave exacta de confirmación: debe existir una fila, `type=flight.confirmed`, proveedor definitivo y `read_at=null`.
8. Verificar banner, contador, alerta, toast, sonido y notificación nativa. En navegador con Web Locks, comprobar una sola emisión de efectos entre pestañas.
9. Reenviar Checkout, luego PaymentIntent, y ejecutar sincronización manual: debe seguir existiendo una fila y no repetirse los efectos.
10. Abrir la alerta: debe seleccionar la solicitud correcta, mostrar estado actualizado y permitir continuar hacia Liberación.
11. Marcar leída, refrescar ambas pestañas y comprobar `read_at` persistido y contador actualizado.
12. Crear otra alerta y utilizar Leer todas; verificar el endpoint bulk y persistencia tras recargar.
13. Bloquear temporalmente Echo, confirmar otra solicitud y verificar recuperación HTTP sin sonido, toast ni aviso nativo histórico.
14. Probar permiso denegado y apertura desde el aviso nativo.
15. Con otro proveedor, intentar aceptar/rechazar la solicitud sin asignación/match: debe responder 403.
16. Rechazar una solicitud que provoque rematching: solo el nuevo proveedor elegible debe recibir el aviso.

## Comprobaciones automatizadas

- Backend: pruebas de transición, idempotencia, commit/rollback, caída de Pusher, destinatario, lectura, autorización, rematching y convergencia de Stripe.
- Frontend: 30 pruebas focalizadas pasan (incluyen 10 nuevas de integración/efectos y 20 regresiones existentes).
- Suite completa frontend: 450 pasan y 3 fallan en Registro, PortalClienteVista y CrewNotificationCenter. Los mismos tres fallos se reprodujeron sobre HEAD sin estos cambios.
- Lint global: 31 errores preexistentes, reproducidos en HEAD; lint de archivos modificados pasa.
- Build de producción pasa; conserva advertencia de chunks grandes.
- PHP modificado: sintaxis válida. `git diff --check`: limpio en ambos proyectos.

## Límites de la validación

No se ejecutaron cobros reales, firma externa ni entrega a un navegador por Pusher de producción. Tampoco se aplicaron migraciones ni se hizo despliegue. La concurrencia se protege con bloqueo de fila e índice único; las pruebas locales usan SQLite en memoria y no sustituyen una prueba concurrente contra PostgreSQL desplegado.

Sin Web Locks queda la coordinación de localStorage y el tag estable; una carrera extrema entre pestañas puede duplicar sonido/toast. Con storage bloqueado, solo queda memoria por pestaña y tag nativo. Si falla Pusher, el mecanismo de recuperación garantizado por esta implementación es el polling visible, no un reenvío posterior de efectos nativos.

Las filas legacy duplicadas no se borran ni migran: se reconcilian visualmente por identidad cuando contienen la referencia al vuelo. Los fallos generales ya existentes deben resolverse antes de certificar todo el sistema para producción.

## Archivos modificados

| Archivo | Cambio | Razón |
|---|---|---|
| [app/Events/NewFlightRequestCreated.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Events/NewFlightRequestCreated.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Http/Controladores/NotificacionControlador.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Http/Controladores/NotificacionControlador.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Http/Controladores/ProveedorControlador.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Http/Controladores/ProveedorControlador.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Http/Controladores/RedAviation/ClienteControlador.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Http/Controladores/RedAviation/ClienteControlador.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Http/Controladores/SolicitudVueloControlador.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Http/Controladores/SolicitudVueloControlador.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Http/Controladores/StripePagoControlador.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Http/Controladores/StripePagoControlador.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Http/Controladores/StripeWebhookControlador.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Http/Controladores/StripeWebhookControlador.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Modelos/Notificacion.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Modelos/Notificacion.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Servicios/RedAviation/ProviderFlightRequestNotificationService.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Servicios/RedAviation/ProviderFlightRequestNotificationService.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Servicios/ReintentoCoincidenciaSolicitudServicio.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Servicios/ReintentoCoincidenciaSolicitudServicio.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [tests/Feature/PlataformaVuelosApiTest.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/tests/Feature/PlataformaVuelosApiTest.php>) | Pruebas de flujo y regresión | Verificar comportamiento y evitar regresiones |
| [tests/Feature/StripeFlightCheckoutFlowTest.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/tests/Feature/StripeFlightCheckoutFlowTest.php>) | Pruebas de flujo y regresión | Verificar comportamiento y evitar regresiones |
| [tests/Feature/StripeWebhookClientAuditTest.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/tests/Feature/StripeWebhookClientAuditTest.php>) | Pruebas de flujo y regresión | Verificar comportamiento y evitar regresiones |
| [app/Events/FlightConfirmed.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Events/FlightConfirmed.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [app/Servicios/RedAviation/ProviderFlightNotificationService.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/app/Servicios/RedAviation/ProviderFlightNotificationService.php>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [tests/Feature/ProviderFlightNotificationsTest.php](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/tests/Feature/ProviderFlightNotificationsTest.php>) | Pruebas de flujo y regresión | Verificar comportamiento y evitar regresiones |
| [src/features/operator/portal/portalOperador.nucleo.js](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/portalOperador.nucleo.js>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [src/features/operator/portal/portalOperador.utilidadesSolicitudes.js](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/portalOperador.utilidadesSolicitudes.js>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [src/features/operator/portal/secciones/PortalOperadorDashboardSection.vue](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/secciones/PortalOperadorDashboardSection.vue>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [src/features/operator/portal/secciones/PortalOperadorSolicitudesSection.vue](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/secciones/PortalOperadorSolicitudesSection.vue>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [src/features/operator/portal/secciones/plantillas/PortalOperadorDashboardSection.html](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/secciones/plantillas/PortalOperadorDashboardSection.html>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [src/features/operator/portal/secciones/plantillas/PortalOperadorSolicitudesSection.html](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/secciones/plantillas/PortalOperadorSolicitudesSection.html>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [src/__tests__/providerFlightNotifications.spec.js](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/__tests__/providerFlightNotifications.spec.js>) | Pruebas de flujo y regresión | Verificar comportamiento y evitar regresiones |
| [src/__tests__/providerNotificationEffects.spec.js](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/__tests__/providerNotificationEffects.spec.js>) | Pruebas de flujo y regresión | Verificar comportamiento y evitar regresiones |
| [src/features/operator/portal/providerNotificationEffects.js](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/providerNotificationEffects.js>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
| [src/features/operator/portal/secciones/PortalOperadorAlertas.vue](</Users/redaviation/Documents/SKYGRUP/UBERAVIONES/FRONTEND UBER-AVIONES-WEB-VUE/src/features/operator/portal/secciones/PortalOperadorAlertas.vue>) | Notificación, presentación, persistencia o integración del flujo | Completar el flujo compartido de confirmación |
