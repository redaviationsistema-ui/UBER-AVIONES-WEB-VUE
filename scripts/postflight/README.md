# Validación local de evidencias de cierre

Esta prueba usa SQLite en memoria, uploads reales del controlador a `Storage::fake('s3')`, workflows autenticados de móvil/Admin y las mismas imágenes persistidas en ese storage de pruebas. No modifica operaciones reales. El servidor de UI sirve snapshots de esas respuestas; no sustituye una sesión contra producción.

1. Desde el proyecto backend, ejecutar (sustituir FRONTEND por su ruta absoluta):

   ```sh
   vendor/bin/phpunit --configuration phpunit.xml 'FRONTEND/scripts/postflight/PostflightIntegrationTest.php'
   ```

   Genera `/private/tmp/postflight-fixture/workflow.json` y las imágenes de prueba. Comprueba los cuatro contadores, contrato idéntico, permisos de rol y aislamiento de otra operación.

2. Desde el frontend, instalar Playwright solamente en la carpeta temporal e iniciar el servidor:

   ```sh
   npm install --prefix /private/tmp/postflight-browser --no-audit --no-fund playwright
   node scripts/postflight/server.mjs
   ```

3. En otra terminal del frontend:

   ```sh
   node scripts/postflight/browser.mjs
   ```

   Usa Chrome instalado en `/Applications/Google Chrome.app`. Comprueba el componente real AdminIncidenciasPage en `/renta/admin/incidencias`, sus estilos globales, miniaturas decodificadas, siete anchos, los tres visores, 403/404, renovación y cambios de operación/incidencia. Los enlaces del servidor de pruebas varían al refrescar, simulando la renovación del firmante; los bytes siguen siendo los del upload. Genera capturas y `result.json` en `/private/tmp/postflight-browser`.

4. Desde móvil, con el servidor aún activo y después del test browser:

   ```sh
   flutter test --dart-define=POSTFLIGHT_FIXTURE=/private/tmp/postflight-fixture/workflow.json test/screens/sobrecargo/crew_evidence_backend_integration_test.dart
   ```

   Comprueba 0–3, Completado, los tres visores con `RawImage.image` decodificada, cierre y reapertura. Sin el `dart-define`, esa prueba se omite; las pruebas normales no necesitan servidor.

Los fixtures contienen exclusivamente datos de pruebas. Las capturas negras corresponden a las imágenes PNG generadas por `UploadedFile::fake()->image`, no a imágenes fallidas: se verifica `naturalWidth`/decodificación en ambas interfaces.
