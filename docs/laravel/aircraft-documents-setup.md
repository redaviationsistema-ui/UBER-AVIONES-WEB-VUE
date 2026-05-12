## Archivos listos

- `database/migrations/2026_05_09_000000_create_aircraft_documents_table.php`
- `app/Models/AircraftDocument.php`
- `app/Http/Controllers/ProviderAircraftDocumentController.php`
- rutas `POST /api/provider/aircraft/{id}/documents`, `POST /api/proveedor/aeronaves/{id}/documentos` y `POST /api/operator/aircraft/{id}/documents`

## Regla de negocio

La carga de documentos NO debe depender de que el proveedor o la aeronave ya esten aprobados.

Permitido:

- proveedor en `pending`
- proveedor en `blocked`
- aeronave en `draft`
- aeronave en `pending_review`
- aeronave en `blocked`

La aprobacion debe usarse para:

- publicar aeronaves al cliente
- entrar a matching
- habilitar visibilidad comercial

No debe usarse para:

- subir PDF o imagen al expediente tecnico
- completar documentacion faltante
- corregir observaciones de admin

## Pasos en tu backend Laravel

1. Copia los archivos desde esta carpeta a tu proyecto Laravel real.
2. Ejecuta:

```bash
php artisan migrate
php artisan storage:link
```

3. Agrega las rutas en `routes/api.php`.
4. Si tu app usa otro guard o middleware, cambia `auth:sanctum`.

## Nota importante

Si hoy tu backend responde `Proveedor no aprobado`, esa validacion debe quitarse del endpoint de documentos.

El `store()` de documentos solo valida:

- que el usuario autenticado tenga `provider_id`
- que la aeronave pertenezca a ese `provider_id`
- que exista al menos un archivo valido

No valida estado de aprobacion.

## Respuesta esperada por tu frontend

```json
{
  "success": true,
  "uploaded": 1,
  "documents": [
    {
      "id": 1,
      "provider_id": 2,
      "aircraft_id": 7,
      "document_type": "maintenance_sticker",
      "document_name": "QT26CESS041.pdf",
      "file_name": "QT26CESS041.pdf",
      "file_path": "providers/2/aircraft-documents/7/QT26CESS041.pdf",
      "file_url": "/storage/providers/2/aircraft-documents/7/QT26CESS041.pdf",
      "mime_type": "application/pdf",
      "file_size_bytes": 1025024,
      "status": "pending"
    }
  ]
}
```

## Descargar documentos privados

Si los documentos viven en S3 privado, no abras `file_url` directo en el navegador. S3 respondera `AccessDenied`.

Agrega una ruta autenticada en Laravel:

```php
Route::get('/admin/aircraft-documents/{documentId}/download', [ProviderAircraftDocumentController::class, 'downloadAdmin']);
```

El frontend admin ya intenta esa ruta. Si aparece `route api/v1/... could not be found`, el backend desplegado todavia no tiene registrada la ruta de descarga.
