## Archivos listos

- `database/migrations/2026_05_05_000000_create_company_documents_table.php`
- `app/Models/CompanyDocument.php`
- `app/Http/Controllers/ProviderCompanyDocumentController.php`
- rutas `POST /api/provider/company/documents` y `POST /api/proveedor/empresa/documentos`

## Pasos en tu backend Laravel

1. Copia los archivos desde esta carpeta a tu proyecto Laravel real.
2. Ejecuta:

```bash
php artisan migrate
php artisan storage:link
```

3. Agrega las rutas en `routes/api.php`.
4. Si tu app usa otro guard o middleware, cambia `auth:sanctum`.

## Respuesta esperada por tu frontend

```json
{
  "success": true,
  "document": {
    "id": 1,
    "provider_id": 2,
    "document_name": "permiso-operador.pdf",
    "file_name": "permiso-operador.pdf",
    "file_path": "providers/2/company-documents/archivo.pdf",
    "mime_type": "application/pdf",
    "file_size_bytes": 248123,
    "status": "pending"
  }
}
```
