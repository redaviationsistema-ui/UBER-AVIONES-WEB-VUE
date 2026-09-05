# Validación de notificaciones del proveedor — 2026-09-05

## 1. Entorno

- Frontend: https://redskyg.com/renta — GET público 200.
- Backend: https://uber-aviones.onrender.com — GET `/up` 200.
- Las verificaciones HTTP fueron consultas públicas sin sesión. No se ejecutaron pagos, webhooks manuales, migraciones ni publicaciones.

## 2. Deploy

| Proyecto | Git | Versión desplegada |
| --- | --- | --- |
| Backend | HEAD `515f494`, limpio, coincide con `refs/heads/main` consultado en origin | NO ACREDITADO: `/up` no identifica commit |
| Frontend | HEAD `acd970e` coincide con main remoto; implementación y ajustes pendientes de commit | Nuevo build NO DESPLEGADO por esta sesión; publicación actual distinta |

HTML público: `/renta/assets/index-CfdCFSKG.js`. Build local final: `/renta/assets/index-tar9axXN.js`. El módulo público `RoleView-HW9ZHGqX.js` no contiene el anclaje ni las clases del drawer nuevo. La discrepancia de assets no permite atribuir al servidor los cambios locales.

`render.yaml` declara `autoDeployTrigger: commit`, pero no acredita la configuración efectiva del servicio. No se encontró un mecanismo de publicación del frontend en los archivos revisados. No se hicieron commits ni push: el usuario los condicionó al proceso autorizado, aún sin acreditar.

## 3. API

**Corregido localmente:** `.env.production` heredaba `/api/v1`, origen localhost y broadcast auth localhost de `.env`. Se definieron explícitamente API y origen Render y `https://uber-aviones.onrender.com/broadcasting/auth`. Desarrollo conserva su configuración. Vite sólo utiliza su proxy durante desarrollo.

El build final contiene las URLs absolutas de Render. El asset público también referencia Render, pero eso no prueba su configuración autenticada completa ni que incluya esta implementación.

- GET real usado por `loadRealtimeNotifications`: `/api/v1/proveedor/notificaciones`.
- Lectura: PATCH `/api/v1/notifications/{id}/read`.
- Lectura conjunta: PATCH `/api/v1/notifications/read-all`, filtrada a los dos tipos admitidos.
- CORS público: OPTIONS 204, origen permitido exactamente `https://redskyg.com`, autorización y content-type admitidos, credenciales permitidas.
- AUTH: GET de ambos listados sin token devuelve 401. Autenticación con cuenta real: NO ACREDITADA.
- El cliente adjunta Bearer token; broadcasting usa `auth.token`. No se depende de una sesión Sanctum para este flujo.

## 4. Pusher

- Configuración local backend: conexión pusher; ID, key y secret presentes, sin publicar valores.
- Frontend/backend locales: misma app key y cluster `us2`.
- Fallback del código de Echo: `mt1`; no se usa cuando está configurado `us2`.
- Variables efectivas de Render: NO ACREDITADAS. Su blueprint no declara las variables Pusher; podrían existir en el panel del servicio.
- POST `/broadcasting/auth` sin token: 401. Su preflight CORS: 204 y origen correcto.
- `routes/channels.php` compara `resolvedProviderId()` con el canal solicitado. Prueba autenticada canal propio/ajeno en producción: NO EJECUTADA.
- Entrega real Pusher: NO ACREDITADA.

## 5. BD

El modelo y las migraciones locales cubren `user_id`, `provider_id`, `type`, `title`, `message`, `payload`, `data`, `read_at`, `idempotency_key` y timestamps. Existe índice único de idempotencia.

No se creó otra migración. La migración `2026_07_19_000000_harden_crew_historical_foreign_keys.php` añade la clave y cambia también claves foráneas de otras tablas. Antes de ejecutar `php artisan migrate --force` en Render hay que obtener `php artisan migrate:status` y revisar todas las pendientes; no se consultó la BD remota ni se ejecutó ese comando.

Esquema desplegado, índice único y read_at: NO ACREDITADOS.

## 6. Nueva solicitud real

Código: `ProviderFlightRequestNotificationService` utiliza el servicio de notificaciones que persiste el evento por proveedor y emite después del commit. Pruebas locales cubren persistencia, idempotencia y rematching.

Solicitud de prueba desplegada, fila real, Echo, campana, drawer y incremento del badge: NO ACREDITADOS. No se generó una solicitud en producción.

## 7. Vuelo confirmado real

Código: transición a paid y vuelo confirmado dentro de transacción; proveedor definitivo; fila única; emisión después del commit. Los tests cubren eventos Stripe, firma inválida, orden de eventos y rechazo de identificadores incompatibles.

Stripe local: claves TEST y webhook secret presente. Stripe efectivo de Render: NO DETERMINADO. No se realizó checkout ni se envió un webhook.

Fila real, Echo, campana, drawer, toast, sonido y Browser Notification: NO ACREDITADOS en el entorno desplegado.

## 8. Leído

Modelo actual: **lectura compartida por proveedor** para estos eventos. No se cambió el modelo.

El frontend actualiza lectura tras respuesta exitosa. Backend restringe visibilidad y actualiza `read_at`. Los tests locales validan persistencia y read-all. Recarga y lectura en BD real: NO ACREDITADAS.

## 9. Duplicados

- Echo + HTTP: CONTROLADOS EN PRUEBAS LOCALES por identidad lógica; HTTP no dispara los efectos en vivo.
- Stripe: CONTROLADOS EN PRUEBAS LOCALES por transición e índice único.
- Varias pestañas: Web Locks y almacenamiento compartido controlan efectos; sin Web Locks no se acredita exclusión atómica entre pestañas.
- Repetición de webhooks y pestañas del sitio desplegado: NO ACREDITADA.

## 10. Mocks

No se encontró inyección de notificaciones ficticias en el runtime de la campana. La colección arranca vacía y se alimenta por HTTP/Echo. Las fixtures permanecen en tests. Los títulos de tipos y etiquetas de estado son textos de interfaz, no eventos falsos.

El drawer muestra hasta seis registros reales recientes; badge calculado sobre no leídas, cero sin badge. Leída sigue siendo el mismo evento. Browser tags ajustados a `request-created-{id}` / `flight-confirmed-{id}`.

## 11. Pruebas

| Comando / comprobación | Resultado |
| --- | --- |
| `php artisan test --filter='ProviderFlightNotificationsTest\|StripeFlightCheckoutFlowTest\|StripeWebhookClientAuditTest'` con SQLite :memory: y APP_ENV testing | 25 PASS, 148 assertions |
| `php -l` servicio de notificaciones y controlador de lectura | PASS |
| `npx vitest run src/__tests__/operatorNotificationDrawer.spec.js src/__tests__/providerFlightNotifications.spec.js src/__tests__/providerNotificationEffects.spec.js src/__tests__/operatorPortalRequestFilters.spec.js` | 33 PASS |
| ESLint de los componentes, núcleo, utilidades, efectos y tests afectados | PASS |
| `npm run build` | PASS; advertencia de chunks superiores a 500 kB |
| `git diff --check` en ambos repositorios | PASS |
| HTTP público: frontend, health, CORS, protección sin sesión | PASS, alcance limitado descrito arriba |
| E2E real autenticado, BD remota y Pusher | NO EJECUTADO |

No se corrió toda la suite del proyecto ni se acredita ausencia de fallas ajenas a estas pruebas.

## 12. Veredicto final

**NOTIFICACIONES REALES EN PRODUCCIÓN: NO ACREDITADAS.** No se puede afirmar que funcionen ni que fallen a partir de respuestas públicas sin sesión.

- Campanita con datos reales, nueva solicitud y vuelo confirmado desplegados: NO ACREDITADOS.
- Pusher en producción: NO ACREDITADO.
- Polling de respaldo: SÍ en código, cada 10 segundos en dashboard/solicitudes/release-provider visibles; ligado al refresco de solicitudes. No se acredita recuperación continua ante todos los fallos de ese refresco.
- Lectura persistente: SÍ en pruebas locales, NO ACREDITADA remotamente.
- Listo para añadir correo tras validación real: NO.

Pendiente de acceso al proceso de despliegue frontend, servicio Render y cuentas cliente/proveedor de prueba. Se solicitó indicar dónde está disponible ese acceso, sin compartir secretos en la conversación. Tras ello: acreditar el deploy, verificar variables y migraciones, ejecutar nueva solicitud y pago exclusivamente Stripe TEST, y comprobar BD, canal, recarga, lectura y duplicados.
